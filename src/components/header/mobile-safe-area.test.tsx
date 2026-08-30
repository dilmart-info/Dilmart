import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MobileTopPromoBlock from "@/components/header/MobileTopPromoBlock";
import DesktopHeader from "@/components/header/DesktopHeader";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMarketplaceHome: vi.fn().mockResolvedValue({ offerProducts: [] }),
    getMarketplaceCategories: vi.fn().mockResolvedValue([]),
  },
}));

const SAFE_AREA_CLASS = "mobile-safe-area-top";

function renderWithProviders(ui: React.ReactElement, route = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderPromoBlock(route = "/") {
  return renderWithProviders(
    <MobileTopPromoBlock searchQuery="" setSearchQuery={() => {}} onSearch={() => {}} />,
    route,
  );
}

describe("mobile header safe area", () => {
  it("reserves the top safe area exactly once, on the block that owns the header background", () => {
    const { container } = renderPromoBlock();

    const withSafeArea = container.querySelectorAll(`.${SAFE_AREA_CLASS}`);
    expect(withSafeArea).toHaveLength(1);

    const block = container.querySelector('[data-testid="mobile-top-promo-block"]');
    expect(block).not.toBeNull();
    expect(block).toHaveClass(SAFE_AREA_CLASS);
  });

  it("keeps the search bar inside the safe-area container instead of padding it directly", () => {
    const { container } = renderPromoBlock();

    const block = container.querySelector(`.${SAFE_AREA_CLASS}`) as HTMLElement;
    const searchInput = container.querySelector("input");

    expect(searchInput).not.toBeNull();
    expect(block.contains(searchInput as Node)).toBe(true);
    expect(searchInput?.className).not.toContain(SAFE_AREA_CLASS);
    expect(searchInput?.closest("form")?.className ?? "").not.toContain(SAFE_AREA_CLASS);
  });

  it("does not depend on a hardcoded status bar height", () => {
    const { container } = renderPromoBlock();
    const block = container.querySelector(`.${SAFE_AREA_CLASS}`) as HTMLElement;

    // The inset must come from the .mobile-safe-area-top rule, never from an inline
    // pixel value baked into the component.
    expect(block.style.paddingTop).toBe("");
  });

  it("keeps the safe area on non-home routes, where the promo rows are not rendered", () => {
    const { container } = renderPromoBlock("/products");

    expect(container.querySelectorAll(`.${SAFE_AREA_CLASS}`)).toHaveLength(1);
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("survives compact mode, because the inset lives outside the collapsing rows", () => {
    const { container } = renderPromoBlock();
    const block = container.querySelector(`.${SAFE_AREA_CLASS}`) as HTMLElement;

    const collapsibles = container.querySelectorAll(".overflow-hidden.transition-all");
    expect(collapsibles.length).toBeGreaterThan(0);
    for (const row of Array.from(collapsibles)) {
      expect(row).not.toHaveClass(SAFE_AREA_CLASS);
      expect(block.contains(row)).toBe(true);
    }
  });

  it("leaves the desktop header untouched", () => {
    const { container } = renderWithProviders(
      <DesktopHeader categories={[]} searchQuery="" setSearchQuery={() => {}} onSearch={() => {}} />,
    );

    expect(container.querySelectorAll(`.${SAFE_AREA_CLASS}`)).toHaveLength(0);
  });
});
