import OrdersPage from "@/components/scoped/OrdersPage";
import { platformScope } from "@/lib/data-scope";

export default function AdminOrders() {
  return <OrdersPage context={platformScope()} title="إدارة الطلبات" detailBasePath="/admin/orders" />;
}
