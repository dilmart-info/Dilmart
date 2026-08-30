import { request } from "@/lib/api-core";

export const analyticsApi = {
  getAnalyticsEventSummary(payload?: { window_days?: number; merchant_id?: string; names?: string[] }) {
    const params = new URLSearchParams();
    if (payload?.window_days) params.set("window_days", String(payload.window_days));
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    if (payload?.names && payload.names.length > 0) params.set("names", payload.names.join(","));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ window_days: number; totals: Array<{ name: string; count: number }>; message?: string; error?: string }>(
      `/analytics/events/summary${suffix}`,
      "GET",
    );
  },

  listAnalyticsExperiments() {
    return request<{
      experiments: Array<{
        experiment_id: string;
        label: string;
        description?: string | null;
        surface?: string | null;
        variants?: string[] | null;
        primary_outcome_key?: string | null;
        status?: "draft" | "running" | "paused" | "archived" | null;
      }>;
      message?: string;
      error?: string;
    }>("/analytics/experiments", "GET");
  },

  getAnalyticsExperimentReport(payload: { experiment_id: string; window_days?: number; merchant_id?: string }) {
    const params = new URLSearchParams();
    params.set("experiment_id", payload.experiment_id);
    if (payload.window_days) params.set("window_days", String(payload.window_days));
    if (payload.merchant_id) params.set("merchant_id", payload.merchant_id);
    return request<{
      experiment_id: string;
      window_days: number;
      by_variant: Record<string, { exposed: number; outcomes: Record<string, number> }>;
      message?: string;
      error?: string;
    }>(`/analytics/experiments/report?${params.toString()}`, "GET");
  },

  getAnalyticsIngestionHealth(payload?: { window_hours?: number }) {
    const params = new URLSearchParams();
    if (payload?.window_hours) params.set("window_hours", String(payload.window_hours));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      window_hours: number;
      totals: { ingested_rows: number; lagging_rows: number; distinct_event_names?: number };
      by_event_name?: Array<{ name: string; count: number }>;
      message?: string;
      error?: string;
    }>(`/analytics/ops/ingestion-health${suffix}`, "GET");
  },

  runAnalyticsRetentionCleanup(payload?: { older_than_days?: number; dry_run?: boolean }) {
    return request<{
      ok: boolean;
      dry_run: boolean;
      older_than_days?: number;
      cutoff_iso?: string;
      candidate_rows?: number;
      deleted_rows?: number;
      message?: string;
      error?: string;
    }>("/analytics/ops/retention-cleanup", "POST", payload ?? { dry_run: true });
  },

  listReconciliationOutboundAttempts(payload?: { limit?: number; only_failed?: boolean }) {
    const params = new URLSearchParams();
    if (payload?.limit) params.set("limit", String(payload.limit));
    if (typeof payload?.only_failed === "boolean") params.set("only_failed", String(payload.only_failed));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      attempts: Array<{
        dispatch_key?: string | null;
        alert_id?: string | null;
        alert_type?: string | null;
        alert_title?: string | null;
        alert_message?: string | null;
        alert_link?: string | null;
        channel?: string | null;
        attempt_no?: number | null;
        ok?: boolean | null;
        status_code?: number | null;
        error_message?: string | null;
        provider_name?: string | null;
        provider_message_id?: string | null;
        ack_status?: string | null;
        ack_at?: string | null;
        provider_error_code?: string | null;
        created_at?: string | null;
      }>;
      message?: string;
      error?: string;
    }>(`/admin/reconciliation/outbound-attempts${suffix}`, "GET");
  },

  getReconciliationDiagnostics(payload?: { window_hours?: number; limit?: number }) {
    const params = new URLSearchParams();
    if (payload?.window_hours) params.set("window_hours", String(payload.window_hours));
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      window_hours: number;
      totals: {
        attempts: number;
        failed_attempts: number;
        replay_success_after_failure: number;
        repeated_failure_keys: number;
      };
      by_category: Array<{ category: string; count: number }>;
      by_channel: Array<{ channel: string; total: number; failed: number; failure_rate: number }>;
      trend?: {
        policy_blocked_replays: number;
        policy_blocked_replay_rate: number;
        repeated_failure_clusters: number;
        avg_recovery_lead_time_minutes: number;
        policy_blocked_keys: number;
      };
      dead_letter_window_totals?: {
        rows: number;
        policy_blocked_rows: number;
      };
      message?: string;
      error?: string;
    }>(`/admin/reconciliation/diagnostics${suffix}`, "GET");
  },

  replayReconciliationOutboundAttempt(payload: {
    dispatch_key: string;
    alert_id: string;
    alert_type: string;
    alert_title: string;
    alert_message: string;
    alert_link?: string | null;
  }) {
    return request<{
      ok: boolean;
      dispatch_key: string;
      blocked_by_policy?: boolean;
      reason?: string;
      mode?: "manual" | "scheduled";
      result: any;
    }>(
      "/admin/reconciliation/outbound-attempts/replay",
      "POST",
      payload,
    );
  },

  listReconciliationDeadLetters(payload?: { limit?: number; state?: "new" | "retrying" | "dead_lettered" | "resolved" }) {
    const params = new URLSearchParams();
    if (payload?.limit) params.set("limit", String(payload.limit));
    if (payload?.state) params.set("state", payload.state);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      dead_letters: Array<{
        dispatch_key?: string | null;
        alert_id?: string | null;
        alert_type?: string | null;
        alert_title?: string | null;
        alert_message?: string | null;
        alert_link?: string | null;
        failure_category?: string | null;
        last_error_message?: string | null;
        state?: "new" | "retrying" | "dead_lettered" | "resolved" | null;
        created_at?: string | null;
        updated_at?: string | null;
        resolved_at?: string | null;
        resolved_by?: string | null;
      }>;
      message?: string;
      error?: string;
    }>(`/admin/reconciliation/dead-letters${suffix}`, "GET");
  },

  transitionReconciliationDeadLetter(payload: { dispatch_key: string; state: "new" | "retrying" | "dead_lettered" | "resolved"; reason?: string | null }) {
    return request<{ ok: boolean; dispatch_key: string; state: string; message?: string; error?: string }>(
      "/admin/reconciliation/dead-letters/transition",
      "POST",
      payload,
    );
  },
};
