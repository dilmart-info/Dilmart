import CustomersPage from "@/components/scoped/CustomersPage";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { merchantScope } from "@/lib/data-scope";

const MerchantCustomers = () => {
  const { data: membership, isLoading } = useCurrentMerchant();
  const merchantId = (membership as any)?.merchant_id;

  if (isLoading) return <div>جاري التحميل...</div>;
  if (!merchantId) return <div className="text-muted-foreground">لا يوجد متجر مرتبط بحسابك.</div>;

  return <CustomersPage context={merchantScope(merchantId)} title="عملاء متجري" />;
};

export default MerchantCustomers;
