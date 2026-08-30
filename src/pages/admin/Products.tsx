import ProductsPage from "@/components/scoped/ProductsPage";
import { platformScope } from "@/lib/data-scope";

export default function AdminProducts() {
  return <ProductsPage context={platformScope()} title="إدارة المنتجات" createPath="/admin/products/new" editPathBase="/admin/products" />;
}
