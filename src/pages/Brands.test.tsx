import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Brands from "./Brands";

vi.mock("@/components/Header", () => ({ default: () => <div data-testid="header-stub" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <div data-testid="footer-stub" /> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));

const getMarketplaceBrands = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMarketplaceBrands: (...args: unknown[]) => getMarketplaceBrands(...args),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderBrands() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/brands"]}>
        <Brands />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Deliberately not real production brand names — some of those are wired to a
// real logo image in `brand-logo-registry.ts` and would render as an `<img>`
// instead of visible text, which is irrelevant to what this page-level test
// is checking (loading/error/empty/results state, not logo rendering).
const SAMPLE_BRANDS = [
  { name: "TestBrandAlpha", count: 11, imageUrl: null },
  { name: "TestBrandBeta", count: 44, imageUrl: null },
];

describe("Brands page", () => {
  it("shows the loading skeleton while the query is in flight", () => {
    getMarketplaceBrands.mockReturnValue(new Promise(() => {})); // never resolves
    renderBrands();
    expect(screen.getByLabelText("جاري التحميل")).toBeInTheDocument();
  });

  it("renders the brand grid on a successful non-empty response", async () => {
    getMarketplaceBrands.mockResolvedValue({ brands: SAMPLE_BRANDS });
    renderBrands();
    expect(await screen.findByText("TestBrandAlpha")).toBeInTheDocument();
    expect(screen.getByText("TestBrandBeta")).toBeInTheDocument();
    expect(screen.getByText("عرض 2 علامة تجارية")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the legitimate empty state on a successful empty response", async () => {
    getMarketplaceBrands.mockResolvedValue({ brands: [] });
    renderBrands();
    expect(await screen.findByText("لا توجد علامات تجارية معروضة حالياً.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the dedicated error state when the request fails", async () => {
    getMarketplaceBrands.mockRejectedValue(new Error("network down"));
    renderBrands();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("تعذر تحميل العلامات التجارية");
    expect(alert).toHaveTextContent("حدث خطأ أثناء تحميل العلامات التجارية");
  });

  it("does NOT show the legitimate empty message on a failed request", async () => {
    getMarketplaceBrands.mockRejectedValue(new Error("network down"));
    renderBrands();
    await screen.findByRole("alert");
    expect(screen.queryByText("لا توجد علامات تجارية معروضة حالياً.")).not.toBeInTheDocument();
  });

  it("retries by calling the query again, not by reloading the page", async () => {
    getMarketplaceBrands.mockRejectedValueOnce(new Error("network down"));
    getMarketplaceBrands.mockResolvedValueOnce({ brands: SAMPLE_BRANDS });
    renderBrands();

    await screen.findByRole("alert");
    expect(getMarketplaceBrands).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));

    await waitFor(() => expect(getMarketplaceBrands).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("TestBrandAlpha")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("the error state's secondary action links to /products", async () => {
    getMarketplaceBrands.mockRejectedValue(new Error("network down"));
    renderBrands();
    await screen.findByRole("alert");
    const link = screen.getByRole("link", { name: "تصفّح المنتجات" });
    expect(link).toHaveAttribute("href", "/products");
  });

  it("the empty state's browse-products fallback also links to /products", async () => {
    getMarketplaceBrands.mockResolvedValue({ brands: [] });
    renderBrands();
    const link = await screen.findByRole("link", { name: "تصفّح المنتجات" });
    expect(link).toHaveAttribute("href", "/products");
  });
});
