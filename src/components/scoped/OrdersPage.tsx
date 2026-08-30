import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, ChevronRight, ChevronLeft } from "lucide-react";
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

type Props = {
  context: ScopedContext;
  title?: string;
  detailBasePath: string;
};

const statusOptions = ["new", "contacted", "preparing", "shipped", "delivered", "cancelled", "returned"];
const statusLabels: Record<string, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  preparing: "قيد التجهيز",
  shipped: "تم الشحن",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
  returned: "مُرتجع",
};

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

  const { data: ordersResponse, isLoading } = useQuery({
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

  // Reset page when filters change
  const handleSearchChange = (value: string) => { setSearch(value); setPage(1); };
  const handleStatusChange = (value: string) => { setStatus(value); setPage(1); };
  const handleMerchantChange = (value: string) => { setMerchantFilter(value); setPage(1); };

  const updateStatus2 = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => updateScopedOrderStatus(context, id, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scoped-orders"] });
      toast.success("تم تحديث حالة الطلب");
    },
    onError: () => toast.error("تعذر تحديث حالة الطلب"),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{title}</h2>
        {context.scope === "platform" && (
          <Button onClick={() => setManualModalOpen(true)}>إنشاء طلب من محادثة</Button>
        )}
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative md:w-80">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pr-9" placeholder={context.scope === "platform" ? "بحث بالاسم/الهاتف/رقم الطلب" : "بحث برقم الطلب"} value={search} onChange={(e) => handleSearchChange(e.target.value)} />
        </div>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-52" value={status} onChange={(e) => handleStatusChange(e.target.value)}>
          <option value="all">كل الحالات</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s] ?? s}
            </option>
          ))}
        </select>
        {context.scope === "platform" && (
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-64"
            value={merchantFilter}
            onChange={(e) => handleMerchantChange(e.target.value)}
          >
            <option value="all">كل التجار</option>
            {(merchants ?? []).map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">رقم الطلب</TableHead>
              {context.scope === "platform" && <TableHead className="text-right">العميل</TableHead>}
              {context.scope === "platform" && <TableHead className="text-right">التاجر</TableHead>}
              <TableHead className="text-right">الإجمالي</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-center">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={context.scope === "platform" ? 7 : 5} className="py-10 text-center text-muted-foreground">
                  جاري التحميل...
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={context.scope === "platform" ? 7 : 5} className="py-10 text-center text-muted-foreground">
                  لا توجد طلبات مطابقة.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.order_number}</TableCell>
                  {context.scope === "platform" && <TableCell>{o.customer_name}</TableCell>}
                  {context.scope === "platform" && <TableCell>{(o.merchants as any)?.display_name ?? "—"}</TableCell>}
                  <TableCell>{formatPrice(o.total)}</TableCell>
                  <TableCell>
                    {context.scope === "merchant" ? (
                      <Badge className={`text-white text-xs ${
                        o.merchant_decision_status === "pending" ? "bg-amber-500" :
                        o.merchant_decision_status === "rejected" ? "bg-red-600" :
                        o.status === "preparing" ? "bg-yellow-500" :
                        o.status === "shipped" ? "bg-purple-500" :
                        o.status === "delivered" ? "bg-green-500" :
                        o.status === "cancelled" ? "bg-gray-500" :
                        o.status === "returned" ? "bg-red-400" :
                        "bg-green-600"
                      }`}>
                        {o.merchant_decision_status === "pending" ? "بانتظار قرارك" :
                         o.merchant_decision_status === "rejected" ? "مرفوض" :
                         statusLabels[o.status] ?? o.status}
                      </Badge>
                    ) : (
                      <select
                        className="h-8 rounded border border-input bg-background px-2 text-xs"
                        value={o.status ?? "new"}
                        onChange={(e) => updateStatus2.mutate({ id: o.id, value: e.target.value })}
                      >
                        {statusOptions.map((s) => (
                          <option key={s} value={s}>
                            {statusLabels[s] ?? s}
                          </option>
                        ))}
                      </select>
                    )}
                  </TableCell>
                  <TableCell>{new Date(o.created_at).toLocaleDateString("ar-IQ")}</TableCell>
                  <TableCell className="text-center">
                    <Link to={`${detailBasePath}/${o.id}`}>
                      <Button size="sm" variant="outline">
                        التفاصيل
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            عرض {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} من {total} طلب
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronRight className="h-4 w-4" />
              السابق
            </Button>
            <span className="flex items-center px-2">
              {page} / {totalPages}
            </span>
            <Button size="sm" variant="outline" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
              التالي
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ManualOrderModal open={manualModalOpen} onOpenChange={setManualModalOpen} context={context} />
    </div>
  );
}
