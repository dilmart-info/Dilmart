import React from "react";
import CouponsPage from "@/components/scoped/CouponsPage";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { canMerchantManageCoupons } from "@/lib/merchant-role-authority";
import { merchantScope } from "@/lib/data-scope";

const MerchantCoupons = () => {
  const { data: membership, isLoading } = useCurrentMerchant();
  const merchantId = membership?.merchant_id;
  const role = membership?.role;

  if (isLoading) {
    return (
      <div className="space-y-4 p-6 animate-pulse" data-testid="merchant-coupons-loading">
        <div className="h-8 w-48 bg-muted rounded-lg" />
        <div className="h-32 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!merchantId) {
    return (
      <div className="text-muted-foreground p-6" data-testid="merchant-coupons-unattached">
        لا يوجد متجر مرتبط بحسابك.
      </div>
    );
  }

  const canManage = canMerchantManageCoupons(role);
  const liveMerchantIdRef = React.useRef(merchantId);
  React.useEffect(() => {
    liveMerchantIdRef.current = merchantId;
  }, [merchantId]);

  return (
    <MerchantCouponsWorkspace
      key={merchantId}
      merchantId={merchantId}
      canManage={canManage}
      liveMerchantIdRef={liveMerchantIdRef}
    />
  );
};

function MerchantCouponsWorkspace({
  merchantId,
  canManage,
  liveMerchantIdRef,
}: {
  merchantId: string;
  canManage: boolean;
  liveMerchantIdRef: React.RefObject<string | undefined>;
}) {
  return (
    <CouponsPage
      context={merchantScope(merchantId)}
      title="كوبونات متجري"
      canManage={canManage}
      liveMerchantIdRef={liveMerchantIdRef}
    />
  );
}

export default MerchantCoupons;
