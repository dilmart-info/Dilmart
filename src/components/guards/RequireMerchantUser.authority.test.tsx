// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireMerchantUser } from "./BackofficeRouteGuards";

let mockAuth: Record<string, unknown> = {};
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuth }));
vi.mock("@/components/auth/AuthStorageErrorScreen", () => ({
  AuthStorageErrorScreen: () => <div data-testid="storage-error">STORAGE_ERROR</div>
}));

function renderMerchantGuard() {
  return render(
    <MemoryRouter initialEntries={["/merchant"]}>
      <Routes>
        <Route
          path="/merchant"
          element={
            <RequireMerchantUser>
              <div data-testid="merchant-dashboard">MERCHANT_DASHBOARD</div>
            </RequireMerchantUser>
          }
        />
        <Route path="/merchant/login" element={<div data-testid="login-page">LOGIN_PAGE</div>} />
        <Route path="/merchant/register" element={<div data-testid="register-page">REGISTER_PAGE</div>} />
        <Route path="/merchant/pending" element={<div data-testid="pending-page">PENDING_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireMerchantUser Guard Authority (Phase 3M)", () => {
  it("BREAKS REDIRECT LOOP: grants access to /merchant when merchant is active, even if profile role is lingering as merchant_applicant", () => {
    mockAuth = {
      user: { id: "user-123" },
      session: { user: { id: "user-123" } },
      isMerchantUser: false,
      isMerchantApplicant: true, // Lingering applicant role
      authStatus: "authenticated_ready",
      contextLoading: false,
      retryStorageBootstrap: vi.fn(),
      context: {
        activeRole: "merchant_applicant",
        merchant: { id: "m-1", status: "active", display_name: "DilMart Store" },
        merchant_memberships: [{ id: "m-1", status: "active", role: "owner" }],
      },
    };

    renderMerchantGuard();
    expect(screen.getByTestId("merchant-dashboard")).toBeTruthy();
    expect(screen.queryByTestId("pending-page")).toBeNull();
  });

  it("redirects to /merchant/pending when merchant is pending_review", () => {
    mockAuth = {
      user: { id: "user-123" },
      session: { user: { id: "user-123" } },
      isMerchantUser: false,
      isMerchantApplicant: true,
      authStatus: "authenticated_ready",
      contextLoading: false,
      retryStorageBootstrap: vi.fn(),
      context: {
        activeRole: "merchant_applicant",
        merchant: { id: "m-pending", status: "pending_review", display_name: "Pending Store" },
        merchant_memberships: [{ id: "m-pending", status: "pending_review", role: "owner" }],
      },
    };

    renderMerchantGuard();
    expect(screen.getByTestId("pending-page")).toBeTruthy();
    expect(screen.queryByTestId("merchant-dashboard")).toBeNull();
  });

  it("redirects to /merchant/pending?status=suspended when merchant is suspended", () => {
    mockAuth = {
      user: { id: "user-123" },
      session: { user: { id: "user-123" } },
      isMerchantUser: true,
      isMerchantApplicant: false,
      authStatus: "authenticated_ready",
      contextLoading: false,
      retryStorageBootstrap: vi.fn(),
      context: {
        activeRole: "merchant_owner",
        merchant: { id: "m-suspended", status: "suspended", display_name: "Suspended Store" },
        merchant_memberships: [{ id: "m-suspended", status: "suspended", role: "owner" }],
      },
    };

    renderMerchantGuard();
    expect(screen.getByTestId("pending-page")).toBeTruthy();
    expect(screen.queryByTestId("merchant-dashboard")).toBeNull();
  });

  it("redirects unauthenticated users to /merchant/login", () => {
    mockAuth = {
      user: null,
      session: null,
      isMerchantUser: false,
      isMerchantApplicant: false,
      authStatus: "unauthenticated",
      contextLoading: false,
      retryStorageBootstrap: vi.fn(),
      context: null,
    };

    renderMerchantGuard();
    expect(screen.getByTestId("login-page")).toBeTruthy();
    expect(screen.queryByTestId("merchant-dashboard")).toBeNull();
  });

  it("redirects customer users with no merchant application to /merchant/register", () => {
    mockAuth = {
      user: { id: "customer-1" },
      session: { user: { id: "customer-1" } },
      isMerchantUser: false,
      isMerchantApplicant: false,
      authStatus: "authenticated_ready",
      contextLoading: false,
      retryStorageBootstrap: vi.fn(),
      context: {
        activeRole: "customer",
        merchant: null,
        merchant_memberships: [],
      },
    };

    renderMerchantGuard();
    expect(screen.getByTestId("register-page")).toBeTruthy();
    expect(screen.queryByTestId("merchant-dashboard")).toBeNull();
  });
});
