import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  Upload,
  Layers,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
import { merchantApi, CanonicalMerchantDashboardResponse } from "@/lib/api/merchant";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { getMerchantOrderStatusLabel } from "@/lib/merchant-order-status";

/**
 * Validates and parses raw backend response against the canonical merchant dashboard contract.
 * Fails closed if merchant_id is missing/mismatched or numbers are corrupted/negative.
 */
export function parseCanonicalDashboardResponse(
  raw: unknown,
  expectedMerchantId: string
): CanonicalMerchantDashboardResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("استجابة خادم لوحة التاجر غير صالحة: البنية ليست كائناً");
  }

  const obj = raw as Record<string, unknown>;

  // Strict merchant_id check
  if (typeof obj.merchant_id !== "string" || !obj.merchant_id.trim()) {
    throw new Error("استجابة خادم لوحة التاجر غير صالحة: حقل merchant_id مفقود أو غير نصي");
  }

  if (obj.merchant_id !== expectedMerchantId) {
    throw new Error(
      `تعارض أمان المتجر: معرف المتجر في الاستجابة (${obj.merchant_id}) لا يطابق المتجر النشط (${expectedMerchantId})`
    );
  }

  const requireNonNegativeInteger = (val: unknown, fieldName: string): number => {
    if (typeof val !== "number" || !Number.isFinite(val) || !Number.isInteger(val) || val < 0) {
      throw new Error(`استجابة خادم لوحة التاجر غير صالحة: ${fieldName} يجب أن يكون عدداً صحيحاً غير سالب`);
    }
    return val;
  };

  const requireNonNegativeNumber = (val: unknown, fieldName: string): number => {
    if (typeof val !== "number" || !Number.isFinite(val) || Number.isNaN(val) || val < 0) {
      throw new Error(`استجابة خادم لوحة التاجر غير صالحة: ${fieldName} يجب أن يكون رقماً مالياً غير سالب`);
    }
    return val;
  };

  // Products block validation
  if (!obj.products || typeof obj.products !== "object" || Array.isArray(obj.products)) {
    throw new Error("استجابة خادم لوحة التاجر غير صالحة: قسم products مفقود");
  }
  const rawProducts = obj.products as Record<string, unknown>;
  const products = {
    total: requireNonNegativeInteger(rawProducts.total, "products.total"),
    active: requireNonNegativeInteger(rawProducts.active, "products.active"),
    inactive: requireNonNegativeInteger(rawProducts.inactive, "products.inactive"),
    low_stock: requireNonNegativeInteger(rawProducts.low_stock, "products.low_stock"),
  };

  // Orders block validation
  if (!obj.orders || typeof obj.orders !== "object" || Array.isArray(obj.orders)) {
    throw new Error("استجابة خادم لوحة التاجر غير صالحة: قسم orders مفقود");
  }
  const rawOrders = obj.orders as Record<string, unknown>;
  const orders = {
    today: requireNonNegativeInteger(rawOrders.today, "orders.today"),
    completed_7d: requireNonNegativeInteger(rawOrders.completed_7d, "orders.completed_7d"),
    average_order_value_7d: requireNonNegativeNumber(rawOrders.average_order_value_7d, "orders.average_order_value_7d"),
    revenue_7d: requireNonNegativeNumber(rawOrders.revenue_7d, "orders.revenue_7d"),
  };

  // Top products array validation
  if (!Array.isArray(obj.top_products)) {
    throw new Error("استجابة خادم لوحة التاجر غير صالحة: top_products يجب أن تكون مصفوفة");
  }
  const top_products = obj.top_products.map((item, idx) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`استجابة غير صالحة: top_products[${idx}] ليس كائناً`);
    }
    const itemObj = item as Record<string, unknown>;
    if (typeof itemObj.product_id !== "string" || !itemObj.product_id) {
      throw new Error(`استجابة غير صالحة: top_products[${idx}].product_id مفقود`);
    }
    let revenue: number | undefined;
    if (itemObj.revenue !== undefined) {
      revenue = requireNonNegativeNumber(itemObj.revenue, `top_products[${idx}].revenue`);
    }

    return {
      product_id: itemObj.product_id,
      name: typeof itemObj.name === "string" ? itemObj.name : "منتج",
      units_sold: requireNonNegativeInteger(itemObj.units_sold, `top_products[${idx}].units_sold`),
      revenue,
    };
  });


  // Low stock products array validation
  if (!Array.isArray(obj.low_stock_products)) {
    throw new Error("استجابة خادم لوحة التاجر غير صالحة: low_stock_products يجب أن تكون مصفوفة");
  }
  const low_stock_products = obj.low_stock_products.map((item, idx) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`استجابة غير صالحة: low_stock_products[${idx}] ليس كائناً`);
    }
    const itemObj = item as Record<string, unknown>;
    if (typeof itemObj.product_id !== "string" || !itemObj.product_id) {
      throw new Error(`استجابة غير صالحة: low_stock_products[${idx}].product_id مفقود`);
    }
    return {
      product_id: itemObj.product_id,
      name: typeof itemObj.name === "string" ? itemObj.name : "منتج",
      stock: requireNonNegativeInteger(itemObj.stock, `low_stock_products[${idx}].stock`),
      threshold: requireNonNegativeInteger(itemObj.threshold, `low_stock_products[${idx}].threshold`),
    };
  });

  // Recent orders array validation
  if (!Array.isArray(obj.recent_orders)) {
    throw new Error("استجابة خادم لوحة التاجر غير صالحة: recent_orders يجب أن تكون مصفوفة");
  }
  const recent_orders = obj.recent_orders.map((item, idx) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`استجابة غير صالحة: recent_orders[${idx}] ليس كائناً`);
    }
    const itemObj = item as Record<string, unknown>;
    if (typeof itemObj.id !== "string" || !itemObj.id) {
      throw new Error(`استجابة غير صالحة: recent_orders[${idx}].id مفقود`);
    }
    if (typeof itemObj.order_number !== "string" || !itemObj.order_number) {
      throw new Error(`استجابة غير صالحة: recent_orders[${idx}].order_number مفقود`);
    }
    if (typeof itemObj.status !== "string") {
      throw new Error(`استجابة غير صالحة: recent_orders[${idx}].status مفقود`);
    }
    const total = requireNonNegativeNumber(itemObj.total, `recent_orders[${idx}].total`);
    if (typeof itemObj.created_at !== "string" || Number.isNaN(Date.parse(itemObj.created_at))) {
      throw new Error(`استجابة غير صالحة: recent_orders[${idx}].created_at ليس تاريخاً صالحاً`);
    }
    return {
      id: itemObj.id,
      order_number: itemObj.order_number,
      status: itemObj.status,
      total,
      created_at: itemObj.created_at,
    };
  });

  return {
    merchant_id: obj.merchant_id,
    products,
    orders,
    top_products,
    low_stock_products,
    recent_orders,
  };
}

export const MerchantOverviewSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse" data-testid="overview-loading">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-muted rounded-lg" />
        <div className="h-4 w-72 bg-muted rounded-md" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-28 bg-muted rounded-lg" />
        <div className="h-9 w-28 bg-muted rounded-lg" />
      </div>
    </div>

    {/* Top metrics skeleton */}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-28 rounded-xl border bg-card p-4 space-y-3">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-8 w-32 bg-muted rounded" />
        </div>
      ))}
    </div>

    {/* Secondary metrics skeleton */}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-20 rounded-xl border bg-card p-3 space-y-2">
          <div className="h-3 w-20 bg-muted rounded" />
          <div className="h-6 w-16 bg-muted rounded" />
        </div>
      ))}
    </div>
  </div>
);

export const MerchantOverviewWorkspace: React.FC<{ merchantId: string }> = ({ merchantId }) => {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["merchant-dashboard-canonical", merchantId],
    queryFn: async () => {
      const raw = await merchantApi.getMerchantDashboard(merchantId);
      return parseCanonicalDashboardResponse(raw, merchantId);
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return <MerchantOverviewSkeleton />;
  }

  if (isError || !data) {
    return (
      <div
        className="rounded-2xl border border-destructive/20 bg-card p-8 text-center space-y-4 max-w-lg mx-auto my-12"
        data-testid="overview-error"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-foreground">تعذر تحميل بيانات المتجر</h2>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "حدث خطأ أثناء جلب مؤشرات الأداء والطلبات."}
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 rounded-xl font-bold"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          <span>إعادة المحاولة</span>
        </Button>
      </div>
    );
  }

  const { products, orders, top_products = [], low_stock_products = [], recent_orders = [] } = data;

  return (
    <div className="space-y-6" data-testid="overview-content">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
            لوحة إنتاجية المتجر
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            متابعة فورية للمبيعات اليومية، حالة المخزون، وأحدث الطلبات الواردة.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/merchant/products/import">
            <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg text-xs font-bold">
              <Upload className="h-3.5 w-3.5" />
              <span>استيراد ملف</span>
            </Button>
          </Link>
          <Link to="/merchant/products">
            <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg text-xs font-bold">
              <Layers className="h-3.5 w-3.5" />
              <span>إدارة المنتجات</span>
            </Button>
          </Link>
          <Link to="/merchant/orders">
            <Button size="sm" className="h-9 gap-1.5 rounded-lg text-xs font-bold">
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>عرض الطلبات</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Row 1: Primary Operational Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Today's Orders */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">طلبات اليوم</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-foreground">{orders.today}</p>
          <p className="text-[11px] text-muted-foreground">طلبات اليوم</p>
        </div>

        {/* Metric 2: 7-Day Revenue */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">مبيعات آخر 7 أيام</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-foreground">{formatPrice(orders.revenue_7d)}</p>
          <p className="text-[11px] text-muted-foreground">إجمالي القيمة المحققة لطلبات المتجر</p>
        </div>

        {/* Metric 3: Average Order Value */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">متوسط قيمة الطلب</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-foreground">{formatPrice(orders.average_order_value_7d)}</p>
          <p className="text-[11px] text-muted-foreground">متوسط سلة المشتريات لآخر 7 أيام</p>
        </div>

        {/* Metric 4: Low Stock Alert */}
        <div className={`rounded-xl border p-4 shadow-2xs space-y-2 ${
          products.low_stock > 0
            ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20"
            : "border-border bg-card"
        }`}>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">مخزون منخفض</span>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              products.low_stock > 0 ? "bg-amber-500/20 text-amber-600" : "bg-muted text-muted-foreground"
            }`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <p className={`text-2xl sm:text-3xl font-black ${
              products.low_stock > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
            }`}>
              {products.low_stock}
            </p>
            {products.low_stock > 0 && (
              <Link
                to="/merchant/products"
                className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <span>مراجعة</span>
                <ChevronLeft className="h-3 w-3" />
              </Link>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">منتجات شارفت كمياتها على النفاد</p>
        </div>
      </div>

      {/* Row 2: Secondary Catalog & Fulfillment Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">إجمالي المنتجات</p>
            <p className="text-xl font-bold text-foreground mt-1">{products.total}</p>
          </div>
          <Package className="h-5 w-5 text-muted-foreground/60" />
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">المنتجات النشطة</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{products.active}</p>
          </div>
          <CheckCircle2 className="h-5 w-5 text-emerald-500/60" />
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">المنتجات غير النشطة</p>
            <p className="text-xl font-bold text-muted-foreground mt-1">{products.inactive}</p>
          </div>
          <XCircle className="h-5 w-5 text-muted-foreground/60" />
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">مكتملة (آخر 7 أيام)</p>
            <p className="text-xl font-bold text-foreground mt-1">{orders.completed_7d}</p>
          </div>
          <CheckCircle2 className="h-5 w-5 text-blue-500/60" />
        </div>
      </div>

      {/* Row 3: Operational Blocks — Recent Orders, Low Stock & Top Products */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Operational Block 1: Recent Orders */}
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between bg-card/60">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-sm text-foreground">أحدث الطلبات الواردة</h2>
            </div>
            <Link
              to="/merchant/orders"
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              <span>كل الطلبات</span>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="p-4 flex-1">
            {recent_orders.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground space-y-1">
                <ShoppingBag className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs font-medium">لا توجد طلبات واردة حتى الآن.</p>
                <p className="text-[11px] text-muted-foreground/80">ستظهر الطلبات الجديدة هنا فور إنشائها من العملاء.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {recent_orders.map((order) => {
                  const statusLabel = getMerchantOrderStatusLabel(order.status);
                  return (
                    <Link
                      key={order.id}
                      to={`/merchant/orders/${order.id}`}
                      className="py-3 flex items-center justify-between hover:bg-muted/40 px-2 rounded-lg transition-colors group block"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-foreground group-hover:text-primary transition-colors">
                            #{order.order_number}
                          </span>
                          <Badge variant="outline" className="text-[10px] py-0 h-5 font-medium">
                            {statusLabel}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString("ar-IQ", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="text-left flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">
                          {formatPrice(order.total)}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:-translate-x-0.5 rotate-180" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Operational Block 2: Low Stock & Top Products Tabs/Grid */}
        <div className="space-y-6 flex flex-col">
          {/* Low Stock Items */}
          <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden flex-1">
            <div className="p-4 border-b border-border flex items-center justify-between bg-card/60">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h2 className="font-bold text-sm text-foreground">منتجات منخفضة المخزون</h2>
              </div>
              <Link
                to="/merchant/products"
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <span>إدارة المخزون</span>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="p-4">
              {low_stock_products.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground space-y-1">
                  <CheckCircle2 className="h-6 w-6 mx-auto text-emerald-500/50 mb-1" />
                  <p className="text-xs font-medium">لا توجد منتجات منخفضة المخزون حالياً.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {low_stock_products.map((p) => (
                    <div key={p.product_id} className="py-2.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground truncate max-w-[200px]" title={p.name}>
                        {p.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 font-mono text-[11px]">
                          المتبقي: {p.stock} / الحد: {p.threshold}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top Selling Products */}
          <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden flex-1">
            <div className="p-4 border-b border-border flex items-center justify-between bg-card/60">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h2 className="font-bold text-sm text-foreground">المنتجات الأكثر طلباً</h2>
              </div>
              <Link
                to="/merchant/products"
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <span>الكتالوج</span>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="p-4">
              {top_products.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground">
                  <p className="text-xs font-medium">لا توجد مبيعات مسجلة بعد في هذه الفترة.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {top_products.map((p) => (
                    <div key={p.product_id} className="py-2.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground truncate max-w-[200px]" title={p.name}>
                        {p.name}
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {p.units_sold} وحدة مُباعة
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MerchantOverview: React.FC = () => {
  const { data: membership, isLoading: isMembershipLoading } = useCurrentMerchant();
  const merchantId = membership?.merchant_id ?? "";

  useEffect(() => {
    document.title = "لوحة التاجر | DILMART";
  }, []);

  if (isMembershipLoading || !merchantId) {
    return <MerchantOverviewSkeleton />;
  }

  return (
    <MerchantOverviewWorkspace
      key={merchantId}
      merchantId={merchantId}
    />
  );
};

export default MerchantOverview;
