import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Profile from "@/pages/Profile";
import { apiClient } from "@/lib/api-client";

const useAuthMock = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getCustomerOrders: vi.fn(),
    getCustomerAddresses: vi.fn(),
    updateCustomerProfile: vi.fn(),
  },
}));

vi.mock("@/components/Header", () => ({ default: () => <header data-testid="header">Header</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer data-testid="footer">Footer</footer> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("@/components/AccountRecommendations", () => ({ default: () => <div data-testid="recommendations">Recs</div> }));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/profile"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Profile - Account Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.getCustomerOrders as any).mockResolvedValue([
      {
        id: "order-1",
        order_number: "ORD-1001",
        status: "pending",
        delivery_status: "in_transit",
        total: 55000,
        created_at: new Date().toISOString(),
        items_count: 2,
        items_preview: [
          { product_id: "p1", product_name: "عطر فاخر", quantity: 1, price: 55000 },
        ],
      },
    ]);
    (apiClient.getCustomerAddresses as any).mockResolvedValue([
      {
        id: "addr-1",
        recipient_name: "علي كريم",
        recipient_phone: "07701234567",
        area: "الكرادة",
        nearest_landmark: "قرب ساحة كهرمانة",
        is_default: true,
      },
    ]);
    (apiClient.updateCustomerProfile as any).mockResolvedValue({
      user_id: "user-123",
      full_name: "علي كريم المحدث",
      phone: "07701234567",
      email: "ali@example.com",
    });
  });

  it("renders authenticated account dashboard with name, loyalty points, and NO unsupported 1-year expiry claim", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-123", email: "ali@example.com" },
      profile: {
        full_name: "علي كريم",
        points: 250,
        phone: "07701234567",
        phone_verified: true,
      },
      appSession: { authSource: "supabase", user: { id: "user-123", email: "ali@example.com" } },
      authSource: "supabase",
      authStatus: "authenticated_ready",
      capabilities: { phoneIdentity: true, federatedLogoutAll: true },
      logoutCurrentDevice: vi.fn(),
      logoutAllDevices: vi.fn(),
    });

    renderWithProviders(<Profile />);

    expect(screen.getByRole("heading", { name: "لوحة الحساب" })).toBeInTheDocument();
    expect(screen.getAllByText("علي كريم").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/250|٢٥٠/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("يمكن استخدام النقاط المؤهلة كخصم أثناء إتمام الطلب.")).toBeInTheDocument();

    // Critical invariant: NO false "تنتهي بعد سنة" claim
    expect(screen.queryByText(/تنتهي صلاحية النقاط بعد سنة/i)).not.toBeInTheDocument();
  });

  it("displays provisional claim banner only when claim is required or account is provisional", () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-prov", email: "prov@example.com" },
      profile: {
        full_name: "مستخدم مؤقت",
        account_type: "provisional_customer",
        claim_required: true,
        points: 0,
      },
      appSession: { authSource: "supabase", user: { id: "user-prov" } },
      authSource: "supabase",
      authStatus: "authenticated_ready",
      capabilities: { accountClaim: true },
      logoutCurrentDevice: vi.fn(),
    });

    renderWithProviders(<Profile />);

    expect(screen.getByText("حسابك غير موثق بالكامل")).toBeInTheDocument();
    expect(screen.getByText("تأكيد واستلام الحساب")).toBeInTheDocument();
  });

  it("renders offline shell when authenticated_offline", () => {
    useAuthMock.mockReturnValue({
      user: null,
      profile: null,
      appSession: { authSource: "supabase", user: { id: "user-123", email: "offline@example.com" } },
      authSource: "supabase",
      authStatus: "authenticated_offline",
      capabilities: null,
      logoutCurrentDevice: vi.fn(),
    });

    renderWithProviders(<Profile />);

    expect(screen.getByTestId("profile-offline-shell")).toBeInTheDocument();
    expect(screen.getByText("أنت متصل بالحساب دون شبكة")).toBeInTheDocument();
  });

  it("calls canonical apiClient.updateCustomerProfile on personal info form submit", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-123", email: "ali@example.com" },
      profile: {
        full_name: "علي كريم",
        phone: "07701234567",
      },
      appSession: { authSource: "supabase", user: { id: "user-123" } },
      authSource: "supabase",
      authStatus: "authenticated_ready",
      capabilities: { phoneIdentity: true },
      logoutCurrentDevice: vi.fn(),
    });

    renderWithProviders(<Profile />);

    const nameInput = screen.getByLabelText("الاسم الكامل");
    fireEvent.change(nameInput, { target: { value: "علي كريم العراقي" } });

    const saveButton = screen.getByRole("button", { name: "حفظ التغييرات" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(apiClient.updateCustomerProfile).toHaveBeenCalledWith({
        full_name: "علي كريم العراقي",
      });
    });
  });

  it("shows phone identity management button when capability allows", () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-123", email: "ali@example.com" },
      profile: {
        full_name: "علي كريم",
        phone: "07701234567",
        phone_verified: true,
      },
      appSession: { authSource: "supabase", user: { id: "user-123" } },
      authSource: "supabase",
      authStatus: "authenticated_ready",
      capabilities: { phoneIdentity: true },
      logoutCurrentDevice: vi.fn(),
    });

    renderWithProviders(<Profile />);

    expect(screen.getByRole("button", { name: "إدارة وتوثيق رقم الهاتف" })).toBeInTheDocument();
  });
});
