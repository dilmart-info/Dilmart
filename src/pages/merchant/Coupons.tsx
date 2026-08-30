import CouponsPage from "@/components/scoped/CouponsPage";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { merchantScope } from "@/lib/data-scope";

const MerchantCoupons = () => {
  const { data: membership, isLoading } = useCurrentMerchant();
  const merchantId = (membership as any)?.merchant_id;

  if (isLoading) return <div>جاري التحميل...</div>;
  if (!merchantId) return <div className="text-muted-foreground">لا يوجد متجر مرتبط بحسابك.</div>;

  return <CouponsPage context={merchantScope(merchantId)} title="كوبونات متجري" />;
};

export default MerchantCoupons;
