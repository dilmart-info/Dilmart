import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

const financeTabs = [
  { href: "/admin/finance", label: "نظرة عامة" },
  { href: "/admin/finance/orders", label: "تسوية الطلبات" },
  { href: "/admin/finance/merchants", label: "التجار" },
  { href: "/admin/finance/couriers", label: "التوصيل" },
  { href: "/admin/finance/payouts", label: "الدفعات" },
  { href: "/admin/finance/adjustments", label: "التعديلات" },
  { href: "/admin/finance/reversals", label: "عكس القيود" },
  { href: "/admin/finance/events", label: "سجل الأحداث" },
];

export default function FinanceLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold">التسوية المالية</h2>
        <p className="text-sm text-muted-foreground">وحدة التشغيل المالي الداخلية (M11 / M12)</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {financeTabs.map((tab) => {
          const active = location.pathname === tab.href;
          return (
            <Link key={tab.href} to={tab.href}>
              <Button size="sm" variant={active ? "default" : "outline"}>
                {tab.label}
              </Button>
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
