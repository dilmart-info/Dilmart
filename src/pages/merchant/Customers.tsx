import React from "react";
import CustomersPage from "@/components/scoped/CustomersPage";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { canMerchantViewCustomers } from "@/lib/merchant-role-authority";
import { merchantScope } from "@/lib/data-scope";

const MerchantCustomers = () => {
  const { data: membership, isLoading } = useCurrentMerchant();
  const merchantId = membership?.merchant_id;
  const role = membership?.role;

  if (isLoading) {
    return (
      <div className="space-y-4 p-6 animate-pulse" data-testid="merchant-customers-loading">
        <div className="h-8 w-48 bg-muted rounded-lg" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!merchantId) {
    return (
      <div className="text-muted-foreground p-6" data-testid="merchant-customers-unattached">
        لا يوجد متجر مرتبط بحسابك.
      </div>
    );
  }

  const canView = canMerchantViewCustomers(role);
  if (!canView) {
    return (
      <div className="p-6 text-destructive" data-testid="merchant-customers-unauthorized">
        غير مصرح لك بالوصول إلى عملاء هذا المتجر.
      </div>
    );
  }

  return (
    <MerchantCustomersWorkspace
      key={merchantId}
      merchantId={merchantId}
    />
  );
};

function MerchantCustomersWorkspace({
  merchantId,
}: {
  merchantId: string;
}) {
  return (
    <CustomersPage
      context={merchantScope(merchantId)}
      title="عملاء متجري"
    />
  );
}

export default MerchantCustomers;
