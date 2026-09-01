import React, { useEffect } from "react";
import OrdersPage from "@/components/scoped/OrdersPage";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { merchantScope } from "@/lib/data-scope";

const MerchantOrders = () => {
  const { data: membership, isLoading } = useCurrentMerchant();
  const merchantId = membership?.merchant_id;

  useEffect(() => {
    document.title = "طلبات المتجر | DILMART";
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm font-medium">جاري تحميل الطلبات...</p>
      </div>
    );
  }

  if (!merchantId) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        <p className="text-sm">لا يوجد متجر مرتبط بحسابك.</p>
      </div>
    );
  }

  return (
    <OrdersPage
      context={merchantScope(merchantId)}
      title="طلبات متجري"
      detailBasePath="/merchant/orders"
    />
  );
};

export default MerchantOrders;
