import InventoryPage from "@/components/scoped/InventoryPage";
import { platformScope } from "@/lib/data-scope";

export default function AdminInventory() {
  return <InventoryPage context={platformScope()} title="إدارة المخزون" />;
}
