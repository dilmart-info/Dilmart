import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AccountAddresses from "@/pages/account/Addresses";
import { apiClient } from "@/lib/api-client";

const useAuthMock = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getCustomerAddresses: vi.fn(),
    getShippingGovernorates: vi.fn(),
    createCustomerAddress: vi.fn(),
    updateCustomerAddress: vi.fn(),
    deleteCustomerAddress: vi.fn(),
    setDefaultCustomerAddress: vi.fn(),
  },
}));

vi.mock("@/components/Header", () => ({ default: () => <header>Header</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>Footer</footer> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/my-account/addresses"]}>
        <AccountAddresses />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Account Addresses Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      user: { id: "user-addr-1", email: "user@dilmart.iq" },
      profile: { full_name: "سامر علي", phone: "07712345678" },
      appSession: { authSource: "supabase", user: { id: "user-addr-1" } },
      authSource: "supabase",
      authStatus: "authenticated_ready",
      capabilities: {},
    });

    (apiClient.getShippingGovernorates as any).mockResolvedValue([
      { id: "gov-bgd", name: "بغداد", code: "BG", delivery_fee_iqd: 5000 },
      { id: "gov-bsr", name: "البصرة", code: "BA", delivery_fee_iqd: 7000 },
    ]);
  });

  it("renders empty state when customer has no saved addresses", async () => {
    (apiClient.getCustomerAddresses as any).mockResolvedValue([]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("لا يوجد لديك عناوين محفوظة بعد")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+ إضافة أول عنوان" })).toBeInTheDocument();
    });
  });

  it("renders list of addresses with default badge and contact info", async () => {
    (apiClient.getCustomerAddresses as any).mockResolvedValue([
      {
        id: "addr-1",
        label: "home",
        recipient_name: "سامر علي",
        recipient_phone: "07712345678",
        governorate_id: "gov-bgd",
        area: "حي الجامعة",
        nearest_landmark: "قرب جامع عثمان",
        map_url: null,
        delivery_notes: "الطابق الثاني",
        is_default: true,
      },
      {
        id: "addr-2",
        label: "work",
        recipient_name: "سامر علي (العمل)",
        recipient_phone: "07712345678",
        governorate_id: "gov-bgd",
        area: "الكرادة خارج",
        nearest_landmark: "عمارة التأمين",
        map_url: null,
        delivery_notes: null,
        is_default: false,
      },
    ]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText(/حي الجامعة/)).toBeInTheDocument();
      expect(screen.getByText(/الكرادة خارج/)).toBeInTheDocument();
      expect(screen.getByText("العنوان الافتراضي")).toBeInTheDocument();
      expect(screen.getByText("المنزل")).toBeInTheDocument();
      expect(screen.getByText("العمل")).toBeInTheDocument();
    });
  });

  it("creates a new address via createCustomerAddress", async () => {
    (apiClient.getCustomerAddresses as any).mockResolvedValue([]);
    (apiClient.createCustomerAddress as any).mockResolvedValue({ id: "new-addr-id" });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "+ إضافة أول عنوان" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "+ إضافة أول عنوان" }));

    expect(screen.getByText("إضافة عنوان توصيل جديد")).toBeInTheDocument();

    const recipientInput = screen.getByLabelText("اسم المستلم *");
    fireEvent.change(recipientInput, { target: { value: "حيدر حسن" } });

    const phoneInput = screen.getByLabelText("رقم الهاتف *");
    fireEvent.change(phoneInput, { target: { value: "07809988776" } });

    const areaInput = screen.getByLabelText("المنطقة / الحي *");
    fireEvent.change(areaInput, { target: { value: "المنصور" } });

    const submitBtn = screen.getByRole("button", { name: "إضافة العنوان" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.createCustomerAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient_name: "حيدر حسن",
          recipient_phone: "07809988776",
          area: "المنصور",
        })
      );
    });
  });

  it("calls deleteCustomerAddress via confirmation alert dialog", async () => {
    (apiClient.getCustomerAddresses as any).mockResolvedValue([
      {
        id: "addr-to-delete",
        label: "home",
        recipient_name: "سامر علي",
        recipient_phone: "07712345678",
        governorate_id: "gov-bgd",
        area: "حي الجامعة",
        is_default: false,
      },
    ]);
    (apiClient.deleteCustomerAddress as any).mockResolvedValue({ ok: true });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText(/حي الجامعة/)).toBeInTheDocument();
    });

    const deleteIconBtn = screen.getByTitle("حذف العنوان");
    fireEvent.click(deleteIconBtn);

    expect(screen.getByText("تأكيد حذف العنوان")).toBeInTheDocument();

    const confirmDeleteBtn = screen.getByRole("button", { name: "تأكيد الحذف" });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(apiClient.deleteCustomerAddress).toHaveBeenCalledWith("addr-to-delete");
    });
  });

  it("sets address as default via setDefaultCustomerAddress", async () => {
    (apiClient.getCustomerAddresses as any).mockResolvedValue([
      {
        id: "addr-non-default",
        label: "home",
        recipient_name: "سامر علي",
        recipient_phone: "07712345678",
        governorate_id: "gov-bgd",
        area: "حي العدل",
        is_default: false,
      },
    ]);
    (apiClient.setDefaultCustomerAddress as any).mockResolvedValue({ ok: true });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText(/حي العدل/)).toBeInTheDocument();
    });

    const setDefaultBtn = screen.getByRole("button", { name: /تعيين كعنوان افتراضي/ });
    fireEvent.click(setDefaultBtn);

    await waitFor(() => {
      expect(apiClient.setDefaultCustomerAddress).toHaveBeenCalledWith("addr-non-default");
    });
  });
});
