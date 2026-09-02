import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductImport from "./ProductImport";
import { toast } from "sonner";

const previewMerchantProductImport = vi.fn();
const confirmMerchantProductImport = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    previewMerchantProductImport: (...args: unknown[]) => previewMerchantProductImport(...args),
    confirmMerchantProductImport: (...args: unknown[]) => confirmMerchantProductImport(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

let mockCurrentMerchant = {
  data: { merchant_id: "store-a", role: "owner" },
  isLoading: false,
};

vi.mock("@/hooks/use-current-merchant", () => ({
  useCurrentMerchant: () => mockCurrentMerchant,
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/merchant/products/import"]}>
        <ProductImport />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProductImport Multi-Store Authority and Store Switching Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentMerchant = {
      data: { merchant_id: "store-a", role: "owner" },
      isLoading: false,
    };
  });

  it("Staff read-only gating blocks file input and import controls", async () => {
    mockCurrentMerchant = {
      data: { merchant_id: "store-a", role: "staff" },
      isLoading: false,
    };

    renderPage();

    expect(screen.getByText("حساب الموظف لديه صلاحية قراءة فقط. استيراد المنتجات متاح فقط لمالك أو مدير المتجر.")).toBeTruthy();
    const uploadBtn = screen.getByRole("button", { name: "معاينة الاستيراد" });
    expect((uploadBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Store switch resets active preview, result and file state", async () => {
    const { rerender } = renderPage();

    // Mock preview success for Store A
    previewMerchantProductImport.mockResolvedValue({
      import_id: "session-a-1",
      summary: { total_rows: 1, valid_rows: 1, invalid_rows: 0, warnings_count: 0 },
      rows: [
        {
          row_number: 1,
          status: "valid",
          normalized: { name: "عطر متجر أ", category_name: "العطور", price: 1000, sku: "SKU-A" },
          errors: [],
          warnings: [],
        },
      ],
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(["name,sku\nعطر,SKU-A"], "products.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const previewBtn = screen.getByRole("button", { name: "معاينة الاستيراد" });
    fireEvent.click(previewBtn);

    await screen.findByText("عطر متجر أ");
    const confirmBtn = screen.getByRole("button", { name: "تأكيد الاستيراد" });

    // Switch store to Store B
    mockCurrentMerchant = {
      data: { merchant_id: "store-b", role: "owner" },
      isLoading: false,
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/products/import"]}>
          <ProductImport />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify preview and table are cleared
    expect(screen.queryByText("عطر متجر أ")).toBeNull();
    expect(screen.queryByText("تأكيد وحفظ المنتجات")).toBeNull();
  });

  it("DEFERRED PREVIEW RACE: response from Store A resolving after switch to Store B does not populate Store B", async () => {
    let resolveStoreAPreview!: (val: unknown) => void;
    const storeAPromise = new Promise((resolve) => {
      resolveStoreAPreview = resolve;
    });
    previewMerchantProductImport.mockReturnValue(storeAPromise);

    const { rerender } = renderPage();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(["name,sku\nعطر قديم,SKU-OLD"], "products.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const previewBtn = screen.getByRole("button", { name: "معاينة الاستيراد" });
    fireEvent.click(previewBtn);

    // Switch store to Store B before Store A resolves
    mockCurrentMerchant = {
      data: { merchant_id: "store-b", role: "owner" },
      isLoading: false,
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/products/import"]}>
          <ProductImport />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Resolve Store A request
    await act(async () => {
      resolveStoreAPreview({
        import_id: "session-a-old",
        summary: { total_rows: 1, valid_rows: 1, invalid_rows: 0, warnings_count: 0 },
        rows: [
          {
            row_number: 1,
            status: "valid",
            normalized: { name: "عطر متجر أ القديم", category_name: "العطور", price: 1000, sku: "SKU-A" },
            errors: [],
            warnings: [],
          },
        ],
      });
    });

    // Verify Store A data is discarded and does not show in Store B
    expect(screen.queryByText("عطر متجر أ القديم")).toBeNull();
    expect(toast.success).not.toHaveBeenCalledWith("تم إنشاء معاينة الاستيراد");
  });

  it("DEFERRED CONFIRM RACE: response from Store A resolving after switch to Store B does not populate Store B result", async () => {
    previewMerchantProductImport.mockResolvedValue({
      import_id: "session-a-1",
      summary: { total_rows: 1, valid_rows: 1, invalid_rows: 0, warnings_count: 0 },
      rows: [
        {
          row_number: 1,
          status: "valid",
          normalized: { name: "عطر متجر أ", category_name: "العطور", price: 1000, sku: "SKU-A" },
          errors: [],
          warnings: [],
        },
      ],
    });

    let resolveStoreAConfirm!: (val: unknown) => void;
    const storeAConfirmPromise = new Promise((resolve) => {
      resolveStoreAConfirm = resolve;
    });
    confirmMerchantProductImport.mockReturnValue(storeAConfirmPromise);

    const { rerender } = renderPage();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(["name,sku\nعطر,SKU-A"], "products.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const previewBtn = screen.getByRole("button", { name: "معاينة الاستيراد" });
    fireEvent.click(previewBtn);

    await screen.findByText("عطر متجر أ");
    const confirmBtn = screen.getByRole("button", { name: "تأكيد الاستيراد" });
    fireEvent.click(confirmBtn);

    // Switch store to Store B before Store A confirm resolves
    mockCurrentMerchant = {
      data: { merchant_id: "store-b", role: "owner" },
      isLoading: false,
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/products/import"]}>
          <ProductImport />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Resolve Store A confirm
    await act(async () => {
      resolveStoreAConfirm({
        total: 1,
        created: 1,
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: [],
      });
    });

    // Verify Store A result does not show
    expect(screen.queryByText("تقرير نتيجة الاستيراد")).toBeNull();
    expect(toast.success).not.toHaveBeenCalledWith("تم تنفيذ الاستيراد");
  });

  it("DEFERRED PREVIEW REJECTION RACE: error from Store A resolving after switch to Store B does not toast in Store B", async () => {
    let rejectStoreAPreview!: (err: unknown) => void;
    const storeAPromise = new Promise((_, reject) => {
      rejectStoreAPreview = reject;
    });
    storeAPromise.catch(() => {});
    previewMerchantProductImport.mockReturnValue(storeAPromise);

    const { rerender } = renderPage();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(["name,sku\nعطر قديم,SKU-OLD"], "products.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const previewBtn = screen.getByRole("button", { name: "معاينة الاستيراد" });
    fireEvent.click(previewBtn);

    // Switch store to Store B before Store A rejects
    mockCurrentMerchant = {
      data: { merchant_id: "store-b", role: "owner" },
      isLoading: false,
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/products/import"]}>
          <ProductImport />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Reject Store A request with error
    await act(async () => {
      rejectStoreAPreview(new Error("خطأ في ملف المتجر أ القديم"));
    });

    // Verify error toast was suppressed because Store B is active
    expect(toast.error).not.toHaveBeenCalledWith("خطأ في ملف المتجر أ القديم");
  });

  it("DEFERRED CONFIRM REJECTION RACE: error from Store A resolving after switch to Store B does not toast in Store B", async () => {
    previewMerchantProductImport.mockResolvedValue({
      import_id: "session-a-err",
      summary: { total_rows: 1, valid_rows: 1, invalid_rows: 0, warnings_count: 0 },
      rows: [
        {
          row_number: 1,
          status: "valid",
          normalized: { name: "عطر متجر أ", category_name: "العطور", price: 1000, sku: "SKU-A" },
          errors: [],
          warnings: [],
        },
      ],
    });

    let rejectStoreAConfirm!: (err: unknown) => void;
    const storeAConfirmPromise = new Promise((_, reject) => {
      rejectStoreAConfirm = reject;
    });
    storeAConfirmPromise.catch(() => {});
    confirmMerchantProductImport.mockReturnValue(storeAConfirmPromise);

    const { rerender } = renderPage();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(["name,sku\nعطر,SKU-A"], "products.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const previewBtn = screen.getByRole("button", { name: "معاينة الاستيراد" });
    fireEvent.click(previewBtn);

    await screen.findByText("عطر متجر أ");
    const confirmBtn = screen.getByRole("button", { name: "تأكيد الاستيراد" });
    fireEvent.click(confirmBtn);

    // Switch store to Store B before Store A confirm rejects
    mockCurrentMerchant = {
      data: { merchant_id: "store-b", role: "owner" },
      isLoading: false,
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/products/import"]}>
          <ProductImport />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Reject Store A confirm with error
    await act(async () => {
      rejectStoreAConfirm(new Error("فشل تأكيد استيراد متجر أ"));
    });

    // Verify error toast was suppressed
    expect(toast.error).not.toHaveBeenCalledWith("فشل تأكيد استيراد متجر أ");
  });
});
