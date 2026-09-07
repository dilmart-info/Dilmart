import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MobileTopPromoBlock from "@/components/header/MobileTopPromoBlock";
import Header from "@/components/Header";
import { storeConfig } from "@/config/store";
import { DILMART_APP_ICON } from "@/components/BrandMark";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMarketplaceHome: vi.fn().mockResolvedValue({ offerProducts: [] }),
    getMarketplaceCategories: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/stores/cartStore", () => ({
  useCartStore: (selector: (state: { getItemCount: () => number }) => unknown) => {
    const state = {
      getItemCount: () => 0,
    };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

function renderPromoBlock(props: {
  searchQuery?: string;
  setSearchQuery?: (val: string) => void;
  onSearch?: (e: React.FormEvent) => void;
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <MobileTopPromoBlock
          searchQuery={props.searchQuery ?? ""}
          setSearchQuery={props.setSearchQuery ?? vi.fn()}
          onSearch={props.onSearch ?? vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderFullHeader(route = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Header />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MobileTopPromoBlock — Visual Cleanup & Layout Rebalance (Task 005)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render 'توصيل سريع وموثوق' or any delivery promotion pill", () => {
    const { container } = renderPromoBlock();
    const block = screen.getByTestId("mobile-top-promo-block");

    // Must not contain the delivery pill text
    expect(within(block).queryByText("توصيل سريع وموثوق")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("توصيل سريع وموثوق");

    // Must not contain lucide truck icon (which has class 'lucide-truck')
    const truckIcon = container.querySelector(".lucide-truck");
    expect(truckIcon).toBeNull();
  });

  it("renders exactly one DilMart logo within the MobileTopPromoBlock component", () => {
    renderPromoBlock();
    const block = screen.getByTestId("mobile-top-promo-block");

    // Scoped strictly within MobileTopPromoBlock
    const logos = within(block).getAllByRole("img", { name: "ديلمارت" });
    expect(logos).toHaveLength(1);
    expect(logos[0]).toHaveAttribute("src", DILMART_APP_ICON);
  });

  it("renders the brand wordmark centered with storeConfig Arabic and English names", () => {
    renderPromoBlock();
    const block = screen.getByTestId("mobile-top-promo-block");

    expect(within(block).getByText(storeConfig.brand.ar)).toBeInTheDocument();
    expect(within(block).getByText(storeConfig.brand.en)).toBeInTheDocument();
  });

  it("renders the tracking link on the left pointing to '/track-order'", () => {
    renderPromoBlock();
    const block = screen.getByTestId("mobile-top-promo-block");

    const trackLink = within(block).getByRole("link", { name: "تتبع طلبك" });
    expect(trackLink).toBeInTheDocument();
    expect(trackLink).toHaveAttribute("href", "/track-order");
    expect(within(trackLink).getByText("تتبع")).toBeInTheDocument();
  });

  it("keeps the search form fully functional", () => {
    const onSearchMock = vi.fn((e: React.FormEvent) => e.preventDefault());
    const setSearchQueryMock = vi.fn();

    renderPromoBlock({
      searchQuery: "سماعات",
      setSearchQuery: setSearchQueryMock,
      onSearch: onSearchMock,
    });

    const block = screen.getByTestId("mobile-top-promo-block");
    const input = within(block).getByPlaceholderText("ابحث في ديلمارت...");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("سماعات");

    fireEvent.change(input, { target: { value: "ساعة" } });
    expect(setSearchQueryMock).toHaveBeenCalledWith("ساعة");

    const form = input.closest("form");
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
      expect(onSearchMock).toHaveBeenCalled();
    }
  });

  it("uses flexible min-h-9 layout to prevent vertical clipping on scaled text", () => {
    const { container } = renderPromoBlock();
    const topRow = container.querySelector(".min-h-9");
    expect(topRow).not.toBeNull();
    // Must not have a rigid h-9 constraint, but must have flexible min-h-9
    expect(topRow?.classList.contains("h-9")).toBe(false);
    expect(topRow?.classList.contains("min-h-9")).toBe(true);
  });

  describe("Integration via Full Header Component", () => {
    it("renders cleaned MobileTopPromoBlock on homepage '/' without delivery pill", () => {
      renderFullHeader("/");

      const mobileBlock = screen.getByTestId("mobile-top-promo-block");
      expect(mobileBlock).toBeInTheDocument();
      expect(within(mobileBlock).queryByText("توصيل سريع وموثوق")).not.toBeInTheDocument();

      // Scoped within the mobile header block, exactly one logo image renders
      const mobileLogos = within(mobileBlock).getAllByRole("img", { name: "ديلمارت" });
      expect(mobileLogos).toHaveLength(1);

      // Inner header and checkout header are not rendered
      expect(screen.queryByTestId("mobile-inner-header")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mobile-checkout-header")).not.toBeInTheDocument();
    });

    it("leaves mobile inner-page headers untouched on non-home routes", () => {
      renderFullHeader("/products");

      expect(screen.getByTestId("mobile-inner-header")).toBeInTheDocument();
      expect(screen.queryByTestId("mobile-top-promo-block")).not.toBeInTheDocument();
    });

    it("leaves desktop header intact and functioning", () => {
      const { container } = renderFullHeader("/");
      const desktopHeader = container.querySelector(".hidden.md\\:block");
      expect(desktopHeader).not.toBeNull();
    });
  });
});
