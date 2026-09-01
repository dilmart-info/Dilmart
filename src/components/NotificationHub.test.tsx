import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationHub } from "./NotificationHub";

const { mockAuth, mockSubscribeNotificationChannels } = vi.hoisted(() => ({
  mockAuth: {
    user: { id: "user-1" } as { id: string } | null,
    isAdmin: false,
    isMerchantUser: true,
    context: {
      merchant_memberships: [{ id: "m-1" }],
      merchant: { id: "m-1" },
    },
  },
  mockSubscribeNotificationChannels: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/lib/realtime/notification-subscriptions", () => ({
  subscribeNotificationChannels: (args: unknown) => mockSubscribeNotificationChannels(args),
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/notifications", () => ({
  playNotificationSound: vi.fn(),
  stopMerchantOrderAlertLoop: vi.fn(),
}));

describe("NotificationHub — Authoritative Event Contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribeNotificationChannels.mockReturnValue(() => {});
  });

  it("FAIL CLOSED: does NOT dispatch merchant-new-order when row lacks merchant_id", () => {
    let capturedOnMerchantInsert: ((row: Record<string, unknown>) => void) | null = null;
    mockSubscribeNotificationChannels.mockImplementation((args: { onMerchantInsert?: (row: Record<string, unknown>) => void }) => {
      capturedOnMerchantInsert = args.onMerchantInsert || null;
      return () => {};
    });

    const eventListener = vi.fn();
    window.addEventListener("merchant-new-order", eventListener);

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <NotificationHub />
      </QueryClientProvider>
    );

    expect(capturedOnMerchantInsert).toBeTruthy();

    // Trigger row without merchant_id
    capturedOnMerchantInsert!({
      id: "notif-1",
      type: "new_order",
      order_id: "ord-999",
      merchant_id: null, // missing merchant_id
    });

    expect(eventListener).not.toHaveBeenCalled();

    window.removeEventListener("merchant-new-order", eventListener);
  });

  it("AUTHORITATIVE DISPATCH: dispatches merchant-new-order with exact row.merchant_id when present", () => {
    let capturedOnMerchantInsert: ((row: Record<string, unknown>) => void) | null = null;
    mockSubscribeNotificationChannels.mockImplementation((args: { onMerchantInsert?: (row: Record<string, unknown>) => void }) => {
      capturedOnMerchantInsert = args.onMerchantInsert || null;
      return () => {};
    });

    const eventListener = vi.fn();
    window.addEventListener("merchant-new-order", eventListener);

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <NotificationHub />
      </QueryClientProvider>
    );

    expect(capturedOnMerchantInsert).toBeTruthy();

    // Trigger row with authoritative merchant_id
    capturedOnMerchantInsert!({
      id: "notif-2",
      type: "new_order",
      order_id: "ord-100",
      merchant_id: "m-exact-store",
    });

    expect(eventListener).toHaveBeenCalledTimes(1);
    const event = eventListener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      orderId: "ord-100",
      notificationId: "notif-2",
      merchantId: "m-exact-store",
    });

    window.removeEventListener("merchant-new-order", eventListener);
  });
});
