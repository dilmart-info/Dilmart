import OrdersPage from "@/components/scoped/OrdersPage";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { merchantScope } from "@/lib/data-scope";

const MerchantOrders = () => {
  const { data: membership, isLoading } = useCurrentMerchant();
  const merchantId = (membership as any)?.merchant_id;

  if (isLoading) return <div>جاري التحميل...</div>;
  if (!merchantId) return <div className="text-muted-foreground">لا يوجد متجر مرتبط بحسابك.</div>;

  return <OrdersPage context={merchantScope(merchantId)} title="طلبات متجري" detailBasePath="/merchant/orders" />;
};

export default MerchantOrders;
