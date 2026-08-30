import CouponsPage from "@/components/scoped/CouponsPage";
import { platformScope } from "@/lib/data-scope";

export default function AdminCoupons() {
  return <CouponsPage context={platformScope()} title="إدارة الكوبونات" />;
}
