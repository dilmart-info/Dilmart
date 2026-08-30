// @vitest-environment jsdom
/**
 * STORE-PR5 §Phase K/§1/§2 — capability route guard that FAILS CLOSED for a known federated identity.
 * A federated customer must never render account-claim / phone-security / password surfaces — even while
 * the backend capabilities are still loading or offline. Guests keep account/password recovery.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let mockAuth: any = {};
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuth }));
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

import { CustomerCapabilityGuard } from "./CustomerCapabilityGuard";

const FED = { authSource: "DilMart_federated", accessToken: "a", accessExpiresAt: Date.now() + 1e6, user: { id: "f", email: null, phone: null } };
const SUPA = { authSource: "supabase", accessToken: "a", accessExpiresAt: Date.now() + 1e6, user: { id: "s", email: null, phone: null } };

function renderGuard(capability: string) {
  return render(
    <MemoryRouter initialEntries={["/guarded"]}>
      <Routes>
        <Route path="/guarded" element={<CustomerCapabilityGuard capability={capability as any}><div data-testid="child">CHILD</div></CustomerCapabilityGuard>} />
        <Route path="/profile" element={<div data-testid="profile">PROFILE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
const blocked = () => screen.queryByTestId("child") === null && screen.queryByTestId("profile") !== null;
const allowed = () => screen.queryByTestId("child") !== null;

describe("CustomerCapabilityGuard — fail-closed for federated", () => {
  it("federated + authenticated_ready + accountClaim=false → /profile", () => {
    mockAuth = { appSession: FED, authStatus: "authenticated_ready", capabilities: { accountClaim: false, customerCommerce: true } };
    renderGuard("accountClaim");
    expect(blocked()).toBe(true);
  });

  it("federated + authenticated_loading_context (capabilities not yet loaded) → account-claim NEVER rendered", () => {
    mockAuth = { appSession: FED, authStatus: "authenticated_loading_context", capabilities: null };
    renderGuard("accountClaim");
    expect(blocked()).toBe(true);
  });

  it("federated + authenticated_offline → phone-security NEVER rendered", () => {
    mockAuth = { appSession: FED, authStatus: "authenticated_offline", capabilities: null };
    renderGuard("phoneIdentity");
    expect(blocked()).toBe(true);
  });

  it("federated + authenticated_loading_context → forgot-password (passwordManagement) NEVER rendered", () => {
    mockAuth = { appSession: FED, authStatus: "authenticated_loading_context", capabilities: null };
    renderGuard("passwordManagement");
    expect(blocked()).toBe(true);
  });

  it("unauthenticated guest → forgot-password allowed", () => {
    mockAuth = { appSession: null, authStatus: "unauthenticated", capabilities: null };
    renderGuard("passwordManagement");
    expect(allowed()).toBe(true);
  });

  it("direct Supabase while context loads → NOT blocked (preserve existing behavior)", () => {
    mockAuth = { appSession: SUPA, authStatus: "authenticated_loading_context", capabilities: null };
    renderGuard("accountClaim");
    expect(allowed()).toBe(true);
  });

  it("direct Supabase customer (accountClaim=true) → reaches the page", () => {
    mockAuth = { appSession: SUPA, authStatus: "authenticated_ready", capabilities: { accountClaim: true } };
    renderGuard("accountClaim");
    expect(allowed()).toBe(true);
  });
});
