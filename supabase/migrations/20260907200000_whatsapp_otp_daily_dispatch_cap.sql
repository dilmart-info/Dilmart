-- ============================================================================
-- WhatsApp OTP Daily Global Dispatch Cap & Ledger.
--
-- Provides durable global daily dispatch limiting for WhatsApp OTP sending,
-- preventing runaway loops, accidental cost surges, or spam attacks across
-- restarts, redeployments, and multiple backend instances.
--
-- Calendar day boundaries are strictly calculated in Asia/Baghdad timezone.
-- Access is restricted to the backend service_role only. Browser roles are denied.
--
-- NOT APPLIED TO PRODUCTION AUTOMATICALLY. Forward-only migration.
-- ============================================================================

-- ── Table ───────────────────────────────────────────────────────────────────

create table if not exists public.whatsapp_otp_daily_dispatches (
  bucket_date    date primary key,
  dispatch_count integer     not null default 0,
  updated_at     timestamptz not null default now(),

  constraint whatsapp_otp_daily_dispatches_count_check
    check (dispatch_count >= 0)
);

comment on table public.whatsapp_otp_daily_dispatches is
  'Durable daily dispatch ledger for WhatsApp OTP sends. Scoped by Asia/Baghdad calendar date.';

comment on column public.whatsapp_otp_daily_dispatches.bucket_date is
  'Calendar date (YYYY-MM-DD) in Asia/Baghdad (or configured timezone). Primary key.';

comment on column public.whatsapp_otp_daily_dispatches.dispatch_count is
  'Total dispatch attempts reaching Meta provider on this calendar date.';

-- RLS: Enabled with NO policies for anon or authenticated (browser roles completely denied).
alter table public.whatsapp_otp_daily_dispatches enable row level security;

-- ── RPC: claim_whatsapp_daily_dispatch ──────────────────────────────────────

create or replace function public.claim_whatsapp_daily_dispatch(
  p_max_limit integer,
  p_timezone text default 'Asia/Baghdad'
)
returns table (
  allowed boolean,
  current_count integer,
  bucket_date date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_bucket_date date;
  v_count integer;
  v_tz text;
begin
  -- 1. Fail closed on missing, null, zero, or negative limit
  if p_max_limit is null or p_max_limit <= 0 then
    return query select false, 0, current_date;
    return;
  end if;

  -- 2. Resolve timezone safely, falling back to Asia/Baghdad on any error
  v_tz := coalesce(nullif(trim(p_timezone), ''), 'Asia/Baghdad');
  begin
    v_bucket_date := (now() at time zone v_tz)::date;
  exception when others then
    v_bucket_date := (now() at time zone 'Asia/Baghdad')::date;
  end;

  -- 3. Atomic upsert: increment count ONLY if strictly below max limit
  insert into public.whatsapp_otp_daily_dispatches as d (bucket_date, dispatch_count, updated_at)
  values (v_bucket_date, 1, now())
  on conflict (bucket_date) do update
    set dispatch_count = d.dispatch_count + 1,
        updated_at = now()
    where d.dispatch_count < p_max_limit
  returning d.dispatch_count into v_count;

  if v_count is not null then
    -- Reserved a dispatch slot
    return query select true, v_count, v_bucket_date;
  else
    -- Limit already reached or exceeded: query count without modifying
    select d.dispatch_count into v_count
    from public.whatsapp_otp_daily_dispatches as d
    where d.bucket_date = v_bucket_date;

    return query select false, coalesce(v_count, p_max_limit), v_bucket_date;
  end if;
end;
$$;

revoke all on function public.claim_whatsapp_daily_dispatch(integer, text) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_daily_dispatch(integer, text) to service_role;

-- ── RPC: get_whatsapp_daily_dispatch_count ──────────────────────────────────

create or replace function public.get_whatsapp_daily_dispatch_count(
  p_timezone text default 'Asia/Baghdad'
)
returns table (
  current_count integer,
  bucket_date date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_bucket_date date;
  v_count integer;
  v_tz text;
begin
  v_tz := coalesce(nullif(trim(p_timezone), ''), 'Asia/Baghdad');
  begin
    v_bucket_date := (now() at time zone v_tz)::date;
  exception when others then
    v_bucket_date := (now() at time zone 'Asia/Baghdad')::date;
  end;

  select d.dispatch_count into v_count
  from public.whatsapp_otp_daily_dispatches as d
  where d.bucket_date = v_bucket_date;

  return query select coalesce(v_count, 0), v_bucket_date;
end;
$$;

revoke all on function public.get_whatsapp_daily_dispatch_count(text) from public, anon, authenticated;
grant execute on function public.get_whatsapp_daily_dispatch_count(text) to service_role;
