import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  RefreshCw,
  ShoppingBag,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Store,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import {
  merchantApi,
  type CanonicalMerchantOrderSummary,
  type CanonicalMerchantOrdersResponse,
} from "@/lib/api/merchant";
import {
  getMerchantOrderStatusLabel,
  getMerchantDecisionStatus,
  MERCHANT_ORDER_STATUS_MAP,
} from "@/lib/merchant-order-status";
import { formatPrice } from "@/lib/format";

export const ORDER_FILTER_OPTIONS = [
  "all",
  "new",
  "pending",
  "contacted",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
] as const;

export const DECISION_FILTER_OPTIONS = [
  { value: "all", label: "كل القرارات" },
  { value: "pending", label: "بانتظار القرار" },
  { value: "accepted", label: "مقبول" },
  { value: "rejected", label: "مرفوض" },
] as const;

const PAGE_SIZE = 20;

/**
 * Fail-closed parser verifying canonical merchant orders response.
 * Enforces strict merchant_id match and non-negative numeric constraints,
 * and strictly guarantees no customer PII leakage.
 */
export function parseCanonicalOrdersResponse(
  raw: unknown,
  expectedMerchantId: string,
): CanonicalMerchantOrdersResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid orders payload: expected an object.");
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.merchant_id !== "string" || !obj.merchant_id.trim()) {
    throw new Error("Invalid orders payload: missing merchant_id.");
  }

  if (obj.merchant_id !== expectedMerchantId) {
    throw new Error(
      `Cross-store leakage detected: expected merchant_id ${expectedMerchantId} but received ${obj.merchant_id}.`,
    );
  }

  const rawList = Array.isArray(obj.orders)
    ? obj.orders
    : Array.isArray(obj.items)
    ? obj.items
    : null;

  if (!rawList) {
    throw new Error("Invalid orders payload: orders must be an array.");
  }

  const total = Number(obj.total);
  if (!Number.isFinite(total) || !Number.isInteger(total) || total < 0) {
    throw new Error("Invalid orders payload: total must be a non-negative integer.");
  }

  const limit = Number(obj.limit);
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1) {
    throw new Error("Invalid orders payload: limit must be a positive integer.");
  }

  const offset = Number(obj.offset ?? 0);
  if (!Number.isFinite(offset) || !Number.isInteger(offset) || offset < 0) {
    throw new Error("Invalid orders payload: offset must be a non-negative integer.");
  }

  const orders: CanonicalMerchantOrderSummary[] = rawList.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Invalid order item at index ${index}.`);
    }

    const o = item as Record<string, unknown>;

    if (typeof o.id !== "string" || !o.id.trim()) {
      throw new Error(`Invalid order id at index ${index}.`);
    }

    if (typeof o.order_number !== "string" || !o.order_number.trim()) {
      throw new Error(`Invalid order_number at index ${index}.`);
    }

    if (typeof o.merchant_id !== "string" || o.merchant_id !== expectedMerchantId) {
      throw new Error(`Order merchant_id mismatch at index ${index}.`);
    }

    if (typeof o.status !== "string" || !o.status.trim()) {
      throw new Error(`Invalid order status at index ${index}.`);
    }

    const totalAmount = Number(o.total);
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      throw new Error(`Invalid order total amount at index ${index}.`);
    }

    const subtotal = Number(o.subtotal ?? totalAmount);
    if (!Number.isFinite(subtotal) || subtotal < 0) {
      throw new Error(`Invalid order subtotal at index ${index}.`);
    }

    const discount = Number(o.discount ?? 0);
    if (!Number.isFinite(discount) || discount < 0) {
      throw new Error(`Invalid order discount at index ${index}.`);
    }

    const deliveryCost = Number(o.delivery_cost ?? 0);
    if (!Number.isFinite(deliveryCost) || deliveryCost < 0) {
      throw new Error(`Invalid order delivery_cost at index ${index}.`);
    }

    if (typeof o.created_at !== "string" || isNaN(Date.parse(o.created_at))) {
      throw new Error(`Invalid order created_at timestamp at index ${index}.`);
    }

    // Strict PII leak guard: orders list must never contain raw customer phone or detailed street address
    if ("customer_phone" in o && o.customer_phone) {
      throw new Error(`Security violation: customer_phone detected in merchant order summary.`);
    }
    if (("shipping_address" in o && o.shipping_address) || ("address" in o && o.address) || ("phone" in o && o.phone)) {
      throw new Error(`Security violation: address or phone PII detected in merchant order summary.`);
    }
    if ("merchant_notes" in o && o.merchant_notes !== undefined) {
      throw new Error(`Security violation: merchant_notes detected in merchant order summary.`);
    }

    return {
      id: o.id,
      order_number: o.order_number,
      merchant_id: o.merchant_id,
      status: o.status,
      channel: typeof o.channel === "string" ? o.channel : null,
      created_at: o.created_at,
      updated_at: typeof o.updated_at === "string" ? o.updated_at : o.created_at,
      subtotal,
      discount,
      delivery_cost: deliveryCost,
      total: totalAmount,
      payment_method: typeof o.payment_method === "string" ? o.payment_method : null,
      merchant_decision_status:
        typeof o.merchant_decision_status === "string" ? o.merchant_decision_status : null,
      governorate: typeof o.governorate === "string" ? o.governorate : null,
    };
  });

  return {
    merchant_id: expectedMerchantId,
    orders,
    total,
    limit,
    offset,
    items: orders,
    page: Math.floor(offset / limit) + 1,
    hasMore: offset + limit < total,
  };
}

export function MerchantOrdersSkeleton() {
  return (
    <div className="space-y-5" data-testid="orders-skeleton">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/70 pb-4">
        <div className="space-y-2">
          <div className="h-6 w-36 bg-muted/60 rounded-md animate-pulse" />
          <div className="h-3.5 w-60 bg-muted/40 rounded-md animate-pulse" />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="h-9 flex-1 sm:max-w-xs bg-muted/50 rounded-lg animate-pulse" />
        <div className="h-9 w-full sm:w-44 bg-muted/50 rounded-lg animate-pulse" />
        <div className="h-9 w-full sm:w-44 bg-muted/50 rounded-lg animate-pulse" />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 w-full bg-muted/40 rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}

interface MerchantOrdersWorkspaceProps {
  merchantId: string;
}

export function MerchantOrdersWorkspace({ merchantId }: MerchantOrdersWorkspaceProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [decisionStatus, setDecisionStatus] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["merchant-orders", merchantId, search, status, decisionStatus, page],
    queryFn: async () => {
      const res = await merchantApi.listMerchantOrders(merchantId, {
        search: search.trim() || undefined,
        status: status !== "all" ? status : undefined,
        merchant_decision_status: decisionStatus !== "all" ? decisionStatus : undefined,
        page,
        limit: PAGE_SIZE,
      });
      return parseCanonicalOrdersResponse(res, merchantId);
    },
  });

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasFiltersApplied = Boolean(
    search.trim() || status !== "all" || decisionStatus !== "all",
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    setPage(1);
  };

  const handleDecisionStatusChange = (value: string) => {
    setDecisionStatus(value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch("");
    setStatus("all");
    setDecisionStatus("all");
    setPage(1);
  };

  return (
    <div className="space-y-5" data-testid="merchant-orders-workspace">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">طلبات المتجر</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            متابعة الطلبات، القرارات التشغيلية، وحالات التوصيل للمتجر الحالي.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-lg text-xs font-bold self-start sm:self-auto"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="تحديث الطلبات"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          <span>تحديث</span>
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="orders-search-input"
            className="pr-8 h-9 text-xs rounded-lg"
            placeholder="بحث برقم الطلب..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="بحث برقم الطلب"
          />
        </div>

        <select
          data-testid="orders-status-filter"
          className="h-9 rounded-lg border border-input bg-background px-3 text-xs w-full sm:w-44 text-foreground cursor-pointer"
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          aria-label="فلترة الحالة"
        >
          {ORDER_FILTER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "كل الحالات" : MERCHANT_ORDER_STATUS_MAP[s] ?? s}
            </option>
          ))}
        </select>

        <select
          className="h-9 rounded-lg border border-input bg-background px-3 text-xs w-full sm:w-44 text-foreground cursor-pointer"
          value={decisionStatus}
          onChange={(e) => handleDecisionStatusChange(e.target.value)}
          aria-label="فلترة القرار"
        >
          {DECISION_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {hasFiltersApplied && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            className="text-xs text-muted-foreground hover:text-foreground h-9 self-start sm:self-auto"
          >
            مسح الفلاتر
          </Button>
        )}
      </div>

      {/* Orders Container */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground space-y-3" data-testid="orders-loading">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
            <span className="text-xs font-medium">جاري تحميل طلبات المتجر...</span>
          </div>
        ) : isError || error ? (
          <div className="py-10 text-center space-y-2 max-w-sm mx-auto px-4" data-testid="orders-error">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <p className="text-sm font-bold text-foreground">تعذر تحميل الطلبات</p>
            <p className="text-xs text-muted-foreground">
              {String((error as { message?: string })?.message ?? "حدث خطأ غير متوقع أثناء تحميل البيانات.")}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-lg text-xs font-bold"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span>إعادة المحاولة</span>
            </Button>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground space-y-2 max-w-sm mx-auto px-4" data-testid="orders-empty">
            <ShoppingBag className="h-9 w-9 mx-auto text-muted-foreground/40" />
            <p className="text-sm font-bold text-foreground">
              {hasFiltersApplied ? "لا توجد طلبات مطابقة للفلاتر." : "لا توجد طلبات في متجرك حتى الآن."}
            </p>
            <p className="text-xs text-muted-foreground">
              {hasFiltersApplied
                ? "جرب البحث برقم طلب آخر أو تغيير خيارات التصفية."
                : "ستظهر الطلبات الجديدة هنا فور قيام العملاء بالشراء من متجرك."}
            </p>
            {hasFiltersApplied && (
              <Button size="sm" variant="outline" onClick={handleResetFilters} className="text-xs mt-2">
                مسح الفلاتر
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto" data-testid="orders-content">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="text-right text-xs">رقم الطلب</TableHead>
                  <TableHead className="text-right text-xs">التاريخ</TableHead>
                  <TableHead className="text-right text-xs">المحافظة</TableHead>
                  <TableHead className="text-right text-xs">الإجمالي</TableHead>
                  <TableHead className="text-right text-xs">قرار التاجر</TableHead>
                  <TableHead className="text-right text-xs">حالة الطلب</TableHead>
                  <TableHead className="text-center text-xs">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const decision = getMerchantDecisionStatus(o.merchant_decision_status);
                  const statusLabel = getMerchantOrderStatusLabel(o.status);

                  return (
                    <TableRow key={o.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-mono text-xs font-bold text-foreground">
                        {o.order_number}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("ar-IQ", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {o.governorate ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-foreground">
                        {formatPrice(o.total)}
                      </TableCell>
                      <TableCell>
                        {o.merchant_decision_status === "pending" ? (
                          <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[10px] py-0 font-bold">
                            {decision.label}
                          </Badge>
                        ) : o.merchant_decision_status === "accepted" ? (
                          <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] py-0 font-bold">
                            {decision.label}
                          </Badge>
                        ) : o.merchant_decision_status === "rejected" ? (
                          <Badge variant="secondary" className="bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30 text-[10px] py-0 font-bold">
                            {decision.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] py-0 font-medium">
                          {statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Link to={`/merchant/orders/${encodeURIComponent(o.id)}`}>
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 bg-muted/20 text-xs text-muted-foreground">
            <div>
              عرض <span className="font-bold text-foreground">{orders.length}</span> من إجمالي{" "}
              <span className="font-bold text-foreground">{total}</span> طلب
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
                <span>السابق</span>
              </Button>
              <span className="text-xs font-medium px-2">
                صفحة {page} من {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <span>التالي</span>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MerchantOrders() {
  const { data: membership, isLoading } = useCurrentMerchant();
  const merchantId = membership?.merchant_id;

  useEffect(() => {
    document.title = "طلبات المتجر | DILMART";
  }, []);

  if (isLoading) {
    return <MerchantOrdersSkeleton />;
  }

  if (!merchantId) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground space-y-3" data-testid="orders-unattached">
        <Store className="h-8 w-8 mx-auto text-muted-foreground/50" />
        <p className="text-sm font-medium">لا يوجد متجر نشط مرتبط بحسابك حالياً.</p>
      </div>
    );
  }

  return <MerchantOrdersWorkspace key={merchantId} merchantId={merchantId} />;
}
