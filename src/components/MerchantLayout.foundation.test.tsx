import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MerchantLayout from "./MerchantLayout";

interface MockMerchantData {
  merchant_id: string;
  role: string;
  merchants: { id: string; display_name: string; status: string; slug?: string };
}

const {
  mockAuth,
  mockCurrentMerchant,
  mockPendingOrders,
  toastSuccess,
  toastError,
} = vi.hoisted(() => ({
  mockAuth: {
    user: { id: "user-1" } as { id: string } | null,
    profile: { email: "merchant@example.com" } as { email?: string } | null,
    isMerchantUser: true,
    loading: false,
    logoutCurrentDevice: vi.fn().mockResolvedValue(undefined),
  },
  mockCurrentMerchant: {
    data: {
      merchant_id: "m-1",
      role: "owner",
      merchants: { id: "m-1", display_name: "متجر بغداد المركزي", status: "active", slug: "baghdad-store" },
    } as MockMerchantData | null,
    memberships: [
      {
        merchant_id: "m-1",
        role: "owner",
        merchants: { id: "m-1", display_name: "متجر بغداد المركزي", status: "active", slug: "baghdad-store" },
      },
    ] as MockMerchantData[],
    activeMemberships: [
      {
        merchant_id: "m-1",
        role: "owner",
        merchants: { id: "m-1", display_name: "متجر بغداد المركزي", status: "active", slug: "baghdad-store" },
      },
    ] as MockMerchantData[],
    hasNoActiveMerchant: false,
    setActiveMerchantId: vi.fn((id: string) => id === "m-1" || id === "m-2"),
    isLoading: false,
  },
  mockPendingOrders: {
    pendingOrders: [] as Array<{ id: string; order_number?: string }>,
    count: 0,
    currentOrderId: null,
    refetch: vi.fn().mockResolvedValue({ data: { items: [] } }),
    merchantId: "m-1",
  },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/hooks/use-current-merchant", () => ({
  useCurrentMerchant: () => mockCurrentMerchant,
}));

vi.mock("@/hooks/use-pending-orders", () => ({
  usePendingOrders: () => mockPendingOrders,
}));

vi.mock("@/components/merchant/MerchantNotifications", () => ({
  MerchantNotifications: () => <div data-testid="merchant-notifications" />,
  default: () => <div data-testid="merchant-notifications" />,
}));
vi.mock("@/components/merchant/MerchantNewOrderAlertBanner", () => ({
  MerchantNewOrderAlertBanner: () => <div data-testid="merchant-alert-banner" />,
  default: () => <div data-testid="merchant-alert-banner" />,
}));
vi.mock("@/components/merchant/MerchantPwaBootstrap", () => ({
  MerchantPwaBootstrap: () => <div data-testid="merchant-pwa" />,
  default: () => <div data-testid="merchant-pwa" />,
}));
vi.mock("@/components/merchant/MerchantDecisionModal", () => ({
  default: (props: { orderId?: string | null; merchantId?: string | null }) =>
    props.orderId ? (
      <div
        data-testid="decision-modal"
        data-order-id={props.orderId}
        data-merchant-id={props.merchantId}
      />
    ) : null,
}));
vi.mock("@/lib/merchant-push", () => ({
  getOrCreateMerchantDeviceId: () => "device-1",
}));
vi.mock("@/lib/notifications", () => ({
  stopMerchantOrderAlertLoop: vi.fn(),
}));
vi.mock("@/lib/api/merchant", () => ({
  merchantApi: {
    acknowledgeMerchantNotification: vi.fn(),
    listMerchantNotifications: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

function renderLayout(initialPath = "/merchant") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/merchant/login" element={<div>صفحة تسجيل دخول التاجر</div>} />
          <Route path="/merchant/register" element={<div>صفحة تسجيل متجر جديد</div>} />
          <Route path="/merchant/pending" element={<div>صفحة المتاجر المعلقة</div>} />
          <Route
            path="/merchant/*"
            element={
              <MerchantLayout>
                <div data-testid="merchant-child">محتوى لوحة التحكم</div>
              </MerchantLayout>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("MerchantLayout — Foundation & Multi-Store Authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = { id: "user-1" };
    mockAuth.isMerchantUser = true;
    mockAuth.loading = false;
    mockCurrentMerchant.data = {
      merchant_id: "m-1",
      role: "owner",
      merchants: { id: "m-1", display_name: "متجر بغداد المركزي", status: "active", slug: "baghdad-store" },
    };
    mockCurrentMerchant.memberships = [mockCurrentMerchant.data];
    mockCurrentMerchant.activeMemberships = [mockCurrentMerchant.data];
    mockCurrentMerchant.hasNoActiveMerchant = false;
    mockCurrentMerchant.isLoading = false;
    mockPendingOrders.pendingOrders = [];
    mockPendingOrders.count = 0;
    mockPendingOrders.refetch.mockResolvedValue({ data: { items: [] } });
  });

  it("AUTH GATE: redirects unauthenticated or non-merchant user to /merchant/login", () => {
    mockAuth.user = null;
    mockAuth.isMerchantUser = false;
    renderLayout();

    expect(screen.getByText("صفحة تسجيل دخول التاجر")).toBeTruthy();
    expect(screen.queryByTestId("merchant-child")).toBeNull();
  });

  it("MEMBERSHIP RESOLUTION: redirects to /merchant/register if user has no stores at all", () => {
    mockCurrentMerchant.data = null;
    mockCurrentMerchant.memberships = [];
    mockCurrentMerchant.activeMemberships = [];
    mockCurrentMerchant.hasNoActiveMerchant = false;
    renderLayout();

    expect(screen.getByText("صفحة تسجيل متجر جديد")).toBeTruthy();
  });

  it("MEMBERSHIP RESOLUTION: redirects to /merchant/pending if stores exist but none are active (e.g. suspended)", () => {
    mockCurrentMerchant.data = null;
    mockCurrentMerchant.memberships = [
      { merchant_id: "m-susp", role: "owner", merchants: { id: "m-susp", status: "suspended" } },
    ];
    mockCurrentMerchant.activeMemberships = [];
    mockCurrentMerchant.hasNoActiveMerchant = true;
    renderLayout();

    expect(screen.getByText("صفحة المتاجر المعلقة")).toBeTruthy();
  });

  it("ACTIVE MERCHANT RENDERING: displays store display name, page title, and children", () => {
    renderLayout("/merchant");

    expect(screen.getAllByText("متجر بغداد المركزي").length).toBeGreaterThan(0);
    expect(screen.getByTestId("merchant-child")).toBeTruthy();
  });

  it("MULTI-STORE SWITCHER: renders selector when user has >1 active store and switches store", async () => {
    const store2 = {
      merchant_id: "m-2",
      role: "manager",
      merchants: { id: "m-2", display_name: "متجر البصرة الحديث", status: "active", slug: "basra-store" },
    };
    mockCurrentMerchant.memberships = [mockCurrentMerchant.data, store2];
    mockCurrentMerchant.activeMemberships = [mockCurrentMerchant.data, store2];

    renderLayout();

    const switchers = screen.getAllByTestId("merchant-store-switcher");
    expect(switchers.length).toBeGreaterThan(0);

    fireEvent.change(switchers[0], { target: { value: "m-2" } });

    expect(mockCurrentMerchant.setActiveMerchantId).toHaveBeenCalledWith("m-2");
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("تم تغيير المتجر النشط.");
    });
  });

  it("MULTI-STORE EVENT ISOLATION: ignores real-time new order event belonging to another merchant (fails closed)", async () => {
    renderLayout("/merchant");

    await screen.findByTestId("merchant-child");

    // Event from Store 2 while Store 1 is active
    act(() => {
      window.dispatchEvent(
        new CustomEvent("merchant-new-order", {
          detail: { orderId: "ord-store-2", merchantId: "m-2" },
        })
      );
    });

    expect(screen.queryByTestId("decision-modal")).toBeNull();
    expect(mockPendingOrders.refetch).not.toHaveBeenCalled();
  });

  it("MULTI-STORE EVENT ISOLATION: ignores real-time new order event with missing/undefined merchantId", async () => {
    renderLayout("/merchant");

    await screen.findByTestId("merchant-child");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("merchant-new-order", {
          detail: { orderId: "ord-unknown" },
        })
      );
    });

    expect(screen.queryByTestId("decision-modal")).toBeNull();
    expect(mockPendingOrders.refetch).not.toHaveBeenCalled();
  });

  it("MULTI-STORE EVENT ISOLATION: matching active merchant event refetches queue and opens modal for verified pending order", async () => {
    mockPendingOrders.refetch.mockResolvedValueOnce({
      data: {
        items: [{ id: "ord-store-1", order_number: "BG-101" }],
      },
    });

    renderLayout("/merchant");

    await screen.findByTestId("merchant-child");

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("merchant-new-order", {
          detail: { orderId: "ord-store-1", merchantId: "m-1" },
        })
      );
    });

    await waitFor(() => {
      const modal = screen.queryByTestId("decision-modal");
      expect(modal).toBeTruthy();
      expect(modal?.getAttribute("data-order-id")).toBe("ord-store-1");
      expect(modal?.getAttribute("data-merchant-id")).toBe("m-1");
    });
  });

  it("ASYNC MULTI-STORE RACE ISOLATION: delayed Store A refetch resolving after switch to Store B does NOT open Store A modal", async () => {
    let resolveStoreARefetch!: (val: unknown) => void;
    const storeARefetchPromise = new Promise((resolve) => {
      resolveStoreARefetch = resolve;
    });

    const store2 = {
      merchant_id: "m-2",
      role: "owner",
      merchants: { id: "m-2", display_name: "متجر البصرة الحديث", status: "active", slug: "basra-store" },
    };
    mockCurrentMerchant.memberships = [mockCurrentMerchant.data, store2];
    mockCurrentMerchant.activeMemberships = [mockCurrentMerchant.data, store2];

    // 1. Render with Store A active
    mockPendingOrders.refetch.mockReturnValueOnce(storeARefetchPromise);

    const { rerender } = renderLayout("/merchant");
    await screen.findByTestId("merchant-child");

    // 2. Dispatch event for Store A
    act(() => {
      window.dispatchEvent(
        new CustomEvent("merchant-new-order", {
          detail: { orderId: "ord-store-A", merchantId: "m-1" },
        })
      );
    });

    // 3. Switch active store to Store B before Store A refetch resolves
    mockCurrentMerchant.data = store2;
    mockPendingOrders.merchantId = "m-2";

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/merchant"]}>
          <Routes>
            <Route
              path="/merchant/*"
              element={
                <MerchantLayout>
                  <div data-testid="merchant-child">محتوى لوحة التحكم</div>
                </MerchantLayout>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // 4. Resolve Store A refetch with Store A pending order
    await act(async () => {
      resolveStoreARefetch({
        data: {
          items: [{ id: "ord-store-A", order_number: "A-101" }],
        },
      });
    });

    // 5. Assert that no Store A modal opened
    expect(screen.queryByTestId("decision-modal")).toBeNull();

    // 6. Dispatch valid Store B event whose exact order exists in B's queue
    mockPendingOrders.refetch.mockResolvedValueOnce({
      data: {
        items: [{ id: "ord-store-B", order_number: "B-202" }],
      },
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("merchant-new-order", {
          detail: { orderId: "ord-store-B", merchantId: "m-2" },
        })
      );
    });

    // 7. Assert that strictly Store B modal opens
    await waitFor(() => {
      const modal = screen.queryByTestId("decision-modal");
      expect(modal).toBeTruthy();
      expect(modal?.getAttribute("data-order-id")).toBe("ord-store-B");
      expect(modal?.getAttribute("data-merchant-id")).toBe("m-2");
    });
  });

  it("LOGOUT SUCCESS: handles successful logout with success toast", async () => {
    renderLayout();

    const logoutButtons = screen.getAllByTestId("merchant-logout-btn");
    fireEvent.click(logoutButtons[0]);

    await waitFor(() => {
      expect(mockAuth.logoutCurrentDevice).toHaveBeenCalled();
      expect(toastSuccess).toHaveBeenCalledWith("تم تسجيل الخروج بنجاح");
    });
  });

  it("LOGOUT ERROR SEMANTICS: if logoutCurrentDevice rejects, does NOT show success, toasts exact Arabic error message", async () => {
    mockAuth.logoutCurrentDevice.mockRejectedValueOnce(new Error("SecureStorage clear failed"));
    renderLayout();

    const logoutButtons = screen.getAllByTestId("merchant-logout-btn");
    fireEvent.click(logoutButtons[0]);

    await waitFor(() => {
      expect(mockAuth.logoutCurrentDevice).toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith("تعذر تسجيل الخروج بأمان. حاول مرة أخرى.");
      expect(toastSuccess).not.toHaveBeenCalled();
    });
  });
});
