import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Products from "@/pages/Products";

function renderProductsPage(initialEntries = ["/products"]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Products />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Catalog & Search Results Page (Products.tsx)", () => {
  it("renders catalog header with breadcrumbs and title", async () => {
    renderProductsPage(["/products"]);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText("الرئيسية")).toBeInTheDocument();
  });

  it("reflects active search term in header title and context line", async () => {
    renderProductsPage(["/products?search=ساعة"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("نتائج البحث عن «ساعة»");
  });

  it("reflects category in breadcrumbs when category param is present", async () => {
    renderProductsPage(["/products?category=electronics"]);
    expect(screen.getByText("الرئيسية")).toBeInTheDocument();
    expect(screen.getAllByText("الأقسام").length).toBeGreaterThanOrEqual(1);
  });

  it("renders sort selector with supported contract values", async () => {
    renderProductsPage(["/products"]);
    expect(screen.getByText("الأحدث")).toBeInTheDocument();
  });
});
