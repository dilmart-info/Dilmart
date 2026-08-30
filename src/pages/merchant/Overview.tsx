import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatPrice } from "@/lib/format";
import { apiClient } from "@/lib/api-client";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";

const MerchantOverview = () => {
  const { data: membership } = useCurrentMerchant();
  const merchantId = membership?.merchant_id ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["merchant-dashboard-v2", merchantId],
    enabled: Boolean(merchantId),
    queryFn: () => apiClient.getMerchantDashboard(merchantId),
  });

  if (isLoading) return <div>جاري التحميل...</div>;
  if (!data) return <div className="text-muted-foreground">تعذر تحميل لوحة المتجر.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">لوحة إنتاجية التاجر</h2>
          <p className="text-sm text-muted-foreground mt-1">لوحة تشغيلية مختصرة لإدارة الكتالوج والطلبات بسرعة.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/merchant/products/import" className="text-sm underline text-primary">
            استيراد ملف المنتجات
          </Link>
          <Link to="/merchant/products" className="text-sm underline text-primary">
            إدارة المنتجات
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">إجمالي المنتجات</p><p className="text-2xl font-bold">{data.products.total}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">المنتجات النشطة</p><p className="text-2xl font-bold">{data.products.active}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">المنتجات غير النشطة</p><p className="text-2xl font-bold">{data.products.inactive}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">مخزون منخفض</p><p className="text-2xl font-bold">{data.products.low_stock}</p></div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">طلبات اليوم</p><p className="text-2xl font-bold">{data.orders.today}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">الطلبات المكتملة (7 أيام)</p><p className="text-2xl font-bold">{data.orders.completed_7d}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">متوسط قيمة الطلب</p><p className="text-2xl font-bold">{formatPrice(data.orders.average_order_value_7d)}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">مبيعات آخر 7 أيام</p><p className="text-2xl font-bold">{formatPrice(data.orders.revenue_7d)}</p></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold mb-3">المنتجات الأكثر مبيعًا</h3>
          {(data.top_products ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات كافية.</p>
          ) : (
            <div className="space-y-2">
              {data.top_products.map((p) => (
                <div key={p.product_id} className="flex items-center justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="text-muted-foreground">{p.units_sold} وحدة</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold mb-3">المنتجات منخفضة المخزون</h3>
          {(data.low_stock_products ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد منتجات منخفضة المخزون.</p>
          ) : (
            <div className="space-y-2">
              {data.low_stock_products.map((p) => (
                <div key={p.product_id} className="flex items-center justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="text-muted-foreground">{p.stock}/{p.threshold}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="font-semibold mb-3">أحدث الطلبات</h3>
        {(data.recent_orders ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد طلبات حتى الآن.</p>
        ) : (
          <div className="space-y-2">
            {data.recent_orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium">#{order.order_number}</p>
                  <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString("ar-IQ")}</p>
                </div>
                <div className="text-left">
                  <p className="font-medium">{formatPrice(order.total)}</p>
                  <p className="text-xs text-muted-foreground">{order.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MerchantOverview;
