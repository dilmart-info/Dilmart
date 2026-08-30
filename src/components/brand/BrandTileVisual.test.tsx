import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import BrandTileVisual from "./BrandTileVisual";

vi.mock("@/lib/brand-logo-registry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/brand-logo-registry")>("@/lib/brand-logo-registry");
  return {
    ...actual,
    getBrandLogo: vi.fn((name: string) => {
      if (name === "Registered Brand") return { logoUrl: "/fake-logo.png" };
      if (name === "Scaled Brand") return { logoUrl: "/fake-logo.png", logoScale: 0.8 };
      return null;
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BrandTileVisual", () => {
  it("shows the brand name as text when no logo is registered", () => {
    render(<BrandTileVisual brand={{ name: "Gavaro", count: 38, imageUrl: null }} />);
    expect(screen.getByText("Gavaro")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /شعار/ })).not.toBeInTheDocument();
  });

  it("renders the registered logo image with the required alt text", () => {
    render(<BrandTileVisual brand={{ name: "Registered Brand", count: 1, imageUrl: null }} />);
    const img = screen.getByAltText("شعار Registered Brand");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/fake-logo.png");
    // Name text must not also render — one visual identity per pill.
    expect(screen.queryByText("Registered Brand")).not.toBeInTheDocument();
  });

  it("falls back to text when the logo image fails to load (no broken-image icon, no fake initials)", () => {
    render(<BrandTileVisual brand={{ name: "Registered Brand", count: 1, imageUrl: null }} />);
    const img = screen.getByAltText("شعار Registered Brand");
    fireEvent.error(img);
    expect(screen.queryByAltText("شعار Registered Brand")).not.toBeInTheDocument();
    expect(screen.getByText("Registered Brand")).toBeInTheDocument();
  });

  it("uses object-contain (never cover) for the logo image", () => {
    render(<BrandTileVisual brand={{ name: "Registered Brand", count: 1, imageUrl: null }} />);
    const img = screen.getByAltText("شعار Registered Brand");
    expect(img.className).toContain("object-contain");
    expect(img.className).not.toContain("object-cover");
  });

  it("applies a clamped logoScale to the logo safe area without exceeding the base ceiling", () => {
    render(<BrandTileVisual brand={{ name: "Scaled Brand", count: 1, imageUrl: null }} />);
    const img = screen.getByAltText("شعار Scaled Brand");
    const maxHeight = Number.parseFloat(img.style.maxHeight);
    expect(maxHeight).toBeLessThan(19);
    expect(maxHeight).toBeGreaterThan(0);
  });

  it("renders O'me'do's apostrophes verbatim in the text fallback and its aria-label", () => {
    render(<BrandTileVisual brand={{ name: "O'me'do", count: 3, imageUrl: null }} />);
    expect(screen.getByText("O'me'do")).toBeInTheDocument();
    const logoImg = screen.queryByRole("img", { name: /شعار O'me'do/ });
    expect(logoImg).not.toBeInTheDocument();
  });

  it("renders the representative product image with decorative alt (unchanged design)", () => {
    const { container } = render(
      <BrandTileVisual brand={{ name: "Gavaro", count: 38, imageUrl: "https://example.com/gavaro.jpg" }} />,
    );
    const productImg = container.querySelector('img[src="https://example.com/gavaro.jpg"]');
    expect(productImg).not.toBeNull();
    expect(productImg).toHaveAttribute("alt", "");
    expect(productImg).toHaveAttribute("aria-hidden", "true");
  });
});
