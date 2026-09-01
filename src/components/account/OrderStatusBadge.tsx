import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface OrderStatusInfo {
  code: string;
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
}

/**
 * Computes the authoritative customer-facing order and delivery status.
 * Evaluates `delivery_status ?? status` with proper fallbacks and Arabic naming.
 */
export function getEffectiveOrderStatus(order: {
  status: string;
  delivery_status?: string | null;
}): OrderStatusInfo {
  // If delivery_status is present and non-empty, it takes precedence for shipment progression
  const rawStatus = (order.delivery_status || order.status || "pending").toLowerCase();

  switch (rawStatus) {
    case "new":
    case "pending":
      return {
        code: "pending",
        label: "قيد الانتظار",
        variant: "secondary",
        className: "bg-blue-50 text-blue-700 border-blue-200",
      };

    case "processing":
    case "preparing":
      return {
        code: "preparing",
        label: "قيد التجهيز",
        variant: "secondary",
        className: "bg-amber-50 text-amber-700 border-amber-200",
      };

    case "confirmed":
      return {
        code: "confirmed",
        label: "مؤكد",
        variant: "secondary",
        className: "bg-indigo-50 text-indigo-700 border-indigo-200",
      };

    case "pending_assignment":
    case "assigned_to_company":
    case "assigned_to_agent":
      return {
        code: "assigned",
        label: "جاري إسناد المندوب",
        variant: "secondary",
        className: "bg-cyan-50 text-cyan-700 border-cyan-200",
      };

    case "picked_up":
    case "in_transit":
    case "dispatched":
    case "shipped":
      return {
        code: "shipped",
        label: "في الطريق للتوصيل",
        variant: "secondary",
        className: "bg-purple-50 text-purple-700 border-purple-200",
      };

    case "delivered":
      return {
        code: "delivered",
        label: "تم التسليم",
        variant: "secondary",
        className: "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold",
      };

    case "cancelled":
      return {
        code: "cancelled",
        label: "ملغي",
        variant: "destructive",
        className: "bg-rose-50 text-rose-700 border-rose-200",
      };

    case "cancellation_requested":
      return {
        code: "cancellation_requested",
        label: "طلب الإلغاء قيد المراجعة",
        variant: "secondary",
        className: "bg-amber-50 text-amber-800 border-amber-300",
      };

    case "return_requested":
    case "pending_review":
      return {
        code: "return_requested",
        label: "طلب الإرجاع قيد المراجعة",
        variant: "secondary",
        className: "bg-orange-50 text-orange-800 border-orange-200",
      };

    case "returned":
      return {
        code: "returned",
        label: "تم الإرجاع",
        variant: "secondary",
        className: "bg-slate-100 text-slate-700 border-slate-300",
      };

    case "failed":
      return {
        code: "failed",
        label: "فشل التوصيل",
        variant: "destructive",
        className: "bg-red-50 text-red-700 border-red-200",
      };

    default:
      return {
        code: rawStatus,
        label: "حالة الطلب قيد التحديث",
        variant: "outline",
        className: "bg-slate-50 text-slate-700 border-slate-200",
      };
  }
}

export function OrderStatusBadge({
  order,
  className,
}: {
  order: { status: string; delivery_status?: string | null };
  className?: string;
}) {
  const statusInfo = getEffectiveOrderStatus(order);

  return (
    <Badge
      variant={statusInfo.variant}
      className={cn("px-2.5 py-0.5 text-xs font-semibold rounded-full border shadow-none", statusInfo.className, className)}
    >
      {statusInfo.label}
    </Badge>
  );
}
