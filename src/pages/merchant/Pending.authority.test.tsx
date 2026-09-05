// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MerchantPending from "./Pending";

let mockStatusResponse: { has_application: boolean; merchant: Record<string, unknown> } = {
  has_application: true,
  merchant: { status: "pending_review" },
};
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMyMerchantApplicationStatus: () => Promise.resolve(mockStatusResponse),
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    logoutCurrentDevice: vi.fn(),
  }),
}));

function renderPending(initialEntry = "/merchant/pending") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/merchant/pending" element={<MerchantPending />} />
          <Route path="/merchant" element={<div data-testid="merchant-overview">MERCHANT_OVERVIEW</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("MerchantPending Component Authority (Phase 3M)", () => {
  it("renders pending review message and details for pending_review status", async () => {
    mockStatusResponse = {
      has_application: true,
      merchant: {
        id: "m-1",
        status: "pending_review",
        display_name: "متجر قيد المراجعة",
        submitted_at: "2026-09-01T00:00:00Z",
      },
    };

    renderPending();
    expect(await screen.findByText("طلبك قيد المراجعة")).toBeTruthy();
    expect(screen.getByText("متجر قيد المراجعة")).toBeTruthy();
    expect(screen.getByText("قيد المراجعة من فريق الإدارة")).toBeTruthy();
  });

  it("renders rejection notice and reason for rejected status", async () => {
    mockStatusResponse = {
      has_application: true,
      merchant: {
        id: "m-rej",
        status: "rejected",
        display_name: "متجر مرفوض",
        rejection_reason: "الوثائق غير مطابقة للشروط",
      },
    };

    renderPending();
    expect(await screen.findByText("تم رفض طلبك")).toBeTruthy();
    expect(screen.getByText("الوثائق غير مطابقة للشروط")).toBeTruthy();
    expect(screen.getByText("تقديم طلب جديد")).toBeTruthy();
  });

  it("renders suspended warning screen when status is suspended", async () => {
    mockStatusResponse = {
      has_application: true,
      merchant: {
        id: "m-susp",
        status: "suspended",
        display_name: "متجر معلق",
      },
    };

    renderPending();
    expect(await screen.findByText("تم تعليق حساب المتجر")).toBeTruthy();
    expect(screen.getByText("متجر معلق")).toBeTruthy();
  });

  it("redirects immediately to /merchant if status is active", async () => {
    mockStatusResponse = {
      has_application: true,
      merchant: {
        id: "m-active",
        status: "active",
        display_name: "DilMart Store",
      },
    };

    renderPending();
    expect(await screen.findByTestId("merchant-overview")).toBeTruthy();
  });
});
