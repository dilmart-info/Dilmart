// @vitest-environment jsdom
/**
 * ProfileRouteGate — dispatches /profile between the B2B Barber account view and the ordinary
 * Customer flow. Covers the acceptance criteria from the B2B web-session consumer work: a
 * connected Barber never sees the Customer login form, a Customer-only visitor's flow is
 * completely unchanged, and the gate never reads/touches Customer auth state (structural
 * isolation — Customer and Barber sessions are never merged).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { BarberWebSessionState } from "@/lib/barber-handoff/BarberWebSessionContext";

let mockBarberState: BarberWebSessionState = { status: "unauthenticated" };
vi.mock("@/lib/barber-handoff/BarberWebSessionContext", () => ({
  useBarberWebSession: () => ({ state: mockBarberState, refresh: vi.fn(), logout: vi.fn() }),
}));
vi.mock("@/pages/BarberAccount", () => ({
  default: () => <div data-testid="barber-account">BARBER_ACCOUNT</div>,
}));

import { ProfileRouteGate } from "./ProfileRouteGate";

function renderGate() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route
          path="/profile"
          element={
            <ProfileRouteGate>
              <div data-testid="customer-profile">CUSTOMER_PROFILE_OR_AUTH_GUARD</div>
            </ProfileRouteGate>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProfileRouteGate", () => {
  it("Barber session loading -> shows a loading state, renders neither Barber account nor Customer children (no flash either way)", () => {
    mockBarberState = { status: "loading" };
    renderGate();
    expect(screen.queryByTestId("barber-account")).toBeNull();
    expect(screen.queryByTestId("customer-profile")).toBeNull();
  });

  it("Barber authenticated -> renders BarberAccount, NEVER the Customer profile/login children", () => {
    mockBarberState = {
      status: "authenticated",
      barber: { linkedProfileId: "lp1", DilMartUserId: "u1", DilMartBarbershopId: "b1", role: "OWNER", displayName: "Ali", shopName: null, phone: null, city: null, businessType: null },
    };
    renderGate();
    expect(screen.getByTestId("barber-account")).toBeTruthy();
    expect(screen.queryByTestId("customer-profile")).toBeNull();
  });

  it("no Barber session (unauthenticated) -> falls through to the existing Customer children unchanged", () => {
    mockBarberState = { status: "unauthenticated" };
    renderGate();
    expect(screen.getByTestId("customer-profile")).toBeTruthy();
    expect(screen.queryByTestId("barber-account")).toBeNull();
  });

  it("Barber check unavailable (backend/network error) -> falls through to the existing Customer children (fail open to the pre-existing behavior, never stuck)", () => {
    mockBarberState = { status: "unavailable" };
    renderGate();
    expect(screen.getByTestId("customer-profile")).toBeTruthy();
  });
});
