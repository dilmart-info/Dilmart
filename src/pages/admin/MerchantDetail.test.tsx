import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getMerchantById = vi.fn();
const getMerchantReadiness = vi.fn();
const getMerchantPerformanceScorecard = vi.fn();
const getJenniProvisioningStatus = vi.fn();
const updateMerchantRegistrationDetails = vi.fn();
const updateMerchant = vi.fn();
const updateMerchantStatus = vi.fn();
const assignMerchantOwner = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMerchantById: (id: string) => getMerchantById(id),
    getMerchantReadiness: (id: string) => getMerchantReadiness(id),
    getMerchantPerformanceScorecard: (id: string) => getMerchantPerformanceScorecard(id),
    getJenniProvisioningStatus: (id: string) => getJenniProvisioningStatus(id),
    updateMerchantRegistrationDetails: (id: string, payload: unknown) => updateMerchantRegistrationDetails(id, payload),
    updateMerchant: (id: string, payload: unknown) => updateMerchant(id, payload),
    updateMerchantStatus: (id: string, payload: unknown) => updateMerchantStatus(id, payload),
    assignMerchantOwner: (id: string, payload: unknown) => assignMerchantOwner(id, payload),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const MerchantDetail = (await import("./MerchantDetail")).default;

function renderPage(id = "merchant-123") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/admin/merchants/${id}`]}>
        <Routes>
          <Route path="/admin/merchants/:id" element={<MerchantDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMerchantReadiness.mockResolvedValue({
    is_ready: false,
    score: 50,
    passed_checks: 3,
    total_checks: 7,
    checklist: [
      { key: "profile_completed", label: "إكمال ملف المتجر", passed: true },
      { key: "contact_completed", label: "إدخال وسائل التواصل", passed: true },
      { key: "address_completed", label: "إدخال المدينة والعنوان", passed: true },
      { key: "merchant_is_active", label: "تفعيل حالة التاجر", passed: false },
    ],
  });
  getMerchantPerformanceScorecard.mockResolvedValue({
    score: 80,
    kpis: {},
  });
  getJenniProvisioningStatus.mockResolvedValue({
    is_linked: false,
  });
});

describe("Admin Merchant Detail - Edit Mode and Activation Checks", () => {
  it("only displays one editable display_name input inside the registration card edit mode", async () => {
    getMerchantById.mockResolvedValue({
      id: "merchant-123",
      display_name: "Test Store Display",
      name_ar: "متجر الفرات",
      name_en: "Euphrates Store",
      status: "draft",
      registration_details: {
        applicant_user_id: "user-abc-123",
        email: "owner@example.com",
        owner_full_name: "محمد علي",
        owner_phone: "07701234567",
        store_name_ar: "متجر الفرات",
        store_name_en: "Euphrates Store",
        display_name: "الفرات للتسوق",
        slug: "euphrates-store",
        business_type: "عطور",
        city: "بغداد",
        address: "الكرادة",
        contact_phone: "07709999999",
        whatsapp_phone: "07705555555",
        support_email: "support@euphrates.com",
        submitted_at: "2026-08-05T12:00:00Z",
        status: "pending_review",
      },
    });

    renderPage();

    // Check that we are initially not in edit mode
    expect(await screen.findByText("تعديل البيانات")).toBeDefined();

    // Enter edit mode
    const editBtn = screen.getByText("تعديل البيانات");
    fireEvent.click(editBtn);

    // Locate display-name input using getByLabelText
    const nameInput = screen.getByLabelText("الاسم المعروض");
    expect(nameInput).toBeDefined();
    expect((nameInput as HTMLInputElement).value).toBe("الفرات للتسوق");

    // Double check that exactly one editable display_name field exists
    const displayInputs = screen.queryAllByLabelText("الاسم المعروض");
    expect(displayInputs.length).toBe(1);
  });

  it("loads, edits, and saves safe fields including whatsapp_phone", async () => {
    getMerchantById.mockResolvedValue({
      id: "merchant-123",
      display_name: "Test Store Display",
      name_ar: "متجر الفرات",
      name_en: "Euphrates Store",
      status: "draft",
      registration_details: {
        applicant_user_id: "user-abc-123",
        email: "owner@example.com",
        owner_full_name: "محمد علي",
        owner_phone: "07701234567",
        store_name_ar: "متجر الفرات",
        store_name_en: "Euphrates Store",
        display_name: "الفرات للتسوق",
        slug: "euphrates-store",
        business_type: "عطور",
        city: "بغداد",
        address: "الكرادة",
        contact_phone: "07709999999",
        whatsapp_phone: "07705555555",
        support_email: "support@euphrates.com",
        submitted_at: "2026-08-05T12:00:00Z",
        status: "pending_review",
      },
    });

    updateMerchantRegistrationDetails.mockResolvedValue({ ok: true });

    renderPage();

    const editBtn = await screen.findByText("تعديل البيانات");
    fireEvent.click(editBtn);

    // Find and modify whatsapp_phone input
    const waInput = screen.getByDisplayValue("07705555555");
    fireEvent.change(waInput, { target: { value: "07708888888" } });

    // Save changes
    const saveBtn = screen.getByText("حفظ التعديلات");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateMerchantRegistrationDetails).toHaveBeenCalledWith("merchant-123", {
        merchant: {
          name_ar: "متجر الفرات",
          name_en: "Euphrates Store",
          display_name: "الفرات للتسوق",
          description: "",
          business_type: "عطور",
        },
        settings: {
          city: "بغداد",
          address: "الكرادة",
          contact_phone: "07709999999",
          whatsapp_phone: "07708888888",
          support_email: "support@euphrates.com",
        },
        owner: {
          full_name: "محمد علي",
          phone: "07701234567",
        },
      });
    });
  });

  it("ensures read-only fields do not render as inputs in edit mode", async () => {
    getMerchantById.mockResolvedValue({
      id: "merchant-123",
      display_name: "Test Store Display",
      name_ar: "متجر الفرات",
      status: "draft",
      registration_details: {
        applicant_user_id: "user-abc-123",
        email: "owner@example.com",
        slug: "euphrates-store",
        submitted_at: "2026-08-05T12:00:00Z",
        status: "pending_review",
      },
    });

    renderPage();

    const editBtn = await screen.findByText("تعديل البيانات");
    fireEvent.click(editBtn);

    // Verify read-only fields are still rendered as plain text spans, not inputs
    const emailSpan = screen.getByText("owner@example.com");
    expect(emailSpan.tagName.toLowerCase()).not.toBe("input");

    const userIdSpan = screen.getByText("user-abc-123");
    expect(userIdSpan.tagName.toLowerCase()).not.toBe("input");

    const slugSpan = screen.getByText("euphrates-store");
    expect(slugSpan.tagName.toLowerCase()).not.toBe("input");

    const statusSpan = screen.getByText("pending_review");
    expect(statusSpan.tagName.toLowerCase()).not.toBe("input");
  });

  it("disables activation button when readiness is loading/missing", async () => {
    getMerchantById.mockResolvedValue({ id: "merchant-123", status: "draft" });
    // Simulate loading/missing readiness
    getMerchantReadiness.mockResolvedValue(null);

    renderPage();

    await waitFor(() => {
      // Find activation button (should be disabled because readiness is missing/null)
      const activateBtn = screen.getByText("تفعيل الآن") as HTMLButtonElement;
      expect(activateBtn.disabled).toBe(true);
      expect(screen.getByText("جاري تحميل بيانات الجاهزية...")).toBeDefined();
    });
  });

  it("enables activation button when only merchant_is_active is incomplete", async () => {
    getMerchantById.mockResolvedValue({ id: "merchant-123", status: "draft" });
    getMerchantReadiness.mockResolvedValue({
      is_ready: false, // overall is_ready is false because merchant is active check is false
      score: 85,
      passed_checks: 6,
      total_checks: 7,
      checklist: [
        { key: "profile_completed", label: "إكمال ملف المتجر", passed: true },
        { key: "contact_completed", label: "إدخال وسائل التواصل", passed: true },
        { key: "address_completed", label: "إدخال المدينة والعنوان", passed: true },
        { key: "has_products", label: "إضافة منتجات", passed: true },
        { key: "has_active_products", label: "تفعيل منتجات للبيع", passed: true },
        { key: "has_categorized_products", label: "ربط المنتجات بأقسام", passed: true },
        { key: "merchant_is_active", label: "تفعيل حالة التاجر", passed: false },
      ],
    });

    renderPage();

    await waitFor(() => {
      const activateBtn = screen.getByText("تفعيل الآن") as HTMLButtonElement;
      expect(activateBtn.disabled).toBe(false); // Enabled because all checks except active are complete
      expect(screen.getByText("جاهز للتفعيل الآن.")).toBeDefined();
    });
  });

  it("disables activation and lists Arabic requirements when operational checks fail", async () => {
    getMerchantById.mockResolvedValue({ id: "merchant-123", status: "draft" });
    getMerchantReadiness.mockResolvedValue({
      is_ready: false,
      score: 50,
      passed_checks: 5,
      total_checks: 7,
      checklist: [
        { key: "profile_completed", label: "إكمال ملف المتجر", passed: true },
        { key: "contact_completed", label: "إدخال وسائل التواصل", passed: false }, // failed operational check
        { key: "address_completed", label: "إدخال المدينة والعنوان", passed: false }, // failed operational check
        { key: "merchant_is_active", label: "تفعيل حالة التاجر", passed: false },
      ],
    });

    renderPage();

    await waitFor(() => {
      const activateBtn = screen.getByText("تفعيل الآن") as HTMLButtonElement;
      expect(activateBtn.disabled).toBe(true); // Disabled because contact and address are incomplete
      expect(screen.getByText(/المتطلبات المتبقية للتفعيل: إدخال وسائل التواصل، إدخال المدينة والعنوان/)).toBeDefined();
    });
  });
});
