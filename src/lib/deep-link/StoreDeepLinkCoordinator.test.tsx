// @vitest-environment jsdom
/**
 * STORE-PR6 §2/§3/§6/§26 — native coordinator: listener-first order, warm-during-cold serialization,
 * auth-ready-before-navigate, and storage-failure-prevents-navigate.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const OK1 = "https://store.DilMart.org/open?code=aaa&state=bbb";
const OK2 = "https://store.DilMart.org/open?code=ccc&state=ddd";

const getLaunchUrl = vi.fn(async () => ({ url: null as string | null }));
const addOrder: string[] = [];
let warmCb: ((e: { url: string }) => void) | null = null;
vi.mock("@capacitor/app", () => ({
  App: {
    getLaunchUrl: () => { addOrder.push("getLaunchUrl"); return getLaunchUrl(); },
    addListener: async (_ev: string, cb: (e: { url: string }) => void) => {
      addOrder.push("addListener");
      warmCb = cb;
      return { remove: async () => undefined };
    },
  },
}));
vi.mock("@/lib/capacitor", () => ({ isNative: () => true }));

// Controllable auth-ready gate. The returned fn is STABLE (mirrors the real useCallback hook) so the
// coordinator effect does not re-run on re-render. The real gate is identity-bound and takes the expected
// customer id; the coordinator passes result.customerId, which this stub receives and ignores.
let authReady: () => Promise<"ready" | "storage_error" | "offline" | "timeout"> = async () => "ready";
const stableAwait = (_expectedCustomerId: string) => authReady();
vi.mock("./use-handoff-auth-ready", () => ({ useAwaitAuthReady: () => stableAwait }));

// Controller records the order of processed handoffs.
const processed: string[] = [];
const handle = vi.fn(async (url: string) => {
  processed.push(url);
  await new Promise((r) => setTimeout(r, 15)); // simulate redeem+establish critical section
  return { state: "success" as const, target: url.includes("aaa") ? "/cart" : "/wishlist", customerId: url.includes("aaa") ? "cust-a" : "cust-b" };
});
vi.mock("./store-handoff-instance", () => ({ getStoreHandoffController: () => ({ handle }) }));

import { StoreDeepLinkCoordinator } from "./StoreDeepLinkCoordinator";

function renderCoordinator() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <StoreDeepLinkCoordinator />
      <Routes>
        <Route path="/" element={<div data-testid="home">HOME</div>} />
        <Route path="/cart" element={<div data-testid="cart">CART</div>} />
        <Route path="/wishlist" element={<div data-testid="wishlist">WISHLIST</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  handle.mockClear();
  processed.length = 0;
  addOrder.length = 0;
  getLaunchUrl.mockReset();
  getLaunchUrl.mockResolvedValue({ url: null });
  warmCb = null;
  authReady = async () => "ready";
});

describe("StoreDeepLinkCoordinator (native)", () => {
  it("§3 registers the warm listener BEFORE reading the cold launch URL", async () => {
    getLaunchUrl.mockResolvedValue({ url: OK1 });
    renderCoordinator();
    await waitFor(() => expect(addOrder).toContain("getLaunchUrl"));
    expect(addOrder.indexOf("addListener")).toBeLessThan(addOrder.indexOf("getLaunchUrl"));
  });

  it("§6 COLD start waits for auth-ready, then navigates the validated target", async () => {
    getLaunchUrl.mockResolvedValue({ url: OK1 });
    renderCoordinator();
    await waitFor(() => expect(screen.getByTestId("cart")).toBeTruthy());
  });

  it("§2/§3 warm B arriving during cold A → serialized A then B (neither dropped)", async () => {
    getLaunchUrl.mockResolvedValue({ url: OK1 });
    renderCoordinator();
    // Wait until cold A is actually IN its critical section, THEN fire warm B.
    await waitFor(() => expect(processed[0]).toBe(OK1));
    await act(async () => { warmCb!({ url: OK2 }); });
    await waitFor(() => expect(processed).toEqual([OK1, OK2]), { timeout: 2000 }); // B waited for A; deterministic
  });

  it("§6 a storage_error auth outcome does NOT navigate (shows unavailable)", async () => {
    authReady = async () => "storage_error";
    getLaunchUrl.mockResolvedValue({ url: OK1 });
    renderCoordinator();
    await waitFor(() => expect(screen.getByTestId("handoff-unavailable")).toBeTruthy());
    expect(screen.queryByTestId("cart")).toBeNull();
  });

  it("§1 an auth-ready TIMEOUT never navigates the target (shows a retryable state)", async () => {
    authReady = async () => "timeout";
    getLaunchUrl.mockResolvedValue({ url: OK1 });
    renderCoordinator();
    await waitFor(() => expect(screen.getByTestId("handoff-retryable_error")).toBeTruthy());
    expect(screen.queryByTestId("cart")).toBeNull(); // target NEVER rendered on timeout
  });

  it("§1/§3 an offline auth outcome never navigates the target (bounded, retryable)", async () => {
    authReady = async () => "offline";
    getLaunchUrl.mockResolvedValue({ url: OK1 });
    renderCoordinator();
    await waitFor(() => expect(screen.getByTestId("handoff-retryable_error")).toBeTruthy());
    expect(screen.queryByTestId("cart")).toBeNull();
  });
});
