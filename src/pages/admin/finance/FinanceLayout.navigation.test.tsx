/**
 * Finance regression guard for the backoffice navigation-state change.
 *
 * AdminLayout previously carried a hard-coded `/admin/finance` prefix exception, which the shared
 * boundary-aware matcher replaced. FinanceLayout's own tab strip is a different concern: its tabs
 * are concrete leaf routes with no descendants, so exact matching is correct there and is
 * deliberately left alone. This locks that behaviour in place.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import FinanceLayout from "./FinanceLayout";

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <FinanceLayout>
        <div>finance page</div>
      </FinanceLayout>
    </MemoryRouter>,
  );
}

/** The active tab is the default-variant button; inactive tabs are outline. */
function tabButton(label: string) {
  return screen.getByRole("button", { name: label });
}

describe("FinanceLayout tabs", () => {
  it("marks سجل الأحداث as the active tab on the events route", () => {
    renderAt("/admin/finance/events");

    expect(tabButton("سجل الأحداث").className).toContain("bg-primary");
    expect(tabButton("نظرة عامة").className).toContain("border");
  });

  it("keeps نظرة عامة active on the finance root only", () => {
    renderAt("/admin/finance");

    expect(tabButton("نظرة عامة").className).toContain("bg-primary");
    expect(tabButton("تسوية الطلبات").className).not.toContain("bg-primary");
  });

  it("activates exactly one tab per finance route", () => {
    for (const [pathname, label] of [
      ["/admin/finance/orders", "تسوية الطلبات"],
      ["/admin/finance/merchants", "التجار"],
      ["/admin/finance/couriers", "التوصيل"],
      ["/admin/finance/payouts", "الدفعات"],
      ["/admin/finance/adjustments", "التعديلات"],
      ["/admin/finance/reversals", "عكس القيود"],
    ] as const) {
      const view = renderAt(pathname);
      expect(tabButton(label).className).toContain("bg-primary");
      view.unmount();
    }
  });
});
