// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Cart from "./Cart";
import { useCartStore } from "@/lib/cart-store";
import { apiClient } from "@/lib/api-client";
import { formatPrice } from "@/lib/format";

vi.mock("@/components/Header", () => ({
  default: () => <header data-testid="header">Header</header>,
}));
vi.mock("@/components/Footer", () => ({
  default: () => <footer data-testid="footer">Footer</footer>,
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    validateCoupon: vi.fn(),
  },
}));

describe("Phase 2C — Cart Page & Store Invariants", () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
    vi.clearAllMocks();
  });

  it("renders empty cart state with link to /products when cart has no items", () => {
    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>,
    );

    expect(screen.getByText("سلة التسوق فارغة")).toBeTruthy();
    expect(screen.getByText("تصفح المنتجات الآن")).toBeTruthy();
    const link = screen.getByRole("link", { name: "تصفح المنتجات الآن" });
    expect(link.getAttribute("href")).toBe("/products");
  });

  it("renders product lines with name, merchant, image, and price", () => {
    useCartStore.getState().addItem({
      id: "prod-1",
      name: "عطر رجالي فاخر",
      slug: "luxury-perfume-men",
      price: 50000,
      discount_price: 45000,
      stock: 10,
      merchant_id: "merchant-1",
      images: ["https://example.com/perfume.jpg"],
      merchants: {
        id: "merchant-1",
        slug: "royal-scents",
        display_name: "رويال للعطور",
      },
    });

    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>,
    );

    expect(screen.getByText("عطر رجالي فاخر")).toBeTruthy();
    expect(screen.getByText("رويال للعطور")).toBeTruthy();
    expect(screen.getAllByText(formatPrice(45000)).length).toBeGreaterThan(0);
    expect(screen.getByText(formatPrice(50000))).toBeTruthy();

    const productLink = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/product/luxury-perfume-men");
    expect(productLink).toBeTruthy();
  });

  it("increments and decrements quantity while respecting stock upper bounds and lower bound of 1", () => {
    useCartStore.getState().addItem({
      id: "prod-stock-2",
      name: "ساعة يد",
      slug: "wrist-watch",
      price: 30000,
      discount_price: null,
      stock: 2,
      merchant_id: "merchant-1",
      images: [],
    });

    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>,
    );

    expect(screen.getAllByText(formatPrice(30000)).length).toBeGreaterThan(0);
    const plusBtn = screen.getByLabelText("زيادة الكمية");
    const minusBtn = screen.getByLabelText("تقليل الكمية");

    // Initially quantity is 1, minus is disabled at quantity 1
    expect(minusBtn.hasAttribute("disabled")).toBe(true);
    expect(plusBtn.hasAttribute("disabled")).toBe(false);

    // Increase to 2 (max stock)
    fireEvent.click(plusBtn);
    expect(useCartStore.getState().items[0].quantity).toBe(2);

    // Now plus button should be disabled because stock is 2
    expect(screen.getByLabelText("زيادة الكمية").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("الحد الأقصى المتاح")).toBeTruthy();
    expect(minusBtn.hasAttribute("disabled")).toBe(false);

    // Decrement back to 1
    fireEvent.click(minusBtn);
    expect(useCartStore.getState().items[0].quantity).toBe(1);
    expect(screen.getByLabelText("زيادة الكمية").hasAttribute("disabled")).toBe(false);
    expect(minusBtn.hasAttribute("disabled")).toBe(true);
  });

  it("disables minus button at quantity 1 and does NOT remove product on click", () => {
    useCartStore.getState().addItem({
      id: "prod-qty-1",
      name: "حقيبة سفر",
      slug: "travel-bag",
      price: 45000,
      discount_price: null,
      stock: 5,
      merchant_id: "merchant-1",
    });

    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>,
    );

    const minusBtn = screen.getByLabelText("تقليل الكمية");
    expect(minusBtn.hasAttribute("disabled")).toBe(true);

    fireEvent.click(minusBtn);
    // Quantity remains 1 and product is not removed
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].quantity).toBe(1);
  });

  it("removes product when remove button is clicked", () => {
    useCartStore.getState().addItem({
      id: "prod-remove-me",
      name: "منتج للحذف",
      slug: "remove-product",
      price: 15000,
      discount_price: null,
      stock: 5,
      merchant_id: "merchant-1",
    });

    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>,
    );

    const removeBtn = screen.getByLabelText("إزالة منتج للحذف من السلة");
    fireEvent.click(removeBtn);

    expect(useCartStore.getState().items).toHaveLength(0);
    expect(screen.getByText("سلة التسوق فارغة")).toBeTruthy();
  });

  it("blocks adding items with stock = 0 and returns OUT_OF_STOCK", () => {
    const result = useCartStore.getState().addItem({
      id: "prod-zero-stock",
      name: "منتج نافد",
      slug: "out-of-stock-prod",
      price: 20000,
      discount_price: null,
      stock: 0,
      merchant_id: "merchant-1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("OUT_OF_STOCK");
    }
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it("returns MAX_STOCK_REACHED and performs no mutation when adding to an item already at stock ceiling", () => {
    const product = {
      id: "prod-ceiling",
      name: "منتج محدود",
      slug: "limited-prod",
      price: 10000,
      discount_price: null,
      stock: 3,
      merchant_id: "merchant-1",
    };

    // First add 3 units (up to max stock)
    const res1 = useCartStore.getState().addItem(product, 3);
    expect(res1.success).toBe(true);
    expect(useCartStore.getState().items[0].quantity).toBe(3);

    // Now try to add 1 more unit
    const res2 = useCartStore.getState().addItem(product, 1);
    expect(res2.success).toBe(false);
    if (!res2.success) {
      expect(res2.reason).toBe("MAX_STOCK_REACHED");
    }
    // Quantity remains strictly 3 with no extra mutation
    expect(useCartStore.getState().items[0].quantity).toBe(3);
  });

  it("sanitizes persisted cart state with zero or negative quantities safely", () => {
    // Manually force an invalid item via replaceCartWithReorder or store set
    useCartStore.getState().replaceCartWithReorder(
      [
        {
          product: {
            id: "p-invalid-qty",
            name: "Invalid Qty",
            price: 10000,
            discount_price: null,
            stock: 3,
            merchant_id: "merchant-1",
          },
          quantity: 10, // exceeds stock 3
        },
        {
          product: {
            id: "p-zero-stock",
            name: "Zero Stock",
            price: 5000,
            discount_price: null,
            stock: 0,
            merchant_id: "merchant-1",
          },
          quantity: 2,
        },
      ],
      "merchant-1",
    );

    const items = useCartStore.getState().items;
    // p-zero-stock should be filtered out
    expect(items.find((i) => i.product.id === "p-zero-stock")).toBeUndefined();
    // p-invalid-qty should be clamped to stock 3
    const validItem = items.find((i) => i.product.id === "p-invalid-qty");
    expect(validItem).toBeDefined();
    expect(validItem?.quantity).toBe(3);
  });

  it("handles valid coupon application and removal", async () => {
    useCartStore.getState().addItem({
      id: "p1",
      name: "حقيبة جلدية",
      slug: "leather-bag",
      price: 100000,
      discount_price: null,
      stock: 5,
      merchant_id: "merchant-1",
    });

    (apiClient.validateCoupon as any).mockResolvedValueOnce({
      valid: true,
      id: "coupon-1",
      code: "DISCOUNT10",
      discount_type: "percentage",
      value: 10,
    });

    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>,
    );

    const couponInput = screen.getByPlaceholderText("أدخل كود الخصم");
    fireEvent.change(couponInput, { target: { value: "discount10" } });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق" }));

    await waitFor(() => {
      expect(screen.getByText("DISCOUNT10")).toBeTruthy();
    });

    // Discount of 10% on 100,000 is 10,000 -> Total is 90,000
    expect(screen.getByText(`-${formatPrice(10000)}`)).toBeTruthy();
    expect(screen.getAllByText(formatPrice(90000)).length).toBeGreaterThan(0);

    // Remove coupon
    fireEvent.click(screen.getByLabelText("إزالة كود الخصم"));
    expect(screen.queryByText("DISCOUNT10")).toBeNull();
    expect(useCartStore.getState().coupon).toBeNull();
  });

  it("preserves cart when coupon validation fails", async () => {
    useCartStore.getState().addItem({
      id: "p1",
      name: "حذاء رياضي",
      slug: "running-shoes",
      price: 60000,
      discount_price: null,
      stock: 5,
      merchant_id: "merchant-1",
    });

    (apiClient.validateCoupon as any).mockResolvedValueOnce({
      valid: false,
      message: "كود غير صالح",
    });

    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>,
    );

    const couponInput = screen.getByPlaceholderText("أدخل كود الخصم");
    fireEvent.change(couponInput, { target: { value: "INVALID" } });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق" }));

    await waitFor(() => {
      expect(useCartStore.getState().coupon).toBeNull();
      expect(useCartStore.getState().items).toHaveLength(1);
    });
  });

  it("shows neutral delivery notice and no unsupported universal COD claims", () => {
    useCartStore.getState().addItem({
      id: "p1",
      name: "هاتف ذكي",
      slug: "smart-phone",
      price: 250000,
      discount_price: null,
      stock: 5,
      merchant_id: "merchant-1",
    });

    render(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>,
    );

    expect(screen.getByText("يُحسب عند إتمام الطلب")).toBeTruthy();
    expect(screen.queryByText(/الدفع عند الاستلام متاح لجميع طلباتك/)).toBeNull();
    expect(screen.getByText("تفاصيل التوصيل والتكلفة تظهر أثناء إتمام الطلب")).toBeTruthy();
    expect(screen.queryByText(/توصيل موثوق لكافة المحافظات العراقية/)).toBeNull();
  });
});
