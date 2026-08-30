import ProductsPage from "@/components/scoped/ProductsPage";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { merchantScope } from "@/lib/data-scope";

const MerchantProducts = () => {
  const { data: membership, isLoading } = useCurrentMerchant();
  const merchantId = (membership as any)?.merchant_id;

  if (isLoading) return <div>جاري التحميل...</div>;
  if (!merchantId) return <div className="text-muted-foreground">لا يوجد متجر مرتبط بحسابك.</div>;

  return <ProductsPage context={merchantScope(merchantId)} title="منتجات متجري" createPath="/merchant/products/new" editPathBase="/merchant/products" />;
};

export default MerchantProducts;
