import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { baghdadCalendarDateToInstant, instantToBaghdadCalendarDate } from "@/lib/baghdad-time";

const getAdminMerchantCommercialAgreement = vi.fn();
const scheduleAdminMerchantCommercialAgreement = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getAdminMerchantCommercialAgreement: (id: string) => getAdminMerchantCommercialAgreement(id),
    scheduleAdminMerchantCommercialAgreement: (id: string, payload: unknown) => scheduleAdminMerchantCommercialAgreement(id, payload),
  },
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: (msg: string) => toastError(msg), info: vi.fn() },
}));

const MerchantCommercialAgreement = (await import("./MerchantCommercialAgreement")).default;

function renderPage(id = "merchant-123") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/admin/merchants/${id}/commercial-agreement`]}>
        <Routes>
          <Route path="/admin/merchants/:id/commercial-agreement" element={<MerchantCommercialAgreement />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const NO_AGREEMENT = {
  merchant_id: "merchant-123",
  merchant_name: "Ard Al Khaleej",
  has_explicit_agreement: false,
  current: { commission: null, assisted_fee: null, platform_fee: null, delivery_billing: null },
  upcoming: { commission: null, assisted_fee: null, platform_fee: null, delivery_billing: null },
  history: [],
  engine_fallback: { commission_rate: 8, source: "global_default" },
};

beforeEach(() => {
  vi.clearAllMocks();
  getAdminMerchantCommercialAgreement.mockResolvedValue(NO_AGREEMENT);
});

describe("Merchant Commercial Agreement — blank/invalid commission is never treated as 0%", () => {
  it("rejects a blank commission field without calling the API", async () => {
    renderPage();
    await screen.findByText("لا يوجد اتفاق تجاري محدد لهذا التاجر");

    fireEvent.click(screen.getByText("حفظ الاتفاق التجاري"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(scheduleAdminMerchantCommercialAgreement).not.toHaveBeenCalled();
  });

  it("accepts an explicit numeric 0 commission (distinct from blank)", async () => {
    scheduleAdminMerchantCommercialAgreement.mockResolvedValue({ ...NO_AGREEMENT, has_explicit_agreement: true });
    renderPage();
    await screen.findByText("لا يوجد اتفاق تجاري محدد لهذا التاجر");

    fireEvent.change(screen.getByLabelText("نسبة العمولة الجديدة (%)"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("حفظ الاتفاق التجاري"));

    await waitFor(() => expect(scheduleAdminMerchantCommercialAgreement).toHaveBeenCalledTimes(1));
    const payload = scheduleAdminMerchantCommercialAgreement.mock.calls[0][1];
    expect(payload.commission_rate).toBe(0);
  });

  it("rejects an out-of-range commission (e.g. 150) without calling the API", async () => {
    renderPage();
    await screen.findByText("لا يوجد اتفاق تجاري محدد لهذا التاجر");

    fireEvent.change(screen.getByLabelText("نسبة العمولة الجديدة (%)"), { target: { value: "150" } });
    fireEvent.click(screen.getByText("حفظ الاتفاق التجاري"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(scheduleAdminMerchantCommercialAgreement).not.toHaveBeenCalled();
  });

  it("submits a valid 12% commission with the local default effective date", async () => {
    scheduleAdminMerchantCommercialAgreement.mockResolvedValue({ ...NO_AGREEMENT, has_explicit_agreement: true });
    renderPage();
    await screen.findByText("لا يوجد اتفاق تجاري محدد لهذا التاجر");

    fireEvent.change(screen.getByLabelText("نسبة العمولة الجديدة (%)"), { target: { value: "12" } });
    fireEvent.click(screen.getByText("حفظ الاتفاق التجاري"));

    await waitFor(() => expect(scheduleAdminMerchantCommercialAgreement).toHaveBeenCalledTimes(1));
    const payload = scheduleAdminMerchantCommercialAgreement.mock.calls[0][1];
    expect(payload.commission_rate).toBe(12);
    // effective_from must be today's Iraqi commercial calendar day at 00:00 Asia/Baghdad — never
    // the operator's browser-local midnight, never naive UTC midnight of the same date string.
    expect(payload.effective_from).toBe(baghdadCalendarDateToInstant(instantToBaghdadCalendarDate(new Date().toISOString())));
  });

  it("rejects an out-of-range optional fee rate instead of silently sending it as null", async () => {
    renderPage();
    await screen.findByText("لا يوجد اتفاق تجاري محدد لهذا التاجر");

    fireEvent.change(screen.getByLabelText("نسبة العمولة الجديدة (%)"), { target: { value: "12" } });
    fireEvent.click(screen.getByText("إعدادات متقدمة (رسوم إضافية)"));
    // A non-numeric keystroke never reaches state on a native type="number" input (the browser/
    // jsdom filters it), so the realistic invalid case this guards against is an out-of-range
    // number — which JSON.stringify would still happily serialize, unlike NaN.
    fireEvent.change(screen.getByLabelText(/رسوم الطلب المُساعَد/), { target: { value: "150" } });
    fireEvent.click(screen.getByText("حفظ الاتفاق التجاري"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(scheduleAdminMerchantCommercialAgreement).not.toHaveBeenCalled();
  });
});

describe("Merchant Commercial Agreement — current vs fallback distinction", () => {
  it("shows the high-severity banner and labels the engine rate as a fallback, never as the agreement", async () => {
    renderPage();
    await screen.findByText("لا يوجد اتفاق تجاري محدد لهذا التاجر");
    expect(screen.getByText(/نسبة احتياطية من محرك النظام/)).toBeDefined();
  });

  it("does not show the fallback banner when an explicit agreement exists", async () => {
    getAdminMerchantCommercialAgreement.mockResolvedValue({
      ...NO_AGREEMENT,
      has_explicit_agreement: true,
      engine_fallback: null,
      current: {
        commission: {
          id: "r1",
          rule_type: "commission",
          value_type: "percentage",
          value: 12,
          effective_from: "2026-01-01T00:00:00Z",
          effective_to: null,
          created_at: "2026-01-01T00:00:00Z",
          created_by: null,
        },
        assisted_fee: null,
        platform_fee: null,
        delivery_billing: null,
      },
    });
    renderPage();
    await screen.findByText("12%");
    expect(screen.queryByText("لا يوجد اتفاق تجاري محدد لهذا التاجر")).toBeNull();
  });
});
