import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

const DEAD_LETTER_STATE_LABELS: Record<"all" | "new" | "retrying" | "dead_lettered" | "resolved", string> = {
  all: "الكل",
  new: "جديد",
  retrying: "قيد إعادة المحاولة",
  dead_lettered: "ميتة",
  resolved: "محلول",
};

export default function AdminReconciliation() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [deadLetterStateFilter, setDeadLetterStateFilter] = useState<"all" | "new" | "retrying" | "dead_lettered" | "resolved">("all");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reconciliation-outbound-attempts"],
    queryFn: () => apiClient.listReconciliationOutboundAttempts({ limit: 200, only_failed: true }),
  });
  const { data: diagnostics } = useQuery({
    queryKey: ["admin-reconciliation-diagnostics"],
    queryFn: () => apiClient.getReconciliationDiagnostics({ window_hours: 72, limit: 1000 }),
  });
  const { data: deadLetters } = useQuery({
    queryKey: ["admin-reconciliation-dead-letters", deadLetterStateFilter],
    queryFn: () =>
      apiClient.listReconciliationDeadLetters({
        limit: 120,
        state: deadLetterStateFilter === "all" ? undefined : deadLetterStateFilter,
      }),
  });

  const replayMutation = useMutation({
    mutationFn: (payload: {
      dispatch_key: string;
      alert_id: string;
      alert_type: string;
      alert_title: string;
      alert_message: string;
      alert_link?: string | null;
    }) => apiClient.replayReconciliationOutboundAttempt(payload),
    onSuccess: (result) => {
      if (result?.blocked_by_policy) {
        toast.warning(result.reason ?? "تم حجب إعادة الإرسال حسب السياسة.");
      } else {
        toast.success("تمت محاولة إعادة الإرسال");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-reconciliation-outbound-attempts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-reconciliation-dead-letters"] });
      queryClient.invalidateQueries({ queryKey: ["admin-reconciliation-diagnostics"] });
    },
    onError: () => toast.error("تعذر تنفيذ إعادة الإرسال"),
  });
  const transitionLifecycle = (dispatchKey: string | null | undefined, state: "new" | "retrying" | "dead_lettered" | "resolved", reason: string) => {
    if (!dispatchKey) return;
    deadLetterTransitionMutation.mutate({ dispatch_key: dispatchKey, state, reason });
  };
  const deadLetterTransitionMutation = useMutation({
    mutationFn: (payload: { dispatch_key: string; state: "new" | "retrying" | "dead_lettered" | "resolved"; reason?: string | null }) =>
      apiClient.transitionReconciliationDeadLetter(payload),
    onSuccess: () => {
      toast.success("تم تحديث حالة دورة الحياة");
      queryClient.invalidateQueries({ queryKey: ["admin-reconciliation-dead-letters"] });
    },
    onError: () => toast.error("تعذر تحديث حالة دورة الحياة"),
  });

  const attempts = useMemo(() => {
    const rows = data?.attempts ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const hay = `${row.dispatch_key ?? ""} ${row.alert_type ?? ""} ${row.alert_title ?? ""} ${row.error_message ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [data?.attempts, search]);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">لوحة متابعة التسويات</h2>
        <Badge variant="secondary">M8.4</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">إجمالي المحاولات</p>
            <p className="text-2xl font-bold">{diagnostics?.totals.attempts ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">المحاولات الفاشلة</p>
            <p className="text-2xl font-bold">{diagnostics?.totals.failed_attempts ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">المفاتيح المستعادة</p>
            <p className="text-2xl font-bold">{diagnostics?.totals.replay_success_after_failure ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">الإخفاقات المتكررة</p>
            <p className="text-2xl font-bold">{diagnostics?.totals.repeated_failure_keys ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">إعادات المحاولة المحجوبة بالسياسة</p>
            <p className="text-2xl font-bold">{diagnostics?.trend?.policy_blocked_replays ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">نسبة الحجب بالسياسة</p>
            <p className="text-2xl font-bold">{Math.round((diagnostics?.trend?.policy_blocked_replay_rate ?? 0) * 100)}%</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">عناقيد الإخفاق</p>
            <p className="text-2xl font-bold">{diagnostics?.trend?.repeated_failure_clusters ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">متوسط زمن التعافي (دقيقة)</p>
            <p className="text-2xl font-bold">{diagnostics?.trend?.avg_recovery_lead_time_minutes ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">تصنيف الإخفاقات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(diagnostics?.by_category ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد بيانات ضمن النافذة الحالية.</p>
            ) : (
              (diagnostics?.by_category ?? []).map((entry) => (
                <div key={entry.category} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span className="font-medium">{entry.category}</span>
                  <Badge variant="outline">{entry.count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">تشخيص القنوات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(diagnostics?.by_channel ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد بيانات ضمن النافذة الحالية.</p>
            ) : (
              (diagnostics?.by_channel ?? []).map((entry) => (
                <div key={entry.channel} className="rounded border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{entry.channel}</span>
                    <Badge variant="outline">{Math.round(entry.failure_rate * 100)}%</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    فاشلة {entry.failed} / إجمالي {entry.total}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg">محاولات الإرسال الفاشلة (كل القنوات)</CardTitle>
          <p className="text-xs text-muted-foreground">
            عرض آخر المحاولات الفاشلة من جدول `outbound_dispatch_attempts` مع إمكانية إعادة المحاولة يدويًا.
          </p>
          <Input
            placeholder="ابحث بالمعرّف / النوع / السبب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">جاري التحميل...</div>
          ) : attempts.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">لا توجد محاولات فاشلة ضمن النطاق الحالي.</div>
          ) : (
            <div className="space-y-3">
              {attempts.map((row, idx) => {
                const key = `${row.dispatch_key ?? "x"}:${row.attempt_no ?? idx}:${row.created_at ?? idx}`;
                const replayPayload = {
                  dispatch_key: String(row.dispatch_key ?? ""),
                  alert_id: String(row.alert_id ?? "manual-replay"),
                  alert_type: String(row.alert_type ?? "alert_delayed_orders"),
                  alert_title: String(row.alert_title ?? "Operational Alert Replay"),
                  alert_message: String(row.alert_message ?? row.error_message ?? "Replay from reconciliation console"),
                  alert_link: row.alert_link ?? null,
                };
                return (
                  <div key={key} className="rounded-lg border border-border p-3 text-sm space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-xs text-muted-foreground">{row.dispatch_key ?? "—"}</div>
                      <Badge variant="destructive">فشل</Badge>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <p>النوع: <span className="font-medium">{row.alert_type ?? "—"}</span></p>
                      <p>المحاولة: <span className="font-medium">{row.attempt_no ?? "—"}</span></p>
                      <p>الحالة: <span className="font-medium">{row.status_code ?? "خطأ شبكة/طلب"}</span></p>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <p>المزوّد: <span className="font-medium">{row.provider_name ?? row.channel ?? "—"}</span></p>
                      <p>الاستلام: <span className="font-medium">{row.ack_status ?? "غير معروف"}</span></p>
                      <p>معرّف المزوّد: <span className="font-medium">{row.provider_message_id ?? "—"}</span></p>
                    </div>
                    {row.ack_at ? (
                      <p className="text-xs text-muted-foreground">تاريخ الاستلام: {new Date(row.ack_at).toLocaleString("ar-IQ")}</p>
                    ) : null}
                    {row.provider_error_code ? <p className="text-xs text-muted-foreground">خطأ المزوّد: {row.provider_error_code}</p> : null}
                    <p className="text-muted-foreground">{row.error_message ?? "—"}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {row.created_at ? new Date(row.created_at).toLocaleString("ar-IQ") : "—"}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => replayMutation.mutate(replayPayload)}
                        disabled={replayMutation.isPending || !replayPayload.dispatch_key}
                      >
                        إعادة محاولة
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg">طابور الحالات الميتة (Dead Letter)</CardTitle>
          <p className="text-xs text-muted-foreground">سجل الحالات ذات التعافي غير المكتمل مع انتقالات دورة حياة آمنة.</p>
          <div className="flex flex-wrap gap-2">
            {(["all", "dead_lettered", "retrying", "resolved", "new"] as const).map((state) => (
              <Button
                key={state}
                type="button"
                size="sm"
                variant={deadLetterStateFilter === state ? "default" : "outline"}
                onClick={() => setDeadLetterStateFilter(state)}
              >
                {DEAD_LETTER_STATE_LABELS[state]}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {(deadLetters?.dead_letters ?? []).length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">لا توجد سجلات حالات ميتة حاليًا.</div>
          ) : (
            <div className="space-y-3">
              {(deadLetters?.dead_letters ?? []).map((row, idx) => {
                const key = `${row.dispatch_key ?? "dead"}:${row.updated_at ?? idx}`;
                const state = row.state ?? "dead_lettered";
                return (
                  <div key={key} className="rounded-lg border border-border p-3 text-sm space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-xs text-muted-foreground">{row.dispatch_key ?? "—"}</div>
                      <Badge variant={state === "resolved" ? "secondary" : "destructive"}>{state}</Badge>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <p>النوع: <span className="font-medium">{row.alert_type ?? "—"}</span></p>
                      <p>التصنيف: <span className="font-medium">{row.failure_category ?? "غير معروف"}</span></p>
                      <p>آخر تحديث: <span className="font-medium">{row.updated_at ? new Date(row.updated_at).toLocaleString("ar-IQ") : "—"}</span></p>
                    </div>
                    <p className="text-muted-foreground">{row.last_error_message ?? row.alert_message ?? "—"}</p>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => transitionLifecycle(row.dispatch_key, "resolved", "resolved_from_console")}
                        disabled={deadLetterTransitionMutation.isPending || !row.dispatch_key || state === "resolved"}
                      >
                        حل
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => transitionLifecycle(row.dispatch_key, "retrying", "mark_retrying_from_console")}
                        disabled={deadLetterTransitionMutation.isPending || !row.dispatch_key}
                      >
                        تعيين قيد إعادة المحاولة
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => transitionLifecycle(row.dispatch_key, "dead_lettered", "escalated_from_console")}
                        disabled={deadLetterTransitionMutation.isPending || !row.dispatch_key}
                      >
                        تصعيد
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => transitionLifecycle(row.dispatch_key, "dead_lettered", "dead_lettered_from_console")}
                        disabled={deadLetterTransitionMutation.isPending || !row.dispatch_key || state === "dead_lettered"}
                      >
                        تعيين كحالة ميتة
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          replayMutation.mutate({
                            dispatch_key: String(row.dispatch_key ?? ""),
                            alert_id: String(row.alert_id ?? "manual-replay"),
                            alert_type: String(row.alert_type ?? "alert_delayed_orders"),
                            alert_title: String(row.alert_title ?? "Operational Alert Replay"),
                            alert_message: String(row.alert_message ?? row.last_error_message ?? "Replay from dead-letter queue"),
                            alert_link: row.alert_link ?? null,
                          })
                        }
                        disabled={replayMutation.isPending || !row.dispatch_key}
                      >
                        إعادة محاولة
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

