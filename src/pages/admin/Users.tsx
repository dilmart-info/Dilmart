import CustomersPage from "@/components/scoped/CustomersPage";
import { platformScope } from "@/lib/data-scope";

export default function AdminUsers() {
  return <CustomersPage context={platformScope()} title="العملاء" />;
}
