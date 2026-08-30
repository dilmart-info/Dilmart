import { Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

type AnalyticsEventInput = {
  name: string;
  occurred_at?: string;
  source_surface?: string;
  merchant_id?: string;
  product_id?: string;
  path?: string;
  campaign_source?: string;
  campaign_medium?: string;
  campaign_id?: string;
  experiment_id?: string;
  variant_id?: string;
  outcome_key?: string;
  session_id?: string;
  payload?: Record<string, unknown>;
};

type ExperimentRegistryRow = {
  experiment_id: string;
  label: string;
  description?: string | null;
  surface?: string | null;
  variants?: string[] | null;
  primary_outcome_key?: string | null;
  status?: "draft" | "running" | "paused" | "archived" | null;
  updated_at?: string | null;
};

const DEFAULT_EXPERIMENTS: ExperimentRegistryRow[] = [
  {
    experiment_id: "home_hero_messaging_v1",
    label: "Home Hero Messaging v1",
    description: "A/B test for homepage hero headline/subline/CTA copy.",
    surface: "home_hero",
    variants: ["control", "variant_b"],
    primary_outcome_key: "hero_primary_cta_click",
    status: "running",
    updated_at: null,
  },
];

@Injectable()
export class AnalyticsService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private sanitizeEvent(input: AnalyticsEventInput) {
    return {
      name: String(input.name ?? "").trim(),
      occurred_at: input.occurred_at && !Number.isNaN(Date.parse(input.occurred_at)) ? input.occurred_at : new Date().toISOString(),
      source_surface: input.source_surface ?? null,
      merchant_id: input.merchant_id ?? null,
      product_id: input.product_id ?? null,
      path: input.path ?? null,
      campaign_source: input.campaign_source ?? null,
      campaign_medium: input.campaign_medium ?? null,
      campaign_id: input.campaign_id ?? null,
      experiment_id: input.experiment_id ?? null,
      variant_id: input.variant_id ?? null,
      outcome_key: input.outcome_key ?? null,
      session_id: input.session_id ?? null,
      payload: input.payload ?? {},
    };
  }

  async ingestEvents(input: { events?: AnalyticsEventInput[]; actor_id?: string | null; actor_role?: string | null }) {
    const raw = Array.isArray(input.events) ? input.events : [];
    const normalized = raw.map((e) => this.sanitizeEvent(e)).filter((e) => Boolean(e.name));
    if (normalized.length === 0) {
      return { accepted: 0, rejected: raw.length, message: "No valid analytics events." };
    }

    const rows = normalized.map((e) => ({
      ...e,
      actor_id: input.actor_id ?? null,
      actor_role: input.actor_role ?? null,
      created_at: new Date().toISOString(),
    }));

    const { error } = await this.supabaseAdmin.client.from("analytics_events").insert(rows as any);
    if (error) {
      return {
        accepted: 0,
        rejected: normalized.length,
        message: "Analytics table unavailable or write failed.",
        error: error.message,
      };
    }

    return { accepted: normalized.length, rejected: raw.length - normalized.length };
  }

  async getEventSummary(input: { window_days?: number; merchant_id?: string; names?: string[] }) {
    const windowDays = Math.min(30, Math.max(1, Number(input.window_days ?? 7)));
    const minIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    let req = this.supabaseAdmin.client.from("analytics_events").select("name").gte("occurred_at", minIso);
    if (input.merchant_id) req = req.eq("merchant_id", input.merchant_id);
    if (input.names && input.names.length > 0) req = req.in("name", input.names);

    const { data, error } = await req.limit(5000);
    if (error) {
      return { window_days: windowDays, totals: [], message: "Analytics read unavailable.", error: error.message };
    }

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const name = String((row as { name?: string }).name ?? "");
      if (!name) continue;
      counts[name] = (counts[name] ?? 0) + 1;
    }

    return {
      window_days: windowDays,
      totals: Object.entries(counts).map(([name, count]) => ({ name, count })),
    };
  }

  async listExperiments() {
    const { data, error } = await this.supabaseAdmin.client
      .from("experiments_registry")
      .select("experiment_id,label,description,surface,variants,primary_outcome_key,status,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) {
      return {
        experiments: DEFAULT_EXPERIMENTS,
        message: "Experiments registry table unavailable; using default registry.",
        error: error.message,
      };
    }
    const rows = (data ?? []) as ExperimentRegistryRow[];
    return { experiments: rows.length > 0 ? rows : DEFAULT_EXPERIMENTS };
  }

  async upsertExperiment(input: {
    experiment_id: string;
    label: string;
    description?: string;
    surface?: string;
    variants?: string[];
    primary_outcome_key?: string;
    status?: "draft" | "running" | "paused" | "archived";
  }) {
    const row = {
      experiment_id: String(input.experiment_id ?? "").trim(),
      label: String(input.label ?? "").trim(),
      description: input.description ?? null,
      surface: input.surface ?? null,
      variants: Array.isArray(input.variants) ? input.variants : [],
      primary_outcome_key: input.primary_outcome_key ?? null,
      status: input.status ?? "running",
      updated_at: new Date().toISOString(),
    };
    if (!row.experiment_id || !row.label) {
      return { ok: false as const, message: "experiment_id and label are required." };
    }
    const { data, error } = await this.supabaseAdmin.client
      .from("experiments_registry")
      .upsert(row as any, { onConflict: "experiment_id" })
      .select("experiment_id,label,description,surface,variants,primary_outcome_key,status,updated_at")
      .maybeSingle();
    if (error) {
      return { ok: false as const, message: "Experiments registry write failed.", error: error.message };
    }
    return { ok: true as const, experiment: data as ExperimentRegistryRow };
  }

  async getExperimentReport(input: { experiment_id: string; window_days?: number; merchant_id?: string }) {
    const experimentId = String(input.experiment_id ?? "").trim();
    const windowDays = Math.min(30, Math.max(1, Number(input.window_days ?? 7)));
    const minIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    let req = this.supabaseAdmin.client
      .from("analytics_events")
      .select("name,variant_id,outcome_key")
      .eq("experiment_id", experimentId)
      .gte("occurred_at", minIso)
      .in("name", ["experiment.exposed", "experiment.outcome"]);
    if (input.merchant_id) req = req.eq("merchant_id", input.merchant_id);

    const { data, error } = await req.limit(10000);
    if (error) {
      return {
        experiment_id: experimentId,
        window_days: windowDays,
        by_variant: {},
        message: "Experiment report read unavailable.",
        error: error.message,
      };
    }

    const byVariant: Record<string, { exposed: number; outcomes: Record<string, number> }> = {};
    for (const row of data ?? []) {
      const name = String((row as { name?: string }).name ?? "");
      const variantId = String((row as { variant_id?: string | null }).variant_id ?? "_unknown");
      if (!byVariant[variantId]) byVariant[variantId] = { exposed: 0, outcomes: {} };
      if (name === "experiment.exposed") {
        byVariant[variantId].exposed += 1;
      } else if (name === "experiment.outcome") {
        const k = String((row as { outcome_key?: string | null }).outcome_key ?? "");
        if (k) byVariant[variantId].outcomes[k] = (byVariant[variantId].outcomes[k] ?? 0) + 1;
      }
    }

    return {
      experiment_id: experimentId,
      window_days: windowDays,
      by_variant: byVariant,
    };
  }

  /** M6.1 — ingestion health snapshot for operations. */
  async getIngestionHealth(input?: { window_hours?: number }) {
    const windowHours = Math.min(24 * 30, Math.max(1, Number(input?.window_hours ?? 24)));
    const minIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabaseAdmin.client
      .from("analytics_events")
      .select("name,occurred_at,created_at")
      .gte("created_at", minIso)
      .limit(20000);
    if (error) {
      return {
        window_hours: windowHours,
        totals: { ingested_rows: 0, lagging_rows: 0 },
        message: "Ingestion health unavailable.",
        error: error.message,
      };
    }

    const rows = data ?? [];
    const byName: Record<string, number> = {};
    let laggingRows = 0;
    for (const row of rows as Array<{ name?: string | null; occurred_at?: string | null; created_at?: string | null }>) {
      const name = String(row.name ?? "");
      if (name) byName[name] = (byName[name] ?? 0) + 1;
      const occurredTs = row.occurred_at ? Date.parse(row.occurred_at) : NaN;
      const createdTs = row.created_at ? Date.parse(row.created_at) : NaN;
      if (!Number.isNaN(occurredTs) && !Number.isNaN(createdTs) && createdTs - occurredTs > 10 * 60 * 1000) {
        laggingRows += 1;
      }
    }

    return {
      window_hours: windowHours,
      totals: {
        ingested_rows: rows.length,
        lagging_rows: laggingRows,
        distinct_event_names: Object.keys(byName).length,
      },
      by_event_name: Object.entries(byName)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /** M6.1 — retention cleanup endpoint with safe dry-run default. */
  async cleanupOldEvents(input?: { older_than_days?: number; dry_run?: boolean }) {
    const olderThanDays = Math.min(365, Math.max(7, Number(input?.older_than_days ?? 90)));
    const dryRun = input?.dry_run !== false;
    const cutoffIso = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

    const { count, error } = await this.supabaseAdmin.client
      .from("analytics_events")
      .select("name", { count: "exact", head: true })
      .lt("created_at", cutoffIso);
    if (error) {
      return { ok: false as const, dry_run: dryRun, message: "Retention check failed.", error: error.message };
    }

    const candidateRows = count ?? 0;
    if (dryRun || candidateRows === 0) {
      return {
        ok: true as const,
        dry_run: dryRun,
        older_than_days: olderThanDays,
        cutoff_iso: cutoffIso,
        candidate_rows: candidateRows,
        deleted_rows: 0,
      };
    }

    const { error: delError } = await this.supabaseAdmin.client.from("analytics_events").delete().lt("created_at", cutoffIso);
    if (delError) {
      return { ok: false as const, dry_run: false, message: "Retention delete failed.", error: delError.message };
    }
    return {
      ok: true as const,
      dry_run: false,
      older_than_days: olderThanDays,
      cutoff_iso: cutoffIso,
      candidate_rows: candidateRows,
      deleted_rows: candidateRows,
    };
  }
}

