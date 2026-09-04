import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MerchantProductForm from "./ProductForm";

const { mockCurrentMerchant, mockAuth, mockGetProductById, mockGetCategoriesAdminList, mockGetActiveMerchants } = vi.hoisted(() => ({
  mockCurrentMerchant: {
    data: {
      merchant_id: "m-store-1",
      role: "merchant_owner",
      merchants: { id: "m-store-1", display_name: "متجر الفرات", status: "active" },
    } as any,
    isLoading: false,
  },
  mockAuth: {
    isAdmin: false,
    isMerchantUser: true,
    user: { id: "user-1", email: "owner@merchant.test" },
  },
  mockGetProductById: vi.fn(),
  mockGetCategoriesAdminList: vi.fn(),
  mockGetActiveMerchants: vi.fn(),
}));

if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock("@/hooks/use-current-merchant", () => ({
  useCurrentMerchant: () => mockCurrentMerchant,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      getProductById: (...args: unknown[]) => mockGetProductById(...args),
      getCategoriesAdminList: (...args: unknown[]) => mockGetCategoriesAdminList(...args),
      getActiveMerchants: (...args: unknown[]) => mockGetActiveMerchants(...args),
      createProduct: vi.fn().mockResolvedValue({ id: "prod-new", merchant_id: "m-store-1" }),
      updateProduct: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

function renderForm(route = "/merchant/products/new", initialQueryClient?: QueryClient) {
  const queryClient = initialQueryClient ?? new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/merchant/products/new" element={<MerchantProductForm />} />
          <Route path="/merchant/products/:id/edit" element={<MerchantProductForm />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("MerchantProductForm Multi-Store Authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentMerchant.isLoading = false;
    mockCurrentMerchant.data = {
      merchant_id: "m-store-1",
      role: "merchant_owner",
      merchants: { id: "m-store-1", display_name: "متجر الفرات", status: "active" },
    };
    mockAuth.isAdmin = false;
    mockAuth.isMerchantUser = true;
    mockGetCategoriesAdminList.mockResolvedValue([
      { id: "cat-1", name: "ماكينات حلاقة", is_active: true },
    ]);
    mockGetActiveMerchants.mockResolvedValue([]);
  });

  it("renders loading skeleton when membership is loading", () => {
    mockCurrentMerchant.isLoading = true;
    const { container } = renderForm();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders truthful error banner when no active merchant is bound", () => {
    mockCurrentMerchant.data = null;
    renderForm();
    expect(screen.getByText("لا يوجد متجر نشط مرتبط بحسابك.")).toBeInTheDocument();
  });

  it("renders form normally for active merchant owner", async () => {
    renderForm();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "منتج جديد" })).toBeInTheDocument();
    });
    const saveButton = screen.getByRole("button", { name: "إضافة المنتج" });
    expect(saveButton).toBeEnabled();
  });

  it("enforces read-only UI and disabled submit for merchant_staff", async () => {
    mockCurrentMerchant.data = {
      merchant_id: "m-store-1",
      role: "merchant_staff",
      merchants: { id: "m-store-1", display_name: "متجر الفرات", status: "active" },
    };

    renderForm();

    await waitFor(() => {
      expect(screen.getByText(/حساب الموظف لديه صلاحية قراءة فقط/)).toBeInTheDocument();
    });

    const saveButton = screen.getByRole("button", { name: "إضافة المنتج" });
    expect(saveButton).toBeDisabled();
  });

  it("fails closed when loading a product belonging to another merchant (IDOR)", async () => {
    mockGetProductById.mockResolvedValue({
      id: "prod-other",
      name: "منتج متجر غريب",
      merchant_id: "m-foreign-store",
    });

    renderForm("/merchant/products/prod-other/edit");

    await waitFor(() => {
      expect(
        screen.getByText("تعذر تحميل بيانات المنتج أو ليس لديك صلاحية الوصول إليه.")
      ).toBeInTheDocument();
    });

    expect(screen.queryByRole("heading", { name: "تعديل المنتج" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "العودة للمنتجات" })).toBeInTheDocument();
  });

  it("renders edit form when product belongs to the current active merchant", async () => {
    mockGetProductById.mockResolvedValue({
      id: "prod-my",
      name: "ماكينة ديلكاست الاحترافية",
      slug: "delcast-pro",
      price: 45000,
      stock: 10,
      merchant_id: "m-store-1",
      is_active: true,
      description: "ماكينة ممتازة",
    });

    renderForm("/merchant/products/prod-my/edit");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "تعديل المنتج" })).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("ماكينة ديلكاست الاحترافية")).toBeInTheDocument();
    expect(mockGetProductById).toHaveBeenCalledWith("prod-my", {
      merchant_id: "m-store-1",
    });
  });
});
