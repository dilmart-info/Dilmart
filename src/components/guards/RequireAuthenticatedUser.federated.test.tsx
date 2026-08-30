// @vitest-environment jsdom
/**
 * STORE-PR5 §1/§9 — RequireAuthenticatedUser must accept a source-neutral (federated) session. A federated
 * customer has appSession != null but the Supabase session == null; gating on the raw session wrongly
 * redirected them to /auth. These tests pin the correct behavior across every authStatus.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let mockAuth: any = {};
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuth }));
vi.mock("@/components/auth/AuthStorageErrorScreen", () => ({ AuthStorageErrorScreen: () => <div data-testid="storage-error">STORAGE_ERROR</div> }));

import { RequireAuthenticatedUser } from "./RequireAuthenticatedUser";

const FED = { authSource: "DilMart_federated", accessToken: "a", accessExpiresAt: Date.now() + 1e6, user: { id: "fed-1", email: null, phone: null } };

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route path="/protected" element={<RequireAuthenticatedUser><div data-testid="child">CHILD</div></RequireAuthenticatedUser>} />
        <Route path="/auth" element={<div data-testid="auth">AUTH</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireAuthenticatedUser (source-neutral)", () => {
  it("federated authenticated_ready (Supabase session null) renders children — NOT /auth", () => {
    mockAuth = { appSession: FED, session: null, authStatus: "authenticated_ready", contextLoading: false, bootstrapDelayed: false, retryStorageBootstrap: vi.fn() };
    renderGuard();
    expect(screen.getByTestId("child")).toBeTruthy();
    expect(screen.queryByTestId("auth")).toBeNull();
  });

  it("federated authenticated_offline renders children (offline shell allowed)", () => {
    mockAuth = { appSession: FED, session: null, authStatus: "authenticated_offline", contextLoading: false, bootstrapDelayed: false, retryStorageBootstrap: vi.fn() };
    renderGuard();
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  /**
   * §9.3 — the federated readiness invariant in AuthProvider reports `authenticated_loading_context`
   * whenever `verifiedContextEpoch` does not match the CURRENT identity epoch (see
   * session/cross-identity-revalidation.test.tsx). That only protects protected routes if the guard
   * withholds children for that status: rendering them would expose one customer's screen while the
   * identity behind the session is still unresolved or has already moved on.
   */
  it("MANDATORY: a federated session whose context epoch is unverified renders NEITHER children nor /auth", () => {
    mockAuth = { appSession: FED, session: null, authStatus: "authenticated_loading_context", contextLoading: false, bootstrapDelayed: false, retryStorageBootstrap: vi.fn() };
    renderGuard();
    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.queryByTestId("auth")).toBeNull();
  });

  it("unauthenticated (no appSession) redirects to /auth", () => {
    mockAuth = { appSession: null, session: null, authStatus: "unauthenticated", contextLoading: false, bootstrapDelayed: false, retryStorageBootstrap: vi.fn() };
    renderGuard();
    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.getByTestId("auth")).toBeTruthy();
  });

  it("bootstrapping shows the loading UI (never /auth)", () => {
    mockAuth = { appSession: null, session: null, authStatus: "bootstrapping", contextLoading: false, bootstrapDelayed: false, retryStorageBootstrap: vi.fn() };
    renderGuard();
    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.queryByTestId("auth")).toBeNull();
  });

  it("storage_error shows the storage screen (never /auth)", () => {
    mockAuth = { appSession: null, session: null, authStatus: "storage_error", contextLoading: false, bootstrapDelayed: false, retryStorageBootstrap: vi.fn() };
    renderGuard();
    expect(screen.getByTestId("storage-error")).toBeTruthy();
  });
});
