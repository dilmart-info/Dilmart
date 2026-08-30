// @vitest-environment jsdom
/**
 * STORE-PR6 §27 — real web /open flow: params captured, address bar scrubbed, redeem(web) via the shared
 * controller, navigation to the validated target; no code/state/token in browser storage.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const handleParams = vi.fn();
vi.mock("@/lib/deep-link/store-handoff-instance", () => ({ getStoreHandoffController: () => ({ handleParams }) }));
// Controllable auth-ready gate (§6). The real gate is identity-bound (takes the expected customer id); this
// stub receives result.customerId and ignores it.
let authReady: () => Promise<"ready" | "storage_error" | "offline" | "timeout"> = async () => "ready";
vi.mock("@/lib/deep-link/use-handoff-auth-ready", () => ({ useAwaitAuthReady: () => (_expectedCustomerId: string) => authReady() }));

import OpenHandoff from "./OpenHandoff";

function renderOpen() {
  return render(
    <MemoryRouter initialEntries={["/open"]}>
      <Routes>
        <Route path="/open" element={<OpenHandoff />} />
        <Route path="/product/example" element={<div data-testid="target">PRODUCT</div>} />
        <Route path="/" element={<div data-testid="home">HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  handleParams.mockReset();
  authReady = async () => "ready";
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/open?code=abc123&state=xyz789");
});

describe("web /open flow", () => {
  it("captures params, scrubs the URL, redeems, and navigates to the validated target", async () => {
    handleParams.mockResolvedValue({ state: "success", target: "/product/example", customerId: "cust-1" });
    renderOpen();

    // URL is scrubbed immediately (no code/state left in the address bar).
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(window.location.pathname).toBe("/open");

    // Redeem was invoked with the captured params...
    await waitFor(() => expect(handleParams).toHaveBeenCalledWith({ code: "abc123", state: "xyz789" }));
    // ...and the target was navigated.
    await waitFor(() => expect(screen.getByTestId("target")).toBeTruthy());

    // No code/state/token anywhere in JS storage.
    const blob = JSON.stringify({ ls: { ...localStorage }, ss: { ...sessionStorage } });
    for (const s of ["abc123", "xyz789", "refreshToken", "accessToken"]) expect(blob).not.toContain(s);
  });

  it("invalid params → invalid state, NEVER redeems", async () => {
    window.history.replaceState(null, "", "/open?code=abc123&state=xyz789&evil=1");
    renderOpen();
    await waitFor(() => expect(screen.getByTestId("handoff-invalid")).toBeTruthy());
    expect(handleParams).not.toHaveBeenCalled();
  });

  it("expired handoff → expired UX with a safe continue CTA (never a login redirect)", async () => {
    handleParams.mockResolvedValue({ state: "expired" });
    renderOpen();
    await waitFor(() => expect(screen.getByTestId("handoff-expired")).toBeTruthy());
    expect(screen.getByTestId("handoff-continue")).toBeTruthy();
  });

  it("§6 redeem succeeds but auth ends in storage_error → does NOT navigate to the target", async () => {
    handleParams.mockResolvedValue({ state: "success", target: "/product/example", customerId: "cust-1" });
    authReady = async () => "storage_error";
    renderOpen();
    await waitFor(() => expect(screen.getByTestId("handoff-unavailable")).toBeTruthy());
    expect(screen.queryByTestId("target")).toBeNull();
  });

  it("§1 redeem succeeds but auth-ready TIMES OUT → target NEVER renders (retryable state)", async () => {
    handleParams.mockResolvedValue({ state: "success", target: "/product/example", customerId: "cust-1" });
    authReady = async () => "timeout";
    renderOpen();
    await waitFor(() => expect(screen.getByTestId("handoff-retryable_error")).toBeTruthy());
    expect(screen.queryByTestId("target")).toBeNull();
  });
});
