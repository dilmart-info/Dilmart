import React, { useEffect } from "react";
import ProductsPage from "@/components/scoped/ProductsPage";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { merchantScope } from "@/lib/data-scope";

const MerchantProducts = () => {
  const { data: membership, isLoading } = useCurrentMerchant();
  const merchantId = membership?.merchant_id;

  useEffect(() => {
    document.title = "منتجات المتجر | DILMART";
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm font-medium">جاري تحميل المنتجات...</p>
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
    <ProductsPage
      context={merchantScope(merchantId)}
      title="منتجات متجري"
      createPath="/merchant/products/new"
      editPathBase="/merchant/products"
    />
  );
};

export default MerchantProducts;
