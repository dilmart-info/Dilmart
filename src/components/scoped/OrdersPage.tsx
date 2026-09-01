import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Search,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ScopedContext } from "@/lib/scoped-queries";
import { getScopedOrders, updateScopedOrderStatus } from "@/lib/scoped-queries";
import { apiClient } from "@/lib/api-client";
import { formatPrice } from "@/lib/format";
import { toast } from "sonner";
import ManualOrderModal from "@/components/admin/ManualOrderModal";
import {
  getMerchantOrderStatusLabel,
  getMerchantDecisionStatus,
  MERCHANT_ORDER_STATUS_MAP,
} from "@/lib/merchant-order-status";

type Props = {
  context: ScopedContext;
  title?: string;
  detailBasePath: string;
};

/**
 * Filter authority: includes display-only and queryable statuses like "pending"
 */
export const ORDER_FILTER_OPTIONS = [
  "new",
  "pending",
  "contacted",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
];

/**
 * Platform Admin Mutation authority: canonical status transitions authorized for Platform/Admin
 * Writable statuses must NOT be widened simply because a status is filterable or displayable.
 */
export const PLATFORM_ORDER_MUTATION_OPTIONS = [
  "new",
  "contacted",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
];

const PAGE_SIZE = 50;

export default function OrdersPage({ context, title = "الطلبات", detailBasePath }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [merchantFilter, setMerchantFilter] = useState("all");
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data: merchants } = useQuery({
    queryKey: ["scoped-orders-merchants"],
    enabled: context.scope === "platform",
    queryFn: () => apiClient.getActiveMerchants(),
  });

  const {
    data: ordersResponse,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["scoped-orders", context.scope, context.merchantId, search, status, merchantFilter, page],
    queryFn: () =>
      getScopedOrders(context, {
        search,
        status,
        merchantId: context.scope === "platform" && merchantFilter !== "all" ? merchantFilter : undefined,
        page,
        limit: PAGE_SIZE,
      }),
  });

  const orders = ordersResponse?.items ?? [];
  const total = ordersResponse?.total ?? 0;
  const hasMore = ordersResponse?.hasMore ?? false;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const handleStatusChange = (value: string) => {
    setStatus(value);
    setPage(1);
  };
  const handleMerchantChange = (value: string) => {
    setMerchantFilter(value);
    setPage(1);
  };

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => updateScopedOrderStatus(context, id, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scoped-orders"] });
      toast.success("تم تحديث حالة الطلب");
    },
    onError: () => toast.error("تعذر تحديث حالة الطلب"),
  });

  const hasFiltersApplied = Boolean(
    search.trim() || status !== "all" || (context.scope === "platform" && merchantFilter !== "all")
  );

  const emptyMessage = hasFiltersApplied
    ? "لا توجد طلبات مطابقة للفلاتر الحالية."
    : context.scope === "merchant"
    ? "لا توجد طلبات في متجرك حتى الآن."
    : "لا توجد طلبات مسجلة.";

  const isMerchantScope = context.scope === "merchant";

  return (
    <div className="space-y-5" data-testid="orders-page">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            متابعة دورة الطلبات، حالات التوصيل والقرارات التشغيلية.
          </p>
        </div>
        {context.scope === "platform" && (
          <Button onClick={() => setManualModalOpen(true)} size="sm" className="h-9 gap-1.5 rounded-lg text-xs font-bold">
            إنشاء طلب من محادثة
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-8 h-9 text-xs rounded-lg"
            placeholder={context.scope === "platform" ? "بحث بالاسم أو الهاتف أو رقم الطلب..." : "بحث برقم الطلب..."}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        <select
          className="h-9 rounded-lg border border-input bg-background px-3 text-xs w-full sm:w-44 text-foreground"
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          aria-label="فلترة الحالة"
        >
          <option value="all">كل الحالات</option>
          {ORDER_FILTER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {MERCHANT_ORDER_STATUS_MAP[s] ?? s}
            </option>
          ))}
        </select>

        {context.scope === "platform" && (
          <select
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs md:w-60 text-foreground"
            value={merchantFilter}
            onChange={(e) => handleMerchantChange(e.target.value)}
          >
            <option value="all">كل التجار</option>
            {(merchants ?? []).map((m: { id: string; display_name: string }) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Orders Container */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        {isLoading ? (
          /* State 1: Loading */
          <div className="py-12 text-center text-muted-foreground space-y-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
            <span className="text-xs font-medium">جاري تحميل الطلبات...</span>
          </div>
        ) : isError || error ? (
          /* State 2: Distinct API Error with Retry */
          <div className="py-10 text-center space-y-2 max-w-sm mx-auto px-4" data-testid="orders-error">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <p className="text-sm font-bold text-foreground">تعذر تحميل الطلبات</p>
            <p className="text-xs text-muted-foreground">{String((error as { message?: string })?.message ?? "حدث خطأ غير متوقع.")}</p>
            <Button size="sm" variant="outline" className="gap-1.5 rounded-lg text-xs font-bold" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span>إعادة المحاولة</span>
            </Button>
          </div>
        ) : orders.length === 0 ? (
          /* State 3: Distinct Empty State */
          <div className="py-12 text-center text-muted-foreground space-y-2 max-w-sm mx-auto px-4" data-testid="orders-empty">
            <ShoppingBag className="h-9 w-9 mx-auto text-muted-foreground/40" />
            <p className="text-sm font-bold text-foreground">{emptyMessage}</p>
            <p className="text-xs text-muted-foreground">
              {hasFiltersApplied
                ? "جرب البحث برقم طلب آخر أو إزالة فلتر الحالة."
                : isMerchantScope
                ? "ستظهر الطلبات الجديدة هنا فور قيام العملاء بالشراء من متجرك."
                : "لا توجد طلبات مسجلة للنطاق المحدد."}
            </p>
          </div>
        ) : (
          /* State 4: Populated Responsive Presentation */
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className={isMerchantScope ? "hidden md:table-header-group" : ""}>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right text-xs">رقم الطلب</TableHead>
                  {context.scope === "platform" && <TableHead className="text-right text-xs">العميل</TableHead>}
                  {context.scope === "platform" && <TableHead className="text-right text-xs">التاجر</TableHead>}
                  <TableHead className="text-right text-xs">الإجمالي</TableHead>
                  <TableHead className="text-right text-xs">الحالة والقرار</TableHead>
                  <TableHead className="text-right text-xs">التاريخ</TableHead>
                  <TableHead className="text-center text-xs">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={isMerchantScope ? "block md:table-row-group p-3 md:p-0 space-y-3 md:space-y-0" : ""}>
                {orders.map((o: {
                  id: string;
                  order_number: string;
                  customer_name?: string;
                  merchants?: { display_name?: string } | null;
                  total: number;
                  status: string;
                  merchant_decision_status?: string | null;
                  created_at: string;
                }) => {
                  const decision = getMerchantDecisionStatus(o.merchant_decision_status, o.status);
                  const statusLabel = getMerchantOrderStatusLabel(o.status);

                  return (
                    <TableRow
                      key={o.id}
                      className={
                        isMerchantScope
                          ? "block md:table-row rounded-xl border border-border bg-card p-3.5 md:p-0 mb-3 md:mb-0 shadow-2xs md:shadow-none hover:bg-muted/20"
                          : "hover:bg-muted/20"
                      }
                    >
                      <TableCell className={isMerchantScope ? "p-0 md:p-4 mb-1 md:mb-0 flex md:table-cell justify-between items-center" : "font-mono font-bold text-xs"}>
                        <span className="font-mono font-bold text-xs">#{o.order_number}</span>
                        <span className="text-[10px] text-muted-foreground md:hidden">
                          {new Date(o.created_at).toLocaleDateString("ar-IQ", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </TableCell>
                      {context.scope === "platform" && <TableCell className="text-xs">{o.customer_name ?? "—"}</TableCell>}
                      {context.scope === "platform" && <TableCell className="text-xs">{o.merchants?.display_name ?? "—"}</TableCell>}
                      <TableCell className={isMerchantScope ? "p-0 md:p-4 mb-1 md:mb-0 flex md:table-cell justify-between items-center" : "font-mono font-semibold text-xs"}>
                        <span className="text-xs text-muted-foreground md:hidden font-sans">الإجمالي:</span>
                        <span className="font-mono font-semibold text-xs">{formatPrice(o.total)}</span>
                      </TableCell>
                      <TableCell className={isMerchantScope ? "p-0 md:p-4 mb-2 md:mb-0 flex md:table-cell justify-between items-center" : ""}>
                        <span className="text-xs text-muted-foreground md:hidden font-sans">الحالة:</span>
                        {isMerchantScope ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {o.merchant_decision_status === "pending" ? (
                              <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[10px] py-0 font-bold animate-pulse">
                                {decision.label}
                              </Badge>
                            ) : o.merchant_decision_status === "rejected" ? (
                              <Badge variant="secondary" className="bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30 text-[10px] py-0 font-bold">
                                {decision.label}
                              </Badge>
                            ) : null}
                            <Badge variant="outline" className="text-[10px] py-0 font-medium">
                              {statusLabel}
                            </Badge>
                          </div>
                        ) : (
                          /* Platform Scope Mutation Select using PLATFORM_ORDER_MUTATION_OPTIONS */
                          <select
                            className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground cursor-pointer"
                            value={o.status ?? "new"}
                            onChange={(e) => updateStatusMutation.mutate({ id: o.id, value: e.target.value })}
                            aria-label="تحديث حالة الطلب"
                          >
                            {PLATFORM_ORDER_MUTATION_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {MERCHANT_ORDER_STATUS_MAP[s] ?? s}
                              </option>
                            ))}
                          </select>
                        )}
                      </TableCell>
                      <TableCell className={isMerchantScope ? "hidden md:table-cell text-xs text-muted-foreground" : "text-xs text-muted-foreground"}>
                        {new Date(o.created_at).toLocaleDateString("ar-IQ", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className={isMerchantScope ? "p-0 md:p-4 pt-2 md:pt-4 border-t border-border/40 md:border-t-0 flex justify-end md:table-cell md:text-center" : "text-center"}>
                        <Link to={`${detailBasePath}/${o.id}`}>
                          <Button size="sm" variant="outline" className="h-7 px-3 text-xs font-medium">
                            التفاصيل
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination Footer */}
        {total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 bg-muted/20 text-xs">
            <span className="text-muted-foreground">
              عرض {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} من {total} طلب
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs font-medium"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
                <span>السابق</span>
              </Button>
              <span className="text-muted-foreground px-2">
                صفحة {page} من {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs font-medium"
                disabled={!hasMore || isLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                <span>التالي</span>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <ManualOrderModal open={manualModalOpen} onOpenChange={setManualModalOpen} context={context} />
    </div>
  );
}
