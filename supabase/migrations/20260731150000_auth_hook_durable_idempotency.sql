-- ============================================================================
-- Durable idempotency for the Supabase "Send SMS" auth hook.
--
-- The hook currently dedupes deliveries in a per-process Map. That survives nothing:
-- a restart, a deploy, a crash, or a second instance all lose it, and a Supabase retry
-- that lands anywhere else sends a second WhatsApp message to a real person.
--
-- This table is the durable replacement. It is deliberately hostile to PII:
--   * no OTP
--   * no phone number
--   * no raw body
--   * only a SHA-256 digest of the exact signed bytes
--
-- The digest is a comparison token. It is never rendered, and it cannot be reversed into a
-- phone number without also knowing the OTP and the rest of the payload.
--
-- Access is service-role only. RLS is enabled with no policies at all, so anon and
-- authenticated cannot read or write a single row even by accident; the RPCs below are
-- SECURITY DEFINER and have execute revoked from every role except service_role.
--
-- NOT APPLIED ANYWHERE by the change that introduces it. Apply deliberately.
-- ============================================================================

-- ── Table ───────────────────────────────────────────────────────────────────

create table if not exists public.auth_hook_deliveries (
  webhook_id           text primary key,
  payload_digest       text        not null,
  state                text        not null,
  owner_instance       text,
  provider_message_id  text,
  attempt_count        integer     not null default 0,
  last_error_code      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  started_at           timestamptz,
  completed_at         timestamptz,
  lease_expires_at     timestamptz,
  expires_at           timestamptz not null,

  -- RECEIVED is reserved for a future two-phase claim. Nothing writes it today; the hook
  -- inserts straight into IN_FLIGHT because a row that exists but was never dispatched
  -- would be indistinguishable from a crash.
  constraint auth_hook_deliveries_state_check
    check (state in ('RECEIVED', 'IN_FLIGHT', 'SUCCEEDED', 'FAILED', 'UNCERTAIN')),

  constraint auth_hook_deliveries_attempts_check
    check (attempt_count >= 0)
);

comment on table public.auth_hook_deliveries is
  'Durable delivery ledger for the Supabase Send SMS auth hook. Never stores OTP codes, '
  'phone numbers or raw request bodies — only a digest of the signed payload.';

comment on column public.auth_hook_deliveries.payload_digest is
  'SHA-256 of the exact bytes that were signature-verified. Compared, never emitted.';

comment on column public.auth_hook_deliveries.state is
  'IN_FLIGHT: dispatch started. SUCCEEDED: Meta accepted and returned a wamid. '
  'FAILED: Meta explicitly refused before accepting, so a bounded retry is safe. '
  'UNCERTAIN: timeout, network ambiguity or an expired lease — a message may or may not '
  'have gone out, so this webhook-id is never dispatched again.';

comment on column public.auth_hook_deliveries.lease_expires_at is
  'While this is in the future, another instance must not take over the dispatch.';

-- Cleanup scans by expiry, and the lease sweep scans in-flight rows by lease.
create index if not exists auth_hook_deliveries_expires_at_idx
  on public.auth_hook_deliveries (expires_at);

create index if not exists auth_hook_deliveries_lease_idx
  on public.auth_hook_deliveries (lease_expires_at)
  where state = 'IN_FLIGHT';

-- ── Lockdown ────────────────────────────────────────────────────────────────
-- RLS on with zero policies: PostgREST sees nothing for anon/authenticated. service_role
-- bypasses RLS, which is the only intended access path.

alter table public.auth_hook_deliveries enable row level security;
alter table public.auth_hook_deliveries force row level security;

revoke all on table public.auth_hook_deliveries from public;
revoke all on table public.auth_hook_deliveries from anon;
revoke all on table public.auth_hook_deliveries from authenticated;

-- ── Claim ───────────────────────────────────────────────────────────────────

/*
 * The single atomic entry point. Returns what the caller is allowed to do:
 *
 *   CLAIMED    dispatch now; you own the lease
 *   SUCCEEDED  already delivered; answer 200 and send nothing
 *   IN_FLIGHT  another instance holds a live lease; do not send
 *   UNCERTAIN  a previous attempt may have delivered; never auto-resend this id
 *   CONFLICT   this webhook-id was used with different content; send nothing
 *   EXHAUSTED  retry ceiling reached after explicit provider refusals
 *
 * Atomicity comes from the primary key: the insert either wins or does not exist, and
 * every subsequent decision happens under a row lock.
 */
create or replace function public.claim_auth_hook_delivery(
  p_webhook_id     text,
  p_payload_digest text,
  p_owner_instance text,
  p_lease_seconds  integer default 30,
  p_ttl_seconds    integer default 86400,
  p_max_attempts   integer default 3
)
returns table (
  status              text,
  attempt_count       integer,
  provider_message_id text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.auth_hook_deliveries%rowtype;
begin
  if p_webhook_id is null or length(trim(p_webhook_id)) = 0 then
    raise exception 'webhook_id is required';
  end if;
  if p_payload_digest is null or length(trim(p_payload_digest)) = 0 then
    raise exception 'payload_digest is required';
  end if;

  -- Fast path: a genuinely new webhook. Whoever wins the insert owns the dispatch.
  insert into public.auth_hook_deliveries as d (
    webhook_id, payload_digest, state, owner_instance,
    attempt_count, started_at, lease_expires_at, expires_at
  )
  values (
    p_webhook_id, p_payload_digest, 'IN_FLIGHT', p_owner_instance,
    1, now(), now() + make_interval(secs => p_lease_seconds),
    now() + make_interval(secs => p_ttl_seconds)
  )
  on conflict (webhook_id) do nothing
  returning d.* into v_row;

  if found then
    return query select 'CLAIMED'::text, v_row.attempt_count, null::text;
    return;
  end if;

  -- The row already exists. Serialize every decision about it.
  select * into v_row
    from public.auth_hook_deliveries
   where webhook_id = p_webhook_id
     for update;

  -- Same id, different content. Never dispatch: either the sender is broken, or somebody
  -- is trying to ride an id that already counted as delivered.
  if v_row.payload_digest is distinct from p_payload_digest then
    return query select 'CONFLICT'::text, v_row.attempt_count, null::text;
    return;
  end if;

  if v_row.state = 'SUCCEEDED' then
    return query select 'SUCCEEDED'::text, v_row.attempt_count, v_row.provider_message_id;
    return;
  end if;

  if v_row.state = 'UNCERTAIN' then
    return query select 'UNCERTAIN'::text, v_row.attempt_count, null::text;
    return;
  end if;

  if v_row.state = 'IN_FLIGHT' then
    -- Someone else is actively dispatching.
    if v_row.lease_expires_at is not null and v_row.lease_expires_at > now() then
      return query select 'IN_FLIGHT'::text, v_row.attempt_count, null::text;
      return;
    end if;

    -- The lease died without a completion, so the owner crashed, was redeployed, or was
    -- killed mid-call. We cannot know whether Meta accepted the message. Taking over would
    -- risk a second real WhatsApp to a real person, so the id is retired instead. The user
    -- can request a fresh OTP, which arrives under a new webhook-id.
    update public.auth_hook_deliveries
       set state = 'UNCERTAIN',
           last_error_code = coalesce(last_error_code, 'LEASE_EXPIRED'),
           owner_instance = null,
           lease_expires_at = null,
           updated_at = now()
     where webhook_id = p_webhook_id;

    return query select 'UNCERTAIN'::text, v_row.attempt_count, null::text;
    return;
  end if;

  -- FAILED (or the reserved RECEIVED): the provider explicitly refused before accepting,
  -- so nothing was delivered and a bounded retry is safe.
  if v_row.attempt_count >= p_max_attempts then
    return query select 'EXHAUSTED'::text, v_row.attempt_count, null::text;
    return;
  end if;

  update public.auth_hook_deliveries
     set state = 'IN_FLIGHT',
         owner_instance = p_owner_instance,
         attempt_count = auth_hook_deliveries.attempt_count + 1,
         started_at = now(),
         completed_at = null,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         expires_at = now() + make_interval(secs => p_ttl_seconds),
         updated_at = now()
   where webhook_id = p_webhook_id
   returning * into v_row;

  return query select 'CLAIMED'::text, v_row.attempt_count, null::text;
end;
$$;

-- ── Completion transitions ──────────────────────────────────────────────────

/* Meta accepted and returned a wamid. Terminal. */
create or replace function public.complete_auth_hook_delivery(
  p_webhook_id          text,
  p_owner_instance      text,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  update public.auth_hook_deliveries
     set state = 'SUCCEEDED',
         provider_message_id = p_provider_message_id,
         completed_at = now(),
         lease_expires_at = null,
         last_error_code = null,
         updated_at = now()
   where webhook_id = p_webhook_id
     and state = 'IN_FLIGHT'
     -- Only the lease holder may complete it. A late writer from a superseded instance
     -- must not overwrite a state that has since moved on.
     and (owner_instance is not distinct from p_owner_instance);

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

/*
 * An explicit provider refusal, observed before Meta accepted anything. Nothing was
 * delivered, so a bounded retry under the same webhook-id is legitimate.
 */
create or replace function public.fail_auth_hook_delivery(
  p_webhook_id     text,
  p_owner_instance text,
  p_error_code     text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  update public.auth_hook_deliveries
     set state = 'FAILED',
         last_error_code = p_error_code,
         completed_at = now(),
         lease_expires_at = null,
         updated_at = now()
   where webhook_id = p_webhook_id
     and state = 'IN_FLIGHT'
     and (owner_instance is not distinct from p_owner_instance);

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

/*
 * A timeout, an aborted request, or any outcome where we do not know whether Meta accepted
 * the send. Terminal on purpose: this id is never dispatched again, because the cost of a
 * duplicate is a second real message to a real handset. The user retries and gets a new id.
 */
create or replace function public.mark_auth_hook_delivery_uncertain(
  p_webhook_id     text,
  p_owner_instance text,
  p_error_code     text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  update public.auth_hook_deliveries
     set state = 'UNCERTAIN',
         last_error_code = p_error_code,
         completed_at = now(),
         lease_expires_at = null,
         updated_at = now()
   where webhook_id = p_webhook_id
     and state = 'IN_FLIGHT'
     and (owner_instance is not distinct from p_owner_instance);

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- ── Cleanup ─────────────────────────────────────────────────────────────────

/*
 * Housekeeping. Never deletes an IN_FLIGHT row: an expired lease becomes UNCERTAIN so the
 * duplicate-send guard survives, rather than vanishing and letting the id be dispatched
 * again from scratch.
 *
 * UNCERTAIN rows outlive everything else because they are the record of a delivery nobody
 * can account for; they are dropped only after a long retention window.
 */
create or replace function public.cleanup_expired_auth_hook_deliveries(
  p_uncertain_retention_days integer default 30
)
returns table (
  leases_retired  integer,
  rows_deleted    integer,
  uncertain_kept  integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_retired  integer := 0;
  v_deleted  integer := 0;
  v_kept     integer := 0;
begin
  update public.auth_hook_deliveries
     set state = 'UNCERTAIN',
         last_error_code = coalesce(last_error_code, 'LEASE_EXPIRED'),
         owner_instance = null,
         lease_expires_at = null,
         updated_at = now()
   where state = 'IN_FLIGHT'
     and lease_expires_at is not null
     and lease_expires_at < now();
  get diagnostics v_retired = row_count;

  delete from public.auth_hook_deliveries
   where state in ('SUCCEEDED', 'FAILED')
     and expires_at < now();
  get diagnostics v_deleted = row_count;

  with removed as (
    delete from public.auth_hook_deliveries
     where state = 'UNCERTAIN'
       and updated_at < now() - make_interval(days => p_uncertain_retention_days)
    returning 1
  )
  select v_deleted + count(*)::integer into v_deleted from removed;

  select count(*)::integer into v_kept
    from public.auth_hook_deliveries
   where state = 'UNCERTAIN';

  return query select v_retired, v_deleted, v_kept;
end;
$$;

-- ── Function grants ─────────────────────────────────────────────────────────
-- SECURITY DEFINER functions default to EXECUTE for public. Every one of these is revoked
-- and re-granted to service_role only; otherwise an anon PostgREST call could drive the
-- delivery ledger directly.

revoke all on function public.claim_auth_hook_delivery(text, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_auth_hook_delivery(text, text, text) from public, anon, authenticated;
revoke all on function public.fail_auth_hook_delivery(text, text, text) from public, anon, authenticated;
revoke all on function public.mark_auth_hook_delivery_uncertain(text, text, text) from public, anon, authenticated;
revoke all on function public.cleanup_expired_auth_hook_deliveries(integer) from public, anon, authenticated;

grant execute on function public.claim_auth_hook_delivery(text, text, text, integer, integer, integer) to service_role;
grant execute on function public.complete_auth_hook_delivery(text, text, text) to service_role;
grant execute on function public.fail_auth_hook_delivery(text, text, text) to service_role;
grant execute on function public.mark_auth_hook_delivery_uncertain(text, text, text) to service_role;
grant execute on function public.cleanup_expired_auth_hook_deliveries(integer) to service_role;
