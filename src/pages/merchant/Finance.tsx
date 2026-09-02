import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { apiClient } from "@/lib/api-client";
import { formatPrice } from "@/lib/format";
import { canMerchantViewFinance } from "@/lib/merchant-role-authority";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

const STATUS_OPTIONS = ["all", "accrued", "payable", "in_payout", "settled", "reversed", "disputed"] as const;

const ENTRY_TYPE_LABELS: Record<string, string> = {
  order_accrual: "استحقاق طلب",
  commission_charge: "عمولة المنصة",
  assisted_fee_charge: "رسوم المساعدة",
  delivery_deduction: "خصم التوصيل",
  refund_reversal: "عكس/استرجاع",
  manual_adjustment: "تسوية يدوية",
  payout: "دفعة تسوية",
  payout_reversal: "عكس دفعة",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "معلّق",
  accrued: "متراكم",
  payable: "قابل للدفع",
  in_payout: "ضمن دفعة",
  settled: "مسوّى",
  reversed: "معكوس",
  disputed: "متنازع",
  draft: "مسودة",
  approved: "معتمد",
  processing: "قيد المعالجة",
  cancelled: "ملغي",
};

/**
 * Asserts that an API response contains a non-empty merchant_id matching the requested merchantId.
 * Fails closed before entering React Query cache.
 */
function assertFinanceContractMerchantId<T extends { merchant_id?: string }>(data: T, expectedMerchantId: string): T {
  if (!data || !data.merchant_id || data.merchant_id !== expectedMerchantId) {
    throw new Error(`FINANCE_CONTRACT_MISMATCH: expected merchant ${expectedMerchantId} but received ${data?.merchant_id ?? "empty"}`);
  }
  return data;
}

interface MerchantFinanceWorkspaceProps {
  merchantId: string;
}

function MerchantFinanceWorkspace({ merchantId }: MerchantFinanceWorkspaceProps) {
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statementPage, setStatementPage] = useState(0);
  const [payoutPage, setPayoutPage] = useState(0);
  const statementPageSize = 20;
  const payoutPageSize = 10;

  const financeSummary = useQuery({
    queryKey: ["merchant-finance-summary", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const res = await apiClient.getMerchantFinanceSummary(merchantId);
      return assertFinanceContractMerchantId(res, merchantId);
    },
  });

  const statement = useQuery({
    queryKey: ["merchant-finance-statement", merchantId, status, fromDate, toDate, statementPage],
    enabled: !!merchantId,
    queryFn: async () => {
      const res = await apiClient.getMerchantFinanceStatement(merchantId, {
        limit: statementPageSize,
        offset: statementPage * statementPageSize,
        status: status === "all" ? undefined : status,
        from: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
        to: toDate ? `${toDate}T23:59:59.999Z` : undefined,
      });
      return assertFinanceContractMerchantId(res, merchantId);
    },
  });

  const payoutHistory = useQuery({
    queryKey: ["merchant-finance-payout-history", merchantId, fromDate, toDate, payoutPage],
    enabled: !!merchantId,
    queryFn: async () => {
      const res = await apiClient.getMerchantPayoutHistory(merchantId, {
        limit: payoutPageSize,
        offset: payoutPage * payoutPageSize,
        from: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
        to: toDate ? `${toDate}T23:59:59.999Z` : undefined,
      });
      return assertFinanceContractMerchantId(res, merchantId);
    },
  });

  const statementRows = useMemo(() => statement.data?.entries ?? [], [statement.data?.entries]);
  const isStatementValidCurrent = statement.isSuccess && statement.data?.merchant_id === merchantId;

  const exportStatementCsv = () => {
    if (!isStatementValidCurrent || statementRows.length === 0) return;
    const rows = statementRows;
    const header = ["التاريخ", "نوع القيد", "الاتجاه", "المبلغ", "الحالة", "رقم الطلب", "الوصف"];
    const lines = rows.map((r) =>
      [
        r.effective_at ?? r.created_at,
        ENTRY_TYPE_LABELS[r.entry_type] ?? r.entry_type,
        r.direction === "credit" ? "دائن" : "مدين",
        Number(r.amount ?? 0),
        STATUS_LABELS[r.status] ?? r.status,
        r.order_id ?? "",
        (r.description ?? "").replaceAll(",", " "),
      ].join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `merchant_statement_${merchantId}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">المالية والتسوية</h2>
        <p className="text-muted-foreground mt-1">ملخص المستحقات وكشف الحساب وسجل الدفعات.</p>
      </div>

      {/* Summary Cards Section */}
      {financeSummary.isLoading ? (
        <div className="grid gap-4 md:grid-cols-4" data-testid="finance-summary-loading">
          <Card className="border-none shadow-sm"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">متراكم</p><p className="text-sm font-medium text-muted-foreground animate-pulse">جاري التحميل...</p></CardContent></Card>
          <Card className="border-none shadow-sm"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">قابل للدفع</p><p className="text-sm font-medium text-muted-foreground animate-pulse">جاري التحميل...</p></CardContent></Card>
          <Card className="border-none shadow-sm"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">ضمن دفعة</p><p className="text-sm font-medium text-muted-foreground animate-pulse">جاري التحميل...</p></CardContent></Card>
          <Card className="border-none shadow-sm"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">الرصيد المعلّق</p><p className="text-sm font-medium text-muted-foreground animate-pulse">جاري التحميل...</p></CardContent></Card>
        </div>
      ) : financeSummary.isError ? (
        <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/10 flex items-center justify-between gap-4" data-testid="finance-summary-error">
          <div className="flex items-center gap-2 text-sm text-destructive font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>تعذر تحميل ملخص المالية للمتجر الحالي.</span>
          </div>
          <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => financeSummary.refetch()}>
            <RefreshCw className="h-3.5 w-3.5 ml-1.5" />
            إعادة المحاولة
          </Button>
        </div>
      ) : financeSummary.data ? (
        <div className="grid gap-4 md:grid-cols-4" data-testid="finance-summary-cards">
          <Card className="border-none shadow-sm"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">متراكم</p><p className="text-2xl font-bold">{formatPrice(financeSummary.data.total_accrued)}</p></CardContent></Card>
          <Card className="border-none shadow-sm"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">قابل للدفع</p><p className="text-2xl font-bold">{formatPrice(financeSummary.data.total_payable)}</p></CardContent></Card>
          <Card className="border-none shadow-sm"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">ضمن دفعة</p><p className="text-2xl font-bold">{formatPrice(financeSummary.data.total_in_payout)}</p></CardContent></Card>
          <Card className="border-none shadow-sm"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">الرصيد المعلّق</p><p className="text-2xl font-bold">{formatPrice(financeSummary.data.outstanding_balance)}</p></CardContent></Card>
        </div>
      ) : null}

      {/* Statement Section */}
      <Card className="border-none shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg">كشف الحساب</CardTitle>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              aria-label="من تاريخ"
              className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-700"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setStatementPage(0);
              }}
            />
            <input
              type="date"
              aria-label="إلى تاريخ"
              className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-700"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setStatementPage(0);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={exportStatementCsv}
              disabled={!isStatementValidCurrent || statementRows.length === 0 || statement.isLoading || statement.isError}
            >
              تصدير الصفحة CSV
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "default" : "outline"}
                onClick={() => {
                  setStatus(s);
                  setStatementPage(0);
                }}
              >
                {s === "all" ? "الكل" : STATUS_LABELS[s] ?? s}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {statement.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground animate-pulse" data-testid="statement-loading">
              جاري تحميل كشف الحساب...
            </div>
          ) : statement.isError ? (
            <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/10 flex items-center justify-between gap-4" data-testid="statement-error">
              <div className="flex items-center gap-2 text-sm text-destructive font-medium">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>تعذر تحميل كشف الحساب للمتجر الحالي.</span>
              </div>
              <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => statement.refetch()}>
                <RefreshCw className="h-3.5 w-3.5 ml-1.5" />
                إعادة المحاولة
              </Button>
            </div>
          ) : isStatementValidCurrent ? (
            <>
              {statementRows.map((row) => (
                <div key={row.id} className="rounded border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{ENTRY_TYPE_LABELS[row.entry_type] ?? row.entry_type}</div>
                    <Badge variant={row.direction === "credit" ? "secondary" : "outline"}>{STATUS_LABELS[row.status] ?? row.status}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    {row.direction === "credit" ? "+" : "-"} {formatPrice(row.amount)} {row.order_id ? `• طلب ${row.order_id.slice(0, 8)}` : ""}
                  </p>
                </div>
              ))}
              {statementRows.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">لا توجد قيود ضمن الفلتر الحالي.</p>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground">الإجمالي: {statement.data?.total ?? 0}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={statementPage === 0} onClick={() => setStatementPage((p) => Math.max(0, p - 1))}>
                    السابق
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={(statement.data?.offset ?? 0) + (statement.data?.limit ?? statementPageSize) >= (statement.data?.total ?? 0)}
                    onClick={() => setStatementPage((p) => p + 1)}
                  >
                    التالي
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Payout History Section */}
      <Card className="border-none shadow-sm">
        <CardHeader><CardTitle className="text-lg">سجل دفعات التسوية</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {payoutHistory.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground animate-pulse" data-testid="payout-loading">
              جاري تحميل سجل دفعات التسوية...
            </div>
          ) : payoutHistory.isError ? (
            <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/10 flex items-center justify-between gap-4" data-testid="payout-error">
              <div className="flex items-center gap-2 text-sm text-destructive font-medium">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>تعذر تحميل سجل دفعات التسوية للمتجر الحالي.</span>
              </div>
              <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => payoutHistory.refetch()}>
                <RefreshCw className="h-3.5 w-3.5 ml-1.5" />
                إعادة المحاولة
              </Button>
            </div>
          ) : payoutHistory.isSuccess && payoutHistory.data?.merchant_id === merchantId ? (
            <>
              {(payoutHistory.data?.payouts ?? []).map((payout) => (
                <div key={payout.id} className="rounded border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{payout.id.slice(0, 8)}</div>
                    <Badge variant="outline">{STATUS_LABELS[payout.status] ?? payout.status}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    صافي {formatPrice(payout.net_amount)} • دائن {formatPrice(payout.total_credits)} • مدين {formatPrice(payout.total_debits)}
                  </p>
                </div>
              ))}
              {(payoutHistory.data?.payouts ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">لا يوجد سجل دفعات حتى الآن.</p>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground">الإجمالي: {payoutHistory.data?.total ?? 0}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={payoutPage === 0} onClick={() => setPayoutPage((p) => Math.max(0, p - 1))}>
                    السابق
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={(payoutHistory.data?.offset ?? 0) + (payoutHistory.data?.limit ?? payoutPageSize) >= (payoutHistory.data?.total ?? 0)}
                    onClick={() => setPayoutPage((p) => p + 1)}
                  >
                    التالي
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MerchantFinance() {
  const { data: membership, isLoading } = useCurrentMerchant();
  const merchantId = membership?.merchant_id;
  const role = membership?.role;


  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground animate-pulse">جاري التحميل...</div>;
  }

  if (!merchantId) {
    return <div className="text-muted-foreground py-8 text-center">لا يوجد متجر مرتبط بحسابك.</div>;
  }

  if (!canMerchantViewFinance(role)) {
    return (
      <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-sm font-medium" data-testid="finance-unauthorized">
        ليس لديك صلاحية لعرض البيانات المالية لهذا المتجر.
      </div>
    );
  }

  return <MerchantFinanceWorkspace key={merchantId} merchantId={merchantId} />;
}
