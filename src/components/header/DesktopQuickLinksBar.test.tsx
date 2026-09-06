import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import DesktopQuickLinksBar from "./DesktopQuickLinksBar";

const listDesktopQuickLinks = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    listDesktopQuickLinks: (...args: unknown[]) => listDesktopQuickLinks(...args),
  },
}));

afterEach(() => {
  cleanup();
  listDesktopQuickLinks.mockReset();
});

function renderBar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DesktopQuickLinksBar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DesktopQuickLinksBar — never blindly routes an unsafe href (internal-only policy)", () => {
  it("renders a valid internal href as a real router link", async () => {
    listDesktopQuickLinks.mockResolvedValue([
      { id: "1", label: "العروض", href: "/offers", sort_order: 1 },
    ]);
    renderBar();
    const link = await screen.findByRole("link", { name: "العروض" });
    expect(link).toHaveAttribute("href", "/offers");
  });

  it("does NOT render an external https href as clickable — policy is internal-only", async () => {
    listDesktopQuickLinks.mockResolvedValue([
      { id: "1", label: "شريك خارجي", href: "https://partner.example.com/promo", sort_order: 1 },
    ]);
    renderBar();
    await screen.findByText("شريك خارجي");
    expect(screen.queryByRole("link", { name: "شريك خارجي" })).not.toBeInTheDocument();
  });

  it("does NOT render a javascript: href as clickable navigation", async () => {
    listDesktopQuickLinks.mockResolvedValue([
      { id: "1", label: "رابط خطير", href: "javascript:alert(document.cookie)", sort_order: 1 },
    ]);
    renderBar();
    await screen.findByText("رابط خطير");
    expect(screen.queryByRole("link", { name: "رابط خطير" })).not.toBeInTheDocument();
    // No element anywhere carries the raw payload as an href attribute.
    const anchors = document.querySelectorAll("a[href]");
    anchors.forEach((a) => expect(a.getAttribute("href")).not.toMatch(/^javascript:/i));
  });

  it("does NOT render a data:/vbscript:/protocol-relative href as clickable navigation", async () => {
    listDesktopQuickLinks.mockResolvedValue([
      { id: "1", label: "أ", href: "data:text/html,<script>1</script>", sort_order: 1 },
      { id: "2", label: "ب", href: "vbscript:msgbox(1)", sort_order: 2 },
      { id: "3", label: "ج", href: "//evil.com", sort_order: 3 },
    ]);
    renderBar();
    await screen.findByText("أ");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("mixed valid + invalid: valid links stay clickable, invalid stays inert, both labels render", async () => {
    listDesktopQuickLinks.mockResolvedValue([
      { id: "1", label: "آمن", href: "/products?sort=newest", sort_order: 1 },
      { id: "2", label: "خطير", href: "javascript:alert(1)", sort_order: 2 },
    ]);
    renderBar();
    const safeLink = await screen.findByRole("link", { name: "آمن" });
    expect(safeLink).toHaveAttribute("href", "/products?sort=newest");
    expect(screen.getByText("خطير")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "خطير" })).not.toBeInTheDocument();
  });

  it("renders nothing when there are no links", () => {
    listDesktopQuickLinks.mockResolvedValue([]);
    const { container } = renderBar();
    expect(container.firstChild).toBeNull();
  });
});

describe("DesktopQuickLinksBar — API authority & unchanged href rendering (Boundary A)", () => {
  it("renders valid API-provided internal href unchanged without client-side rewriting", async () => {
    listDesktopQuickLinks.mockResolvedValue([
      { id: "1", label: "العناية الرجالية", href: "/products?search=%D8%AD%D9%84%D8%A7%D9%82%D8%A9", sort_order: 1 },
      { id: "2", label: "أدوات الصالونات النسائية", href: "/products?search=%D8%B5%D8%A7%D9%84%D9%88%D9%86%D8%A7%D8%AA%20%D9%86%D8%B3%D8%A7%D8%A6%D9%8A%D8%A9", sort_order: 2 },
    ]);
    renderBar();

    const link1 = await screen.findByRole("link", { name: "العناية الرجالية" });
    expect(link1).toHaveAttribute("href", "/products?search=%D8%AD%D9%84%D8%A7%D9%82%D8%A9");

    const link2 = await screen.findByRole("link", { name: "أدوات الصالونات النسائية" });
    expect(link2).toHaveAttribute("href", "/products?search=%D8%B5%D8%A7%D9%84%D9%88%D9%86%D8%A7%D8%AA%20%D9%86%D8%B3%D8%A7%D8%A6%D9%8A%D8%A9");
  });

  it("does not alter the destination href when the Arabic label is modified", async () => {
    listDesktopQuickLinks.mockResolvedValue([
      { id: "1", label: "تسمية معدلة من الأدمن", href: "/products?category=beauty-personal-care", sort_order: 1 },
    ]);
    renderBar();

    const link = await screen.findByRole("link", { name: "تسمية معدلة من الأدمن" });
    expect(link).toHaveAttribute("href", "/products?category=beauty-personal-care");
  });
});
