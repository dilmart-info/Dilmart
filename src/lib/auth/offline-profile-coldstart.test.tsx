import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { RequireAuthenticatedUser } from "@/components/guards/RequireAuthenticatedUser";
import Profile from "@/pages/Profile";
import IconNav from "@/components/IconNav";

const useAuthMock = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/capacitor", () => ({
  isNative: () => true,
  openExternal: vi.fn(),
  shouldOpenExternally: () => false,
}));

vi.mock("@/lib/cart-store", () => ({
  useCartStore: () => ({
    items: [],
    getItemCount: () => 0,
    getTotal: () => 0,
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
  }),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMyOrders: vi.fn(),
    updateMyProfile: vi.fn(),
  },
}));

vi.mock("@/components/Header", () => ({ default: () => <header>header</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>footer</footer> }));
vi.mock("@/components/AccountRecommendations", () => ({ default: () => null }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

const offlineSession = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: "bearer",
  user: { id: "user-1", email: "smoke.phase3.<redacted>@mailinator.com" },
};

beforeEach(() => {
  useAuthMock.mockReturnValue({
    user: null,
    profile: null,
    session: offlineSession,
    // STORE-PR5 §Phase J — auth is source-neutral: an offline Supabase session also carries appSession.
    appSession: {
      authSource: "supabase",
      accessToken: offlineSession.access_token,
      accessExpiresAt: offlineSession.expires_at * 1000,
      user: { id: "user-1", email: offlineSession.user.email, phone: null },
    },
    authSource: "supabase",
    capabilities: null,
    logoutAllDevices: vi.fn(),
    authStatus: "authenticated_offline",
    bootstrapDelayed: false,
    contextLoading: false,
    contextReady: false,
    loading: false,
    isOffline: true,
    storageError: null,
    isAdmin: false,
    isMerchantUser: false,
    isMerchantApplicant: false,
    isAgent: false,
    retryStorageBootstrap: vi.fn(),
    logoutCurrentDevice: vi.fn(),
    signInWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
    resendSignupEmail: vi.fn(),
    establishProvisionalSession: vi.fn(),
    refetch: vi.fn(),
  });
});

describe("offline cold-start /profile", () => {
  it("keeps /profile, renders offline shell, and does not show the auth form or login CTA", () => {
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <LocationProbe />
        <IconNav />
        <Routes>
          <Route
            path="/profile"
            element={
              <RequireAuthenticatedUser>
                <Profile />
              </RequireAuthenticatedUser>
            }
          />
          <Route path="/auth" element={<div>مرحباً بك سجل دخولك أو أنشئ حساباً</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("pathname").textContent).toBe("/profile");
    expect(screen.getByTestId("profile-offline-shell")).toBeTruthy();
    expect(screen.queryByText(/سجل دخولك أو أنشئ حساباً/)).toBeNull();
    expect(screen.getAllByText("حسابي").length).toBeGreaterThan(0);
    expect(screen.queryByText("تسجيل الدخول")).toBeNull();
  });
});
