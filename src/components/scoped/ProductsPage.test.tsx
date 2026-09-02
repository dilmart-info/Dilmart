import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const listScopedProducts = vi.fn();
const updateProductStatus = vi.fn();
const getCategoriesAdminList = vi.fn();
const getAdminMerchants = vi.fn();
const merchantBulkProductAction = vi.fn();
const quickAddMerchantProduct = vi.fn();
const duplicateMerchantProduct = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    listScopedProducts: (...args: unknown[]) => listScopedProducts(...args),
    updateProductStatus: (...args: unknown[]) => updateProductStatus(...args),
    getCategoriesAdminList: (...args: unknown[]) => getCategoriesAdminList(...args),
    getAdminMerchants: (...args: unknown[]) => getAdminMerchants(...args),
    merchantBulkProductAction: (...args: unknown[]) => merchantBulkProductAction(...args),
    quickAddMerchantProduct: (...args: unknown[]) => quickAddMerchantProduct(...args),
    duplicateMerchantProduct: (...args: unknown[]) => duplicateMerchantProduct(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

let mockCurrentMerchant = {
  data: { merchant_id: "merchant-123", role: "owner" },
  isLoading: false,
};

vi.mock("@/hooks/use-current-merchant", () => ({
  useCurrentMerchant: () => mockCurrentMerchant,
}));

import ProductsPage from "./ProductsPage";

const context = { scope: "merchant" as const, merchantId: "merchant-123" };

function renderPage(customContext = context, initialEntries = ["/products"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <ProductsPage context={customContext} editPathBase="/products" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderPageWithRouter(customContext = context, initialEntries = ["/products"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: <ProductsPage context={customContext} editPathBase="/products" />,
      },
    ],
    { initialEntries },
  );
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCurrentMerchant = {
    data: { merchant_id: "merchant-123", role: "owner" },
    isLoading: false,
  };
  getCategoriesAdminList.mockResolvedValue([]);
  getAdminMerchants.mockResolvedValue([]);
});

import { toast } from "sonner";

describe("ProductsPage - Frontend Status Priority and Action Button Semantics", () => {
  it("shows badge 'نشط داخلياً — غير منشور' and button 'نشر في المتجر' for active-private product, sending is_active=true (never false)", async () => {
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-priv",
        name: "منتج خاص",
        price: 100,
        stock: 5,
        is_active: true,
        is_published: false,
        visibility_status: "private",
        categories: { name: "الرئيسية" },
      },
    ]);
    updateProductStatus.mockResolvedValue({ ok: true });

    renderPage();

    expect(await screen.findByText("منتج خاص")).toBeDefined();
    expect(screen.getByText("نشط داخلياً — غير منشور")).toBeDefined();

    const publishBtn = screen.getByRole("button", { name: "نشر في المتجر" });
    expect(publishBtn).toBeDefined();

    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(updateProductStatus).toHaveBeenCalledWith("prod-priv", {
        is_active: true,
        merchant_id: "merchant-123",
      });
      expect(updateProductStatus).not.toHaveBeenCalledWith("prod-priv", {
        is_active: false,
        merchant_id: "merchant-123",
      });
    });
  });

  it("shows button 'نشر في المتجر' for active-unpublished-public product, sending is_active=true", async () => {
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-pub-unpub",
        name: "منتج غير منشور",
        price: 100,
        stock: 5,
        is_active: true,
        is_published: false,
        visibility_status: "public",
        categories: { name: "الرئيسية" },
      },
    ]);
    updateProductStatus.mockResolvedValue({ ok: true });

    renderPage();

    expect(await screen.findByText("منتج غير منشور")).toBeDefined();
    expect(screen.getByText("نشط داخلياً — غير منشور")).toBeDefined();

    const publishBtn = screen.getByRole("button", { name: "نشر في المتجر" });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(updateProductStatus).toHaveBeenCalledWith("prod-pub-unpub", {
        is_active: true,
        merchant_id: "merchant-123",
      });
    });
  });

  it("shows badge 'ظاهر في المتجر' and button 'تعطيل' for fully public product, sending is_active=false", async () => {
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-public",
        name: "منتج ظاهر",
        price: 100,
        stock: 5,
        is_active: true,
        is_published: true,
        visibility_status: "public",
        categories: { name: "الرئيسية" },
      },
    ]);
    updateProductStatus.mockResolvedValue({ ok: true });

    renderPage();

    expect(await screen.findByText("منتج ظاهر")).toBeDefined();
    expect(screen.getByText("ظاهر في المتجر")).toBeDefined();

    const deactivateBtn = screen.getByRole("button", { name: "تعطيل" });
    fireEvent.click(deactivateBtn);

    await waitFor(() => {
      expect(updateProductStatus).toHaveBeenCalledWith("prod-public", {
        is_active: false,
        merchant_id: "merchant-123",
      });
    });
  });

  it("shows badge 'معطل' and button 'تفعيل ونشر' for inactive private product, sending is_active=true", async () => {
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-inactive",
        name: "منتج معطل",
        price: 100,
        stock: 5,
        is_active: false,
        is_published: false,
        visibility_status: "private",
        categories: { name: "الرئيسية" },
      },
    ]);
    updateProductStatus.mockResolvedValue({ ok: true });

    renderPage();

    expect(await screen.findByText("منتج معطل")).toBeDefined();
    expect(screen.getByText("معطل")).toBeDefined();

    const activateBtn = screen.getByRole("button", { name: "تفعيل ونشر" });
    fireEvent.click(activateBtn);

    await waitFor(() => {
      expect(updateProductStatus).toHaveBeenCalledWith("prod-inactive", {
        is_active: true,
        merchant_id: "merchant-123",
      });
    });
  });

  it("shows badge 'مؤرشف' and button 'استعادة ونشر' for archived product, sending is_active=true", async () => {
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-archived",
        name: "منتج مؤرشف",
        price: 100,
        stock: 5,
        is_active: true,
        is_published: true,
        visibility_status: "archived",
        categories: { name: "الرئيسية" },
      },
    ]);
    updateProductStatus.mockResolvedValue({ ok: true });

    renderPage();

    expect(await screen.findByText("منتج مؤرشف")).toBeDefined();
    expect(screen.getByText("مؤرشف")).toBeDefined();

    const restoreBtn = screen.getByRole("button", { name: "استعادة ونشر" });
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(updateProductStatus).toHaveBeenCalledWith("prod-archived", {
        is_active: true,
        merchant_id: "merchant-123",
      });
    });
  });

  it("shows corresponding publishing toast and refetches product query on successful publish", async () => {
    listScopedProducts
      .mockResolvedValueOnce([
        {
          id: "prod-pub-test",
          name: "منتج نشر",
          price: 100,
          stock: 5,
          is_active: true,
          is_published: false,
          visibility_status: "private",
          categories: { name: "الرئيسية" },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "prod-pub-test",
          name: "منتج نشر",
          price: 100,
          stock: 5,
          is_active: true,
          is_published: true,
          visibility_status: "public",
          categories: { name: "الرئيسية" },
        },
      ]);
    updateProductStatus.mockResolvedValue({ ok: true });

    renderPage();

    const publishBtn = await screen.findByRole("button", { name: "نشر في المتجر" });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("تم نشر المنتج في المتجر");
      expect(listScopedProducts).toHaveBeenCalledTimes(2);
    });
  });
});

describe("ProductsPage - Server-Side Pagination and Exact Total Count", () => {
  it("displays exact total count badge (1410) when page has 100 items and shows range indicator", async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: `prod-${i + 1}`,
      name: `منتج تجريبي ${i + 1}`,
      price: 100,
      stock: 10,
      is_active: true,
      is_published: true,
      visibility_status: "public",
      categories: { name: "العطور" },
    }));

    listScopedProducts.mockResolvedValue({
      items,
      total: 1410,
      offset: 0,
      limit: 100,
    });

    renderPage();

    expect(await screen.findByText("منتج تجريبي 1")).toBeDefined();
    // Badge must show 1410, not 100
    expect(screen.getByText("عدد المنتجات: 1410")).toBeDefined();
    // Range indicator must show 1–100 من 1410
    expect(screen.getByText("عرض 1–100 من 1410")).toBeDefined();
    // Page indicator
    expect(screen.getByText("صفحة 1 من 15")).toBeDefined();

    // Previous button must be disabled on page 1
    const prevBtn = screen.getByRole("button", { name: "السابق" });
    expect(prevBtn.hasAttribute("disabled")).toBe(true);

    // Next button must be enabled
    const nextBtn = screen.getByRole("button", { name: "التالي" });
    expect(nextBtn.hasAttribute("disabled")).toBe(false);
  });

  it("navigates to next page requesting offset 100 on clicking التالي", async () => {
    const page1Items = Array.from({ length: 100 }, (_, i) => ({
      id: `prod-${i + 1}`,
      name: `منتج صفحة 1 رقم ${i + 1}`,
      price: 100,
      stock: 10,
      is_active: true,
      is_published: true,
      visibility_status: "public",
    }));

    const page2Items = Array.from({ length: 100 }, (_, i) => ({
      id: `prod-${i + 101}`,
      name: `منتج صفحة 2 رقم ${i + 1}`,
      price: 100,
      stock: 10,
      is_active: true,
      is_published: true,
      visibility_status: "public",
    }));

    listScopedProducts
      .mockResolvedValueOnce({
        items: page1Items,
        total: 1410,
        offset: 0,
        limit: 100,
      })
      .mockResolvedValueOnce({
        items: page2Items,
        total: 1410,
        offset: 100,
        limit: 100,
      });

    renderPage();

    expect(await screen.findByText("منتج صفحة 1 رقم 1")).toBeDefined();
    const nextBtn = screen.getByRole("button", { name: "التالي" });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(listScopedProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          offset: 100,
          limit: 100,
        }),
      );
    });

    expect(await screen.findByText("منتج صفحة 2 رقم 1")).toBeDefined();
    expect(screen.getByText("عرض 101–200 من 1410")).toBeDefined();
    expect(screen.getByText("صفحة 2 من 15")).toBeDefined();
  });

  it("resets page to 1 when changing search query", async () => {
    listScopedProducts.mockResolvedValue({
      items: [
        {
          id: "prod-1",
          name: "عطر الورد",
          price: 50,
          stock: 5,
          is_active: true,
          is_published: true,
          visibility_status: "public",
        },
      ],
      total: 1,
      offset: 0,
      limit: 100,
    });

    renderPage();

    const searchInput = screen.getByPlaceholderText("بحث عن منتج...");
    fireEvent.change(searchInput, { target: { value: "عود" } });

    await waitFor(() => {
      expect(listScopedProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: "عود",
          offset: 0,
        }),
      );
    });
  });

  it("resets page to 1 when changing merchant in platform scope", async () => {
    getAdminMerchants.mockResolvedValue([
      { id: "m1", display_name: "التاجر الأول" },
      { id: "m2", display_name: "التاجر الثاني" },
    ]);

    listScopedProducts.mockResolvedValue({
      items: [
        {
          id: "prod-m1",
          name: "منتج م1",
          price: 50,
          stock: 5,
          is_active: true,
          is_published: true,
          visibility_status: "public",
        },
      ],
      total: 1,
      offset: 0,
      limit: 100,
    });

    renderPage({ scope: "platform", merchantId: undefined });

    expect(await screen.findByText("التاجر الأول")).toBeDefined();
    const select = screen.getByDisplayValue("اختر التاجر أولاً");
    fireEvent.change(select, { target: { value: "m2" } });

    await waitFor(() => {
      expect(listScopedProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          merchant_id: "m2",
          offset: 0,
        }),
      );
    });
  });

  it("select-all checkbox selects only IDs on the current page, not all 1410 products", async () => {
    const pageItems = Array.from({ length: 5 }, (_, i) => ({
      id: `prod-page1-${i + 1}`,
      name: `منتج ${i + 1}`,
      price: 100,
      stock: 10,
      is_active: true,
      is_published: true,
      visibility_status: "public",
    }));

    listScopedProducts.mockResolvedValue({
      items: pageItems,
      total: 1410,
      offset: 0,
      limit: 100,
    });

    renderPage();

    expect(await screen.findByText("منتج 1")).toBeDefined();

    // Find the header checkbox (first checkbox in table)
    const checkboxes = screen.getAllByRole("checkbox");
    const headerCheckbox = checkboxes[0];

    fireEvent.click(headerCheckbox);

    // Bulk selection indicator must show 5 items selected (the current page), not 1410
    expect(await screen.findByText("تم اختيار 5 منتج")).toBeDefined();
  });

  it("reads initial page 7 from URL and requests offset 600 with correct range indicator", async () => {
    const page7Items = Array.from({ length: 100 }, (_, i) => ({
      id: `prod-p7-${i + 1}`,
      name: `منتج صفحة 7 رقم ${i + 1}`,
      price: 150,
      stock: 8,
      is_active: true,
      is_published: true,
      visibility_status: "public",
      categories: { name: "العناية" },
    }));

    listScopedProducts.mockResolvedValue({
      items: page7Items,
      total: 1411,
      offset: 600,
      limit: 100,
    });

    renderPage(context, ["/products?page=7"]);

    expect(await screen.findByText("منتج صفحة 7 رقم 1")).toBeDefined();
    expect(screen.getByText("صفحة 7 من 15")).toBeDefined();
    expect(screen.getByText("عرض 601–700 من 1411")).toBeDefined();

    expect(listScopedProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 600,
        limit: 100,
      }),
    );
  });

  it("constructs return_to with current page, search, readiness, and focus for edit links", async () => {
    listScopedProducts.mockResolvedValue({
      items: [
        {
          id: "prod-701",
          name: "عطر فاخر 701",
          price: 250,
          stock: 3,
          is_active: true,
          is_published: true,
          visibility_status: "public",
          categories: { name: "عطور" },
        },
      ],
      total: 1411,
      offset: 600,
      limit: 100,
    });

    renderPage(context, ["/products?page=7&readiness=not_ready&search=عطر"]);

    expect(await screen.findByText("عطر فاخر 701")).toBeDefined();

    // Find the edit link
    const editLink = screen.getByRole("link", { name: "تعديل" });
    const href = editLink.getAttribute("href") || "";

    expect(href).toContain("/products/prod-701/edit");
    expect(href).toContain("return_to=");

    const returnToParam = new URLSearchParams(href.split("?")[1]).get("return_to");
    expect(returnToParam).toBeDefined();

    const decodedReturnTo = decodeURIComponent(returnToParam!);
    expect(decodedReturnTo).toContain("/products");
    expect(decodedReturnTo).toContain("page=7");
    expect(decodedReturnTo).toContain("readiness=not_ready");
    expect(decodedReturnTo).toContain("search=عطر");
    expect(decodedReturnTo).toContain("focus=prod-701");
  });

  it("admin scope preserves merchant_id and page in edit link and return_to", async () => {
    getAdminMerchants.mockResolvedValue([
      { id: "merchant-abc", display_name: "تاجر بغداد" },
    ]);

    listScopedProducts.mockResolvedValue({
      items: [
        {
          id: "prod-admin-1",
          name: "منتج إداري",
          price: 300,
          stock: 12,
          is_active: true,
          is_published: true,
          visibility_status: "public",
          categories: { name: "عام" },
          merchants: { display_name: "تاجر بغداد" },
        },
      ],
      total: 750,
      offset: 600,
      limit: 100,
    });

    renderPage({ scope: "platform", merchantId: undefined }, [
      "/admin/products?merchant_id=merchant-abc&page=7",
    ]);

    expect(await screen.findByText("منتج إداري")).toBeDefined();

    const editLink = screen.getByRole("link", { name: "تعديل" });
    const href = editLink.getAttribute("href") || "";

    expect(href).toContain("merchant_id=merchant-abc");
    const returnToParam = new URLSearchParams(href.split("?")[1]).get("return_to");
    const decodedReturnTo = decodeURIComponent(returnToParam!);
    expect(decodedReturnTo).toContain("merchant_id=merchant-abc");
    expect(decodedReturnTo).toContain("page=7");
    expect(decodedReturnTo).toContain("focus=prod-admin-1");
  });

  it("resets page to 1 when changing readiness filter", async () => {
    listScopedProducts.mockResolvedValue({
      items: [
        {
          id: "prod-1",
          name: "منتج جاهز",
          price: 100,
          stock: 5,
          is_active: true,
          is_published: true,
          visibility_status: "public",
          readiness: { is_ready: true, score: 100 },
        },
      ],
      total: 1,
      offset: 0,
      limit: 100,
    });

    renderPage(context, ["/products?page=4"]);

    expect(await screen.findByText("منتج جاهز")).toBeDefined();

    const readinessSelect = screen.getByDisplayValue("كل الجاهزية");
    fireEvent.change(readinessSelect, { target: { value: "not_ready" } });

    await waitFor(() => {
      expect(listScopedProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          readiness: "not_ready",
          offset: 0,
        }),
      );
    });
  });

  it("clamps out of range page gracefully without error", async () => {
    listScopedProducts.mockResolvedValue({
      items: [
        {
          id: "prod-last",
          name: "منتج الصفحة الأخيرة",
          price: 100,
          stock: 5,
          is_active: true,
          is_published: true,
          visibility_status: "public",
        },
      ],
      total: 250, // 3 pages total (100 per page)
      offset: 200,
      limit: 100,
    });

    // Request page 10 when total is only 250 items (3 pages)
    renderPage(context, ["/products?page=10"]);

    expect(await screen.findByText("منتج الصفحة الأخيرة")).toBeDefined();
    // Indicator should show page 3 of 3
    expect(await screen.findByText("صفحة 3 من 3")).toBeDefined();
  });

  it("Admin browser navigation: removing merchant_id from URL clears stale merchant state and displays selection prompt", async () => {
    getAdminMerchants.mockResolvedValue([
      { id: "merchant-A", display_name: "التاجر A" },
      { id: "merchant-B", display_name: "التاجر B" },
    ]);

    listScopedProducts.mockResolvedValue({
      items: [
        {
          id: "prod-A-1",
          name: "منتج التاجر A",
          price: 100,
          stock: 10,
          is_active: true,
          is_published: true,
          visibility_status: "public",
        },
      ],
      total: 1,
      offset: 0,
      limit: 100,
    });

    const { router } = renderPageWithRouter(
      { scope: "platform", merchantId: undefined },
      ["/admin/products?merchant_id=merchant-A&page=7"],
    );

    // Initial render with merchant-A
    expect(await screen.findByText("منتج التاجر A")).toBeDefined();
    expect(listScopedProducts).toHaveBeenCalledWith(
      expect.objectContaining({ merchant_id: "merchant-A" }),
    );

    // Simulate browser Back / history change to /admin/products (removing merchant_id)
    await act(async () => {
      await router.navigate("/admin/products");
    });

    // Should immediately display the merchant selection prompt without stale merchant-A data
    expect(await screen.findByText("اختر التاجر من القائمة أعلاه لعرض منتجاته.")).toBeDefined();
    expect(screen.queryByText("منتج التاجر A")).toBeNull();
  });

  it("Admin browser navigation: switching merchant_id via URL dynamically queries target merchant without stale state", async () => {
    getAdminMerchants.mockResolvedValue([
      { id: "merchant-A", display_name: "التاجر A" },
      { id: "merchant-B", display_name: "التاجر B" },
    ]);

    listScopedProducts.mockImplementation(async (args: { merchant_id?: string; offset?: number; limit?: number }) => {
      if (args.merchant_id === "merchant-A") {
        return {
          items: [
            {
              id: "prod-A-1",
              name: "منتج التاجر A",
              price: 100,
              stock: 10,
              is_active: true,
              is_published: true,
              visibility_status: "public",
            },
          ],
          total: 1,
          offset: 0,
          limit: 100,
        };
      }
      if (args.merchant_id === "merchant-B") {
        return {
          items: [
            {
              id: "prod-B-1",
              name: "منتج التاجر B",
              price: 200,
              stock: 20,
              is_active: true,
              is_published: true,
              visibility_status: "public",
            },
          ],
          total: 150,
          offset: 100,
          limit: 100,
        };
      }
      return { items: [], total: 0, offset: 0, limit: 100 };
    });

    const { router } = renderPageWithRouter(
      { scope: "platform", merchantId: undefined },
      ["/admin/products?merchant_id=merchant-A"],
    );

    expect(await screen.findByText("منتج التاجر A")).toBeDefined();

    // Simulate browser navigation to merchant-B with page 2
    await act(async () => {
      await router.navigate("/admin/products?merchant_id=merchant-B&page=2");
    });

    expect(await screen.findByText("منتج التاجر B")).toBeDefined();
    expect(screen.queryByText("منتج التاجر A")).toBeNull();
    expect(listScopedProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({
        merchant_id: "merchant-B",
        offset: 100,
        limit: 100,
      }),
    );
  });

  it("Merchant browser Back/Forward navigation: resets selectedIds and prevents bulk action from mutating hidden products", async () => {
    merchantBulkProductAction.mockResolvedValue({ ok: true });

    listScopedProducts.mockImplementation(async (args: { offset?: number; limit?: number }) => {
      if (!args.offset || args.offset === 0) {
        return {
          items: [
            {
              id: "prod-page1-1",
              name: "منتج صفحة 1 رقم 1",
              price: 100,
              stock: 10,
              is_active: true,
              is_published: true,
              visibility_status: "public",
            },
            {
              id: "prod-page1-2",
              name: "منتج صفحة 1 رقم 2",
              price: 150,
              stock: 5,
              is_active: true,
              is_published: true,
              visibility_status: "public",
            },
          ],
          total: 200,
          offset: 0,
          limit: 100,
        };
      }
      if (args.offset === 100) {
        return {
          items: [
            {
              id: "prod-page2-1",
              name: "منتج صفحة 2 رقم 1",
              price: 200,
              stock: 20,
              is_active: true,
              is_published: true,
              visibility_status: "public",
            },
            {
              id: "prod-page2-2",
              name: "منتج صفحة 2 رقم 2",
              price: 250,
              stock: 15,
              is_active: true,
              is_published: true,
              visibility_status: "public",
            },
          ],
          total: 200,
          offset: 100,
          limit: 100,
        };
      }
      return { items: [], total: 0, offset: 0, limit: 100 };
    });

    const { router } = renderPageWithRouter(
      { scope: "merchant", merchantId: "merchant-123" },
      ["/merchant/products?page=1"],
    );

    // 1. On page 1: wait for products to load
    expect(await screen.findByText("منتج صفحة 1 رقم 1")).toBeDefined();
    expect(screen.getByText("منتج صفحة 1 رقم 2")).toBeDefined();

    // 2. Select both products on page 1
    const checkboxes = screen.getAllByRole("checkbox");
    // checkboxes[0] is header select-all, [1] is prod 1, [2] is prod 2
    fireEvent.click(checkboxes[1]); // select prod-page1-1
    fireEvent.click(checkboxes[2]); // select prod-page1-2

    expect(await screen.findByText("تم اختيار 2 منتج")).toBeDefined();

    // 3. Navigate to page 2 (push to history)
    await act(async () => {
      await router.navigate("/merchant/products?page=2");
    });

    // 4. On page 2: verify products loaded and selection was purged
    expect(await screen.findByText("منتج صفحة 2 رقم 1")).toBeDefined();
    expect(screen.queryByText("تم اختيار 2 منتج")).toBeNull();
    expect(screen.queryByText(/تم اختيار/)).toBeNull();

    // Verify all checkboxes on page 2 are unchecked
    const page2Checkboxes = screen.getAllByRole("checkbox");
    page2Checkboxes.forEach((cb) => {
      expect((cb as HTMLInputElement).checked).toBe(false);
    });

    // 5. Select one product on page 2
    fireEvent.click(page2Checkboxes[1]); // select prod-page2-1
    expect(await screen.findByText("تم اختيار 1 منتج")).toBeDefined();

    // 6. Test Browser Back navigation via router.navigate(-1)
    await act(async () => {
      await router.navigate(-1);
    });

    // 7. Back on page 1: verify page 1 products loaded and selection from page 2 is purged
    expect(await screen.findByText("منتج صفحة 1 رقم 1")).toBeDefined();
    expect(screen.queryByText(/تم اختيار/)).toBeNull();

    const backPage1Checkboxes = screen.getAllByRole("checkbox");
    backPage1Checkboxes.forEach((cb) => {
      expect((cb as HTMLInputElement).checked).toBe(false);
    });

    // 8. Test Browser Forward navigation via router.navigate(1)
    await act(async () => {
      await router.navigate(1);
    });

    // 9. Forward on page 2: verify clean state
    expect(await screen.findByText("منتج صفحة 2 رقم 1")).toBeDefined();
    expect(screen.queryByText(/تم اختيار/)).toBeNull();

    const forwardPage2Checkboxes = screen.getAllByRole("checkbox");
    forwardPage2Checkboxes.forEach((cb) => {
      expect((cb as HTMLInputElement).checked).toBe(false);
    });

    // 10. Select prod-page2-1 and execute bulk action to verify ONLY visible product ID is sent
    fireEvent.click(forwardPage2Checkboxes[1]);
    expect(await screen.findByText("تم اختيار 1 منتج")).toBeDefined();

    const bulkSelect = screen.getByDisplayValue("اختر عملية جماعية");
    fireEvent.change(bulkSelect, { target: { value: "activate" } });

    const executeBtn = screen.getByRole("button", { name: "تنفيذ" });
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(merchantBulkProductAction).toHaveBeenCalledTimes(1);
    });

    // Verify payload strictly contains prod-page2-1 and NEVER hidden/stale prod-page1-1 or prod-page1-2
    expect(merchantBulkProductAction).toHaveBeenLastCalledWith({
      merchant_id: "merchant-123",
      product_ids: ["prod-page2-1"],
      action: "activate",
      payload: {},
    });
  });
});

describe("ProductsPage - Quick Add publication-state contract", () => {
  async function submitQuickAdd() {
    listScopedProducts.mockResolvedValue([]);
    getCategoriesAdminList.mockResolvedValue([
      { id: "cat-1", name: "قسم", slug: "cat-1", parent_id: null, is_active: true },
    ]);
    renderPage();

    await waitFor(() => expect(listScopedProducts).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "إضافة سريعة" }));
    fireEvent.change(screen.getByPlaceholderText("الاسم"), { target: { value: "منتج سريع" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "قسم" })).toBeTruthy());
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "cat-1" } });
    fireEvent.change(screen.getByPlaceholderText("السعر"), { target: { value: "100" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "حفظ المنتج" }));
    });
  }

  it("reports a draft when the backend refuses to activate an incomplete quick payload", async () => {
    // Backend contract: the quick-add response always carries the resolved publication triple.
    quickAddMerchantProduct.mockResolvedValue({
      id: "p1",
      name: "منتج سريع",
      slug: "quick",
      is_active: false,
      is_published: false,
      visibility_status: "private",
    });

    await submitQuickAdd();

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("تمت إضافة المنتج كمسودة — أكمل الصورة والوصف لتفعيله"),
    );
  });

  it("reports a normal success when the quick payload was ready and went live", async () => {
    quickAddMerchantProduct.mockResolvedValue({
      id: "p2",
      name: "منتج سريع",
      slug: "quick-2",
      is_active: true,
      is_published: true,
      visibility_status: "public",
    });

    await submitQuickAdd();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("تمت إضافة المنتج بسرعة"));
  });
});

describe("ProductsPage - Data Isolation, Neutral Stock & Responsive UX", () => {
  it("MERCHANT A -> B DATA ISOLATION: switching merchant context immediately fetches new products and does not leak previous catalog", async () => {
    const productsA = [
      {
        id: "prod-a1",
        name: "منتج متجر بغداد",
        price: 15000,
        stock: 10,
        is_active: true,
        is_published: true,
        visibility_status: "public",
        categories: { name: "عطور" },
      },
    ];
    const productsB = [
      {
        id: "prod-b1",
        name: "منتج متجر البصرة",
        price: 25000,
        stock: 5,
        is_active: true,
        is_published: true,
        visibility_status: "public",
        categories: { name: "أطعمة" },
      },
    ];

    listScopedProducts.mockImplementation((params: { merchant_id?: string }) => {
      if (params?.merchant_id === "merchant-A") {
        return Promise.resolve(productsA);
      }
      if (params?.merchant_id === "merchant-B") {
        return Promise.resolve(productsB);
      }
      return Promise.resolve([]);
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/products"]}>
          <ProductsPage context={{ scope: "merchant", merchantId: "merchant-A" }} editPathBase="/merchant/products" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("منتج متجر بغداد")).toBeTruthy();
    expect(screen.queryByText("منتج متجر البصرة")).toBeNull();

    // Rerender with merchant B
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/products"]}>
          <ProductsPage context={{ scope: "merchant", merchantId: "merchant-B" }} editPathBase="/merchant/products" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("منتج متجر البصرة")).toBeTruthy();
    expect(screen.queryByText("منتج متجر بغداد")).toBeNull();
  });

  it("NEUTRAL STOCK: renders stock quantity neutrally without hard-coded <= 5 warning classes", async () => {
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-stock-low",
        name: "منتج بمخزون 2",
        price: 5000,
        stock: 2,
        is_active: true,
        is_published: true,
        visibility_status: "public",
        categories: { name: "عام" },
      },
    ]);

    renderPage();

    await screen.findByText("منتج بمخزون 2");
    const stockCell = screen.getByText("2");
    expect(stockCell).toBeTruthy();
    expect(stockCell.className).not.toContain("text-amber-600");
  });

  it("RESPONSIVE MERCHANT PRESENTATION: renders product details and actions in merchant scope", async () => {
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-mob-1",
        name: "منتج الموبايل",
        price: 20000,
        stock: 12,
        is_active: true,
        is_published: true,
        visibility_status: "public",
        categories: { name: "إلكترونيات" },
        readiness: { is_ready: true, score: 100, checklist: [] },
      },
    ]);

    renderPage({ scope: "merchant", merchantId: "merchant-123" });

    await screen.findByText("منتج الموبايل");
    expect(screen.getAllByText("إلكترونيات").length).toBeGreaterThan(0);
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("PLATFORM AUTHORITY: platform scope preserves merchant filter and desktop table", async () => {
    getAdminMerchants.mockResolvedValue([
      { id: "adm-m1", display_name: "تاجر المنصة 1" },
    ]);
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-plat-1",
        name: "منتج المنصة",
        price: 30000,
        stock: 15,
        is_active: true,
        is_published: true,
        visibility_status: "public",
        categories: { name: "أجهزة" },
        merchants: { display_name: "تاجر المنصة 1" },
      },
    ]);

    renderPage({ scope: "platform" }, ["/admin/products?merchant_id=adm-m1"]);

    await screen.findByText("منتج المنصة");
    expect(screen.getByText("اختر التاجر أولاً")).toBeTruthy();
  });
});

describe("ProductsPage - Merchant Staff Role Gating & Store Change Isolation", () => {
  it("STAFF READ-ONLY: staff account hides Add, Import, Quick Add, Bulk Actions, and displays 'عرض فقط'", async () => {
    mockCurrentMerchant = {
      data: { merchant_id: "merchant-123", role: "staff" },
      isLoading: false,
    };
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-staff-1",
        name: "منتج الموظف",
        price: 5000,
        stock: 20,
        is_active: true,
        is_published: true,
        visibility_status: "public",
        categories: { name: "عطور" },
        readiness: { is_ready: true, score: 100, checklist: [] },
      },
    ]);

    renderPage({ scope: "merchant", merchantId: "merchant-123" });

    await screen.findByText("منتج الموظف");
    expect(screen.queryByRole("button", { name: "إضافة منتج" })).toBeNull();
    expect(screen.queryByRole("button", { name: "استيراد CSV" })).toBeNull();
    expect(screen.queryByRole("button", { name: "إضافة سريعة" })).toBeNull();
    expect(screen.queryByRole("button", { name: "تطبيق" })).toBeNull();
    expect(screen.getAllByText("عرض فقط").length).toBeGreaterThan(0);
  });

  it("DEFERRED QUICK ADD RACE: Store A response resolving after switch to Store B does not close Store B modal or clear form", async () => {
    mockCurrentMerchant = {
      data: { merchant_id: "store-a", role: "owner" },
      isLoading: false,
    };
    getCategoriesAdminList.mockResolvedValue([
      { id: "cat-1", name: "العطور", is_active: true, is_leaf: true, parent_id: null },
    ]);
    listScopedProducts.mockResolvedValue([]);

    let resolveStoreAQuickAdd!: (val: unknown) => void;
    const storeAPromise = new Promise((resolve) => {
      resolveStoreAQuickAdd = resolve;
    });
    quickAddMerchantProduct.mockReturnValue(storeAPromise);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/products"]}>
          <ProductsPage context={{ scope: "merchant", merchantId: "store-a" }} editPathBase="/products" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Open Quick Add in Store A
    const quickAddBtn = await screen.findByRole("button", { name: "إضافة سريعة" });
    fireEvent.click(quickAddBtn);

    // Fill Quick Add inputs
    const nameInput = screen.getByPlaceholderText("الاسم");
    fireEvent.change(nameInput, { target: { value: "منتج متجر أ" } });

    const priceInput = screen.getByPlaceholderText("السعر");
    fireEvent.change(priceInput, { target: { value: "5000" } });

    await waitFor(() => expect(screen.getByRole("option", { name: "العطور" })).toBeTruthy());
    const categorySelect = screen.getByDisplayValue("القسم");
    fireEvent.change(categorySelect, { target: { value: "cat-1" } });

    // Click Save
    const saveBtn = screen.getByRole("button", { name: "حفظ المنتج" });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(quickAddMerchantProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: "منتج متجر أ", merchant_id: "store-a" }),
    );

    // Switch store to Store B while request is pending
    mockCurrentMerchant = {
      data: { merchant_id: "store-b", role: "owner" },
      isLoading: false,
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/products"]}>
          <ProductsPage context={{ scope: "merchant", merchantId: "store-b" }} editPathBase="/products" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // In Store B, open Quick Add again and type something
    const quickAddBtnB = await screen.findByRole("button", { name: "إضافة سريعة" });
    fireEvent.click(quickAddBtnB);

    const nameInputB = screen.getByPlaceholderText("الاسم") as HTMLInputElement;
    fireEvent.change(nameInputB, { target: { value: "منتج متجر ب الجديد" } });

    // Now resolve the deferred Store A response
    await act(async () => {
      resolveStoreAQuickAdd({ id: "prod-a-new", name: "منتج متجر أ", is_active: true });
    });

    // Verify Store B modal is STILL open with user's typed value, and no toast for Store A
    expect(screen.getByPlaceholderText("الاسم")).toBeTruthy();
    expect((screen.getByPlaceholderText("الاسم") as HTMLInputElement).value).toBe("منتج متجر ب الجديد");
    expect(toast.success).not.toHaveBeenCalledWith("تمت إضافة المنتج بسرعة");
    expect(toast.success).not.toHaveBeenCalledWith("تمت إضافة المنتج كمسودة — أكمل الصورة والوصف لتفعيله");
  });

  it("DEFERRED QUICK ADD REJECTION RACE: Store A error after switch to Store B does not toast in Store B", async () => {
    mockCurrentMerchant = {
      data: { merchant_id: "store-a", role: "owner" },
      isLoading: false,
    };
    getCategoriesAdminList.mockResolvedValue([
      { id: "cat-1", name: "العطور", is_active: true, is_leaf: true, parent_id: null },
    ]);
    listScopedProducts.mockResolvedValue([]);

    let rejectStoreAQuickAdd!: (err: unknown) => void;
    const storeAPromise = new Promise((_, reject) => {
      rejectStoreAQuickAdd = reject;
    });
    storeAPromise.catch(() => {});
    quickAddMerchantProduct.mockReturnValue(storeAPromise);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/products"]}>
          <ProductsPage context={{ scope: "merchant", merchantId: "store-a" }} editPathBase="/products" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const quickAddBtn = await screen.findByRole("button", { name: "إضافة سريعة" });
    fireEvent.click(quickAddBtn);

    const nameInput = screen.getByPlaceholderText("الاسم");
    fireEvent.change(nameInput, { target: { value: "منتج متجر أ" } });
    const priceInput = screen.getByPlaceholderText("السعر");
    fireEvent.change(priceInput, { target: { value: "5000" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "العطور" })).toBeTruthy());
    const categorySelect = screen.getByDisplayValue("القسم");
    fireEvent.change(categorySelect, { target: { value: "cat-1" } });

    const saveBtn = screen.getByRole("button", { name: "حفظ المنتج" });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Switch store to Store B
    mockCurrentMerchant = {
      data: { merchant_id: "store-b", role: "owner" },
      isLoading: false,
    };
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/products"]}>
          <ProductsPage context={{ scope: "merchant", merchantId: "store-b" }} editPathBase="/products" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Reject Store A quick add
    await act(async () => {
      rejectStoreAQuickAdd(new Error("فشل إضافة منتج متجر أ"));
    });

    expect(toast.error).not.toHaveBeenCalledWith("فشل إضافة منتج متجر أ");
    expect(toast.error).not.toHaveBeenCalledWith("تعذر الإضافة السريعة");
  });

  it("DEFERRED BULK ACTION RACE: Store A response resolving after switch to Store B preserves Store B selection and suppresses Store A toast", async () => {
    mockCurrentMerchant = {
      data: { merchant_id: "store-a", role: "owner" },
      isLoading: false,
    };
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-a-1",
        name: "منتج متجر أ",
        price: 100,
        stock: 5,
        is_active: true,
        is_published: true,
        visibility_status: "public",
      },
    ]);

    let resolveStoreABulk!: (val: unknown) => void;
    const storeABulkPromise = new Promise((resolve) => {
      resolveStoreABulk = resolve;
    });
    merchantBulkProductAction.mockReturnValue(storeABulkPromise);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/products"]}>
          <ProductsPage context={{ scope: "merchant", merchantId: "store-a" }} editPathBase="/products" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("منتج متجر أ");

    // Select Store A row
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    // Select bulk action "deactivate"
    const actionSelect = screen.getByDisplayValue("اختر عملية جماعية");
    fireEvent.change(actionSelect, { target: { value: "deactivate" } });

    // Click Apply
    const applyBtn = screen.getByRole("button", { name: "تنفيذ" });
    await act(async () => {
      fireEvent.click(applyBtn);
    });

    expect(merchantBulkProductAction).toHaveBeenCalledWith(
      expect.objectContaining({ merchant_id: "store-a", action: "deactivate" }),
    );

    // Switch store to Store B while bulk action is pending
    mockCurrentMerchant = {
      data: { merchant_id: "store-b", role: "owner" },
      isLoading: false,
    };
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-b-1",
        name: "منتج متجر ب",
        price: 200,
        stock: 10,
        is_active: true,
        is_published: true,
        visibility_status: "public",
      },
    ]);

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/products"]}>
          <ProductsPage context={{ scope: "merchant", merchantId: "store-b" }} editPathBase="/products" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("منتج متجر ب");

    // In Store B, select Store B product and choose action "activate"
    const checkboxesB = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxesB[1]);
    expect((checkboxesB[1] as HTMLInputElement).checked).toBe(true);

    const actionSelectB = screen.getByDisplayValue("اختر عملية جماعية") as HTMLSelectElement;
    fireEvent.change(actionSelectB, { target: { value: "activate" } });
    expect(actionSelectB.value).toBe("activate");

    // Resolve deferred Store A bulk response
    await act(async () => {
      resolveStoreABulk({ ok: true, affected: 1 });
    });

    // Verify toast is not called for Store A
    expect(toast.success).not.toHaveBeenCalledWith("تم تنفيذ العملية الجماعية");

    // Verify Store B product selection and selected action remain intact
    expect((checkboxesB[1] as HTMLInputElement).checked).toBe(true);
    expect(actionSelectB.value).toBe("activate");
  });

  it("DEFERRED BULK ACTION REJECTION RACE: Store A error after switch to Store B does not toast in Store B", async () => {
    mockCurrentMerchant = {
      data: { merchant_id: "store-a", role: "owner" },
      isLoading: false,
    };
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-a-1",
        name: "منتج متجر أ",
        price: 100,
        stock: 5,
        is_active: true,
        is_published: true,
        visibility_status: "public",
      },
    ]);

    let rejectStoreABulk!: (err: unknown) => void;
    const storeABulkPromise = new Promise((_, reject) => {
      rejectStoreABulk = reject;
    });
    storeABulkPromise.catch(() => {});
    merchantBulkProductAction.mockReturnValue(storeABulkPromise);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/products"]}>
          <ProductsPage context={{ scope: "merchant", merchantId: "store-a" }} editPathBase="/products" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("منتج متجر أ");
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    const actionSelect = screen.getByDisplayValue("اختر عملية جماعية");
    fireEvent.change(actionSelect, { target: { value: "deactivate" } });
    const applyBtn = screen.getByRole("button", { name: "تنفيذ" });
    await act(async () => {
      fireEvent.click(applyBtn);
    });

    // Switch store to Store B
    mockCurrentMerchant = {
      data: { merchant_id: "store-b", role: "owner" },
      isLoading: false,
    };
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/products"]}>
          <ProductsPage context={{ scope: "merchant", merchantId: "store-b" }} editPathBase="/products" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Reject Store A bulk action
    await act(async () => {
      rejectStoreABulk(new Error("فشل تنفيذ العملية الجماعية لمتجر أ"));
    });

    expect(toast.error).not.toHaveBeenCalledWith("فشل تنفيذ العملية الجماعية لمتجر أ");
    expect(toast.error).not.toHaveBeenCalledWith("تعذر تنفيذ العملية الجماعية");
  });

  it("DEFERRED STATUS UPDATE & DUPLICATE RACE: Store A mutation response after switch to Store B does not toast in Store B", async () => {
    mockCurrentMerchant = {
      data: { merchant_id: "store-a", role: "owner" },
      isLoading: false,
    };
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-a-1",
        name: "منتج متجر أ",
        price: 100,
        stock: 5,
        is_active: false,
        is_published: false,
        visibility_status: "private",
      },
    ]);

    let resolveDuplicateA!: (val: unknown) => void;
    duplicateMerchantProduct.mockReturnValue(
      new Promise((resolve) => {
        resolveDuplicateA = resolve;
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/products"]}>
          <ProductsPage context={{ scope: "merchant", merchantId: "store-a" }} editPathBase="/products" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("منتج متجر أ");

    // Click Duplicate in Store A
    const duplicateBtn = screen.getByTitle("نسخ المنتج");
    await act(async () => {
      fireEvent.click(duplicateBtn);
    });

    expect(duplicateMerchantProduct).toHaveBeenCalledWith("prod-a-1", "store-a");

    // Switch store to Store B
    mockCurrentMerchant = {
      data: { merchant_id: "store-b", role: "owner" },
      isLoading: false,
    };
    listScopedProducts.mockResolvedValue([
      {
        id: "prod-b-1",
        name: "منتج متجر ب",
        price: 200,
        stock: 10,
        is_active: true,
        is_published: true,
        visibility_status: "public",
      },
    ]);

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/products"]}>
          <ProductsPage context={{ scope: "merchant", merchantId: "store-b" }} editPathBase="/products" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("منتج متجر ب");

    // Resolve deferred Store A duplicate
    await act(async () => {
      resolveDuplicateA({ id: "prod-a-copy", name: "نسخة منتج متجر أ" });
    });

    expect(toast.success).not.toHaveBeenCalledWith("تم نسخ المنتج");
  });
});
