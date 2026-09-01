import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import About from "@/pages/About";
import Support from "@/pages/Support";
import Contact from "@/pages/Contact";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Returns from "@/pages/Returns";
import Footer from "@/components/Footer";
import { CUSTOMER_ROUTE_PATHS } from "@/app/CustomerRoutes";
import { storeConfig } from "@/config/store";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function renderWithRouter(ui: React.ReactElement, initialEntry = "/") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Phase 2E — Static, Legal, Help & Contact Customer Pages", () => {
  describe("Route Table & Customer Routes Integrity", () => {
    it("includes all public informational routes in CUSTOMER_ROUTE_PATHS", () => {
      expect(CUSTOMER_ROUTE_PATHS).toContain("/about");
      expect(CUSTOMER_ROUTE_PATHS).toContain("/contact");
      expect(CUSTOMER_ROUTE_PATHS).toContain("/terms");
      expect(CUSTOMER_ROUTE_PATHS).toContain("/returns");
      expect(CUSTOMER_ROUTE_PATHS).toContain("/privacy");
      expect(CUSTOMER_ROUTE_PATHS).toContain("/support");
    });
  });

  describe("Store Config Claim Cleanup", () => {
    it("uses the approved neutral brand tagline and no superlative claim", () => {
      expect(storeConfig.taglineAr).toBe("كل السوق بمكان واحد");
      expect(storeConfig.taglineAr).not.toContain("وجهتك الأولى");
      expect(storeConfig.taglineAr).not.toContain("منتجات أصلية");
    });

    it("has valid verified contact facts", () => {
      expect(storeConfig.phone).toBe("+964 787 185 7930");
      expect(storeConfig.whatsapp).toBe("9647871857930");
      expect(storeConfig.address).toBe("بغداد، العراق");
    });
  });

  describe("Footer Copy & Navigation Cleanup", () => {
    it("renders cleaned value proposition copy without unsupported claims", () => {
      renderWithRouter(<Footer />);

      expect(screen.getByText("توصيل منظم")).toBeInTheDocument();
      expect(screen.getByText("تفاصيل التوصيل تظهر حسب الطلب والموقع")).toBeInTheDocument();
      expect(screen.queryByText(/شحن مباشر وسريع لباب المنزل/)).not.toBeInTheDocument();

      expect(screen.getByText("منتجات متنوعة")).toBeInTheDocument();
      expect(screen.getByText("تشكيلة من المنتجات والمتاجر")).toBeInTheDocument();
      expect(screen.queryByText(/المتاجر المعتمدة/)).not.toBeInTheDocument();

      expect(screen.getByText("دفع عند الاستلام")).toBeInTheDocument();
      expect(screen.getByText("دفع عند الاستلام للطلبات المؤهلة")).toBeInTheDocument();
      expect(screen.queryByText(/فحص طلبك/)).not.toBeInTheDocument();
    });

    it("splits privacy, terms, returns, support, contact, and about into distinct links", () => {
      renderWithRouter(<Footer />);

      expect(screen.getByRole("link", { name: "سياسة الخصوصية" })).toHaveAttribute("href", "/privacy");
      expect(screen.getByRole("link", { name: "الشروط والأحكام" })).toHaveAttribute("href", "/terms");
      expect(screen.getByRole("link", { name: "الإلغاء والإرجاع" })).toHaveAttribute("href", "/returns");
      expect(screen.getByRole("link", { name: "مركز المساعدة" })).toHaveAttribute("href", "/support");
      expect(screen.getByRole("link", { name: "تواصل معنا" })).toHaveAttribute("href", "/contact");
      expect(screen.getByRole("link", { name: "عن ديلمارت" })).toHaveAttribute("href", "/about");

      // Verify no combined legacy link
      expect(screen.queryByText("الشروط وسياسة الخصوصية")).not.toBeInTheDocument();
    });
  });

  describe("About Page (/about)", () => {
    it("renders About page with approved tagline and no exaggerated superlatives or unproven ratings/variants", () => {
      renderWithRouter(<About />);

      expect(screen.getByRole("heading", { name: "عن ديلمارت", level: 1 })).toBeInTheDocument();
      expect(screen.getByText(/كل السوق بمكان واحد/)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "ما هو ديلمارت؟" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "ماذا نوفر للمتسوق؟" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "كيف تعمل تجربة التسوق؟" })).toBeInTheDocument();

      // Invariants: NO exaggerated superlatives
      expect(screen.queryByText(/الأكبر/)).not.toBeInTheDocument();
      expect(screen.queryByText(/رقم 1/)).not.toBeInTheDocument();
      expect(screen.queryByText(/جميع متاجر العراق/)).not.toBeInTheDocument();
      expect(screen.queryByText(/جميع المنتجات أصلية/)).not.toBeInTheDocument();

      // Authority invariants: NO store ratings claim & NO selectable variants implication
      expect(screen.queryByText(/تقييماتها/)).not.toBeInTheDocument();
      expect(screen.queryByText(/الخيارات المناسبة/)).not.toBeInTheDocument();
    });
  });

  describe("Help Center / Support Page (/support)", () => {
    it("renders Help Center with categories, FAQ accordion, and prominent self-service links without electronic payment or delivery SLA", () => {
      renderWithRouter(<Support />);

      expect(screen.getByRole("heading", { name: "مركز المساعدة والدعم", level: 1 })).toBeInTheDocument();
      expect(screen.getByText("تتبع حالة طلبك")).toBeInTheDocument();
      expect(screen.getByText("سجل طلبات الحساب")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/ابحث في مواضيع المساعدة/)).toBeInTheDocument();

      // Check category filters
      expect(screen.getByRole("button", { name: "جميع المواضيع" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "الطلبات والمتابعة" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "التوصيل والشحن" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "الإلغاء والإرجاع" })).toBeInTheDocument();

      // Critical Invariants: NO false universal coverage, NO fixed days, NO electronic payment claims, NO real-time SLA
      expect(screen.queryByText(/جميع محافظات العراق/)).not.toBeInTheDocument();
      expect(screen.queryByText(/3 أيام/)).not.toBeInTheDocument();
      expect(screen.queryByText(/٣ أيام/)).not.toBeInTheDocument();
      expect(screen.queryByText(/خيارات دفع إلكترونية/)).not.toBeInTheDocument();
      expect(screen.queryByText(/فور انطلاقها/)).not.toBeInTheDocument();
      expect(screen.queryByText(/سياسات التاجر/)).not.toBeInTheDocument();
    });
  });

  describe("Contact Page (/contact)", () => {
    it("renders Contact page using verified storeConfig values and NO invented headquarters or email", () => {
      renderWithRouter(<Contact />);

      expect(screen.getByRole("heading", { name: "تواصل معنا", level: 1 })).toBeInTheDocument();
      expect(screen.getAllByText("+964 787 185 7930").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("+9647871857930").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("بغداد، العراق").length).toBeGreaterThanOrEqual(1);

      // Invariants: NO invented email, fake working hours, or false headquarters
      expect(screen.queryByText(/المركز الرئيسي/)).not.toBeInTheDocument();
      expect(screen.queryByText(/@dilmart\./i)).not.toBeInTheDocument();
      expect(screen.queryByText(/support@/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/info@/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/ساعات العمل/)).not.toBeInTheDocument();
    });
  });

  describe("Privacy Policy Page (/privacy)", () => {
    it("renders Privacy Policy without absolute data-scope claims or legacy return policy section", () => {
      renderWithRouter(<Privacy />);

      expect(screen.getByRole("heading", { name: "سياسة الخصوصية", level: 1 })).toBeInTheDocument();
      expect(screen.getByText("المقدمة ونطاق السياسة")).toBeInTheDocument();
      expect(screen.getByText("البيانات التي نقوم بمعالجتها")).toBeInTheDocument();
      expect(screen.getByText("مزودو الخدمات والتشغيل")).toBeInTheDocument();
      expect(screen.getByText(/سبتمبر 2026/)).toBeInTheDocument();

      // Invariants: NO absolute data-scope claim
      expect(screen.queryByText(/تقتصر معالجة البيانات/)).not.toBeInTheDocument();

      // Critical Invariant: Return policy must be completely removed from Privacy
      expect(screen.queryByRole("heading", { name: "سياسة الإرجاع" })).not.toBeInTheDocument();
      expect(screen.queryByText(/3 أيام/)).not.toBeInTheDocument();
      expect(screen.queryByText(/٣ أيام/)).not.toBeInTheDocument();
      expect(screen.queryByText(/يتحمل المشتري تكلفة شحن الإرجاع/)).not.toBeInTheDocument();
    });
  });

  describe("Terms of Use Page (/terms)", () => {
    it("renders Terms of Use with customer-facing legal wording and without backend technical jargon", () => {
      renderWithRouter(<Terms />);

      expect(screen.getByRole("heading", { name: "الشروط والأحكام", level: 1 })).toBeInTheDocument();
      expect(screen.getByText("1. القبول ونطاق الاستخدام")).toBeInTheDocument();
      expect(screen.getByText("3. الأسعار والتوفر وتأكيد الطلب")).toBeInTheDocument();
      expect(screen.getByText(/تُعتمد الأسعار والتوفر والخصومات وتكلفة التوصيل/)).toBeInTheDocument();
      expect(screen.getByText(/سبتمبر 2026/)).toBeInTheDocument();

      // Invariant: NO raw internal technical jargon
      expect(screen.queryByText(/النظام الآلي للمنصة هو المرجع الحاكم/)).not.toBeInTheDocument();
      expect(screen.queryByText(/مواعيد التسليم التقديرية/)).not.toBeInTheDocument();
    });
  });

  describe("Returns and Cancellations Information Page (/returns)", () => {
    it("renders Returns page with neutral authority without invented product conditions or fixed durations", () => {
      renderWithRouter(<Returns />);

      expect(screen.getByRole("heading", { name: "الإلغاء والإرجاع", level: 1 })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "إلغاء الطلب قبل الاستلام" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "تقديم طلب إرجاع لمنتج مستلم" })).toBeInTheDocument();
      expect(screen.getByText("المراحل المبكرة")).toBeInTheDocument();
      expect(screen.getByText("أثناء التجهيز والتعبئة")).toBeInTheDocument();
      expect(screen.getByText("بعد الشحن والتسليم")).toBeInTheDocument();
      expect(screen.getByText(/الانتقال إلى طلباتي/)).toBeInTheDocument();

      // Critical Invariants: NO invented product conditions
      expect(screen.queryByText(/بحالته الأصلية/)).not.toBeInTheDocument();
      expect(screen.queryByText(/سلامة الغلاف/)).not.toBeInTheDocument();
      expect(screen.queryByText(/عدم استخدام/)).not.toBeInTheDocument();
      expect(screen.queryByText(/سياسات المتجر/)).not.toBeInTheDocument();

      // Critical Invariant: NO hard-coded fixed return window (e.g. 3, 7, 14 days)
      expect(screen.queryByText(/3 أيام/)).not.toBeInTheDocument();
      expect(screen.queryByText(/7 أيام/)).not.toBeInTheDocument();
      expect(screen.queryByText(/14 يوم/)).not.toBeInTheDocument();
      expect(screen.queryByText(/٣ أيام/)).not.toBeInTheDocument();
      expect(screen.queryByText(/٧ أيام/)).not.toBeInTheDocument();
    });
  });
});
