import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

const AdminMerchants = () => {
  const [readinessFilter, setReadinessFilter] = useState<"all" | "ready" | "not_ready">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "pending_review" | "active" | "suspended" | "rejected" | "archived">("all");

  const { data: merchants, refetch } = useQuery({
    queryKey: ["admin-merchants"],
    queryFn: () => apiClient.getAdminMerchants(),
  });

  const { data: readinessMap } = useQuery({
    queryKey: ["admin-merchants-readiness", merchants?.map((m: any) => m.id).join(",")],
    enabled: Boolean(merchants && merchants.length > 0),
    queryFn: async () => {
      const entries = await Promise.all(
        (merchants ?? []).map(async (m: any) => {
          const readiness = await apiClient.getMerchantReadiness(m.id);
          return [m.id, readiness] as const;
        }),
      );
      const normalized = entries.map(([id, readiness]) => [
        id,
        {
          score: readiness.score,
          is_ready: readiness.is_ready,
          missing_labels: (readiness.checklist ?? []).filter((item: any) => !item.passed).map((item: any) => item.label as string),
        },
      ]);
      return Object.fromEntries(normalized) as Record<string, { score: number; is_ready: boolean; missing_labels: string[] }>;
    },
  });

  const { data: scorecardMap } = useQuery({
    queryKey: ["admin-merchants-scorecards", merchants?.map((m: any) => m.id).join(",")],
    enabled: Boolean(merchants && merchants.length > 0),
    queryFn: async () => {
      const entries = await Promise.all(
        (merchants ?? []).map(async (m: any) => {
          const scorecard = await apiClient.getMerchantPerformanceScorecard(m.id);
          return [m.id, scorecard] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, { score: number; trend: string }>;
    },
  });

  const updateStatus = async (id: string, status: "active" | "suspended") => {
    try {
      await apiClient.updateMerchantStatus(id, { status });
      toast.success(status === "active" ? "تم تفعيل التاجر" : "تم تعليق التاجر");
      await refetch();
    } catch (e: any) {
      const message = String(e?.message ?? "");
      if (status === "active" && message.includes("MERCHANT_NOT_READY")) {
        const missingLabels = (readinessMap?.[id]?.missing_labels ?? []).slice(0, 3);
        const hint = missingLabels.length > 0 ? ` — النواقص: ${missingLabels.join("، ")}` : "";
        toast.error(`لا يمكن تفعيل التاجر قبل استكمال الجاهزية${hint}`);
        return;
      }
      toast.error("تعذر تحديث حالة التاجر");
    }
  };

  const approveMerchant = async (id: string) => {
    try {
      await apiClient.approveMerchant(id);
      toast.success("تمت الموافقة على طلب التاجر");
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || "تعذر اعتماد التاجر");
    }
  };

  const rejectMerchant = async (id: string) => {
    const reason = window.prompt("سبب الرفض:");
    if (!reason) return;
    try {
      await apiClient.rejectMerchant(id, reason);
      toast.success("تم رفض طلب التاجر");
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || "تعذر رفض الطلب");
    }
  };

  const filteredMerchants = (merchants ?? []).filter((m: any) => {
    const byStatus = statusFilter === "all" ? true : m.status === statusFilter;
    const isReady = Boolean(readinessMap?.[m.id]?.is_ready);
    const byReadiness = readinessFilter === "all" ? true : readinessFilter === "ready" ? isReady : !isReady;
    return byStatus && byReadiness;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">إدارة التجار</h2>
        <Link
          to="/admin/merchants/new"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          إنشاء تاجر
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">تصفية الحالة:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">الكل</option>
            <option value="draft">draft</option>
            <option value="pending_review">pending_review</option>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="rejected">rejected</option>
            <option value="archived">archived</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">تصفية الجاهزية:</span>
          <select
            value={readinessFilter}
            onChange={(e) => setReadinessFilter(e.target.value as any)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">الكل</option>
            <option value="ready">جاهز</option>
            <option value="not_ready">غير جاهز</option>
          </select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-right">
              <th className="p-3">الاسم</th>
              <th className="p-3">Slug</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">الجاهزية</th>
              <th className="p-3">الأداء</th>
              <th className="p-3">التاريخ</th>
              <th className="p-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredMerchants.map((m: any) => (
              <tr key={m.id} className="border-t border-border">
                <td className="p-3">{m.display_name}</td>
                <td className="p-3">{m.slug}</td>
                <td className="p-3">{m.status}</td>
                <td className="p-3 align-top">
                  <div className="space-y-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                        readinessMap?.[m.id]?.is_ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                      title={
                        readinessMap?.[m.id]?.is_ready
                          ? "المتجر جاهز للتشغيل"
                          : `النواقص: ${(readinessMap?.[m.id]?.missing_labels ?? []).join("، ")}`
                      }
                    >
                      {readinessMap?.[m.id]?.score ?? 0}%
                    </span>
                    {!readinessMap?.[m.id]?.is_ready && (readinessMap?.[m.id]?.missing_labels?.length ?? 0) > 0 ? (
                      <p className="text-[11px] leading-5 text-muted-foreground">
                        نواقص: {(readinessMap?.[m.id]?.missing_labels ?? []).slice(0, 2).join("، ")}
                        {(readinessMap?.[m.id]?.missing_labels?.length ?? 0) > 2 ? "..." : ""}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="p-3">
                  <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">
                    {scorecardMap?.[m.id]?.score ?? 0}%
                  </span>
                </td>
                <td className="p-3">{new Date(m.created_at).toLocaleDateString("ar-IQ")}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Link to={`/admin/merchants/${m.id}`} className="underline">تفاصيل</Link>
                    {!readinessMap?.[m.id]?.is_ready ? (
                      <Link to={`/admin/merchants/${m.id}`} className="text-primary underline">
                        اذهب للإكمال
                      </Link>
                    ) : null}
                    {m.status === "pending_review" ? (
                      <>
                        <button type="button" className="text-emerald-600 underline" onClick={() => approveMerchant(m.id)}>
                          موافقة
                        </button>
                        <button type="button" className="text-destructive underline" onClick={() => rejectMerchant(m.id)}>
                          رفض
                        </button>
                      </>
                    ) : null}
                    {m.status !== "active" ? (
                      <button type="button" className="text-emerald-600 underline" onClick={() => updateStatus(m.id, "active")}>
                        تفعيل
                      </button>
                    ) : (
                      <button type="button" className="text-amber-600 underline" onClick={() => updateStatus(m.id, "suspended")}>
                        تعليق
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredMerchants.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  لا توجد نتائج مطابقة للفلاتر الحالية.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminMerchants;
