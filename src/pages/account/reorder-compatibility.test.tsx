import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Cart from "@/pages/Cart";
import { useCartStore } from "@/lib/cart-store";

vi.mock("@/components/Header", () => ({ default: () => <header>Header</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>Footer</footer> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));

import { formatPrice } from "@/lib/format";

describe("Reorder Cart-Line Compatibility & No Slug Hardening", () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [],
      merchantId: null,
    });
  });

  it("renders cart item safely when product has NO slug and NO images without generating /product/undefined", () => {
    // Reorder-created minimal cart line
    useCartStore.setState({
      items: [
        {
          quantity: 2,
          product: {
            id: "reorder-prod-no-slug",
            name: "منتج معاد طلبه بدون رابط مباشر",
            price: 45000,
            discount_price: null,
            merchant_id: "m-123",
            images: [],
            // Note: slug is explicitly undefined/missing
          } as any,
        },
      ],
      merchantId: "m-123",
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/cart"]}>
        <Cart />
      </MemoryRouter>
    );

    expect(screen.getByText("منتج معاد طلبه بدون رابط مباشر")).toBeInTheDocument();
    expect(screen.getByText(formatPrice(45000))).toBeInTheDocument();

    // Verify NO href to "/product/undefined" exists anywhere in the DOM
    const links = container.querySelectorAll("a");
    links.forEach((link) => {
      expect(link.getAttribute("href")).not.toContain("undefined");
      expect(link.getAttribute("href")).not.toBe("/product/undefined");
    });
  });
});
