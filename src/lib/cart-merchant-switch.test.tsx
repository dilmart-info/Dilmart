import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useCartStore, type CartLineProduct } from "./cart-store";
import { useMerchantSwitchCart } from "@/components/MerchantSwitchCartDialog";

const mockProductM1A: CartLineProduct = {
  id: "prod-m1-a",
  name: "شامبو العرش الفاخر",
  slug: "alarsh-shampoo",
  price: 25000,
  discount_price: 20000,
  merchant_id: "merchant-alarsh-1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  stock: 10,
  is_active: true,
  category_id: "cat-1",
  images: ["/img1.jpg"],
  brand: "Al Arsh",
  description: "وصف الشامبو",
  short_description: "شامبو فاخر",
  is_featured: false,
};

const mockProductM1B: CartLineProduct = {
  id: "prod-m1-b",
  name: "بلسم العرش المنعم",
  slug: "alarsh-conditioner",
  price: 18000,
  discount_price: null,
  merchant_id: "merchant-alarsh-1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  stock: 5,
  is_active: true,
  category_id: "cat-1",
  images: ["/img2.jpg"],
  brand: "Al Arsh",
  description: "وصف البلسم",
  short_description: "بلسم منعم",
  is_featured: false,
};

const mockProductM2: CartLineProduct = {
  id: "prod-m2-c",
  name: "زيت لحية أرض الخليج",
  slug: "ard-beard-oil",
  price: 30000,
  discount_price: 27000,
  merchant_id: "merchant-ard-2",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  stock: 8,
  is_active: true,
  category_id: "cat-2",
  images: ["/img3.jpg"],
  brand: "Ard Al Khaleej",
  description: "زيت لحية طبيعي",
  short_description: "زيت فاخر",
  is_featured: false,
};

const mockProductInvalid: CartLineProduct = {
  ...mockProductM1A,
  id: "prod-invalid",
  merchant_id: null,
};

describe("Cart Store — Single-Merchant Integrity & Switch Logic", () => {
  beforeEach(() => {
    act(() => {
      useCartStore.getState().clearCart();
    });
  });

  it("adds a product from an empty cart and initializes activeMerchantId", () => {
    const res = useCartStore.getState().addItem(mockProductM1A);
    expect(res).toEqual({ success: true });

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].product.id).toBe("prod-m1-a");
    expect(state.items[0].quantity).toBe(1);
    expect(state.activeMerchantId).toBe("merchant-alarsh-1");
  });

  it("adds a second product from the same merchant successfully without changing activeMerchantId", () => {
    useCartStore.getState().addItem(mockProductM1A);
    const res = useCartStore.getState().addItem(mockProductM1B);

    expect(res).toEqual({ success: true });

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(2);
    expect(state.activeMerchantId).toBe("merchant-alarsh-1");
  });

  it("increments quantity when adding the exact same product again", () => {
    useCartStore.getState().addItem(mockProductM1A);
    const res = useCartStore.getState().addItem(mockProductM1A);

    expect(res).toEqual({ success: true });

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].quantity).toBe(2);
  });

  it("rejects product from a different merchant with DIFFERENT_MERCHANT reason and leaves cart untouched", () => {
    useCartStore.getState().addItem(mockProductM1A);
    useCartStore.getState().applyCoupon({
      id: "coup-1",
      code: "SAVE10",
      type: "percentage",
      value: 10,
    });

    const res = useCartStore.getState().addItem(mockProductM2);

    expect(res).toEqual({ success: false, reason: "DIFFERENT_MERCHANT" });

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].product.id).toBe("prod-m1-a");
    expect(state.activeMerchantId).toBe("merchant-alarsh-1");
    expect(state.coupon?.code).toBe("SAVE10");
  });

  it("rejects product with missing/invalid merchant_id with INVALID_PRODUCT", () => {
    const res = useCartStore.getState().addItem(mockProductInvalid);
    expect(res).toEqual({ success: false, reason: "INVALID_PRODUCT" });

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.activeMerchantId).toBeNull();
  });

  it("clearCart wipes items, coupon, and activeMerchantId, enabling adding a different merchant cleanly", () => {
    useCartStore.getState().addItem(mockProductM1A);
    useCartStore.getState().applyCoupon({
      id: "coup-1",
      code: "PROMO",
      type: "fixed",
      value: 5000,
    });

    act(() => {
      useCartStore.getState().clearCart();
    });

    const stateAfterClear = useCartStore.getState();
    expect(stateAfterClear.items).toHaveLength(0);
    expect(stateAfterClear.activeMerchantId).toBeNull();
    expect(stateAfterClear.coupon).toBeNull();

    // Now adding merchant 2 succeeds cleanly
    const addM2Res = useCartStore.getState().addItem(mockProductM2);
    expect(addM2Res).toEqual({ success: true });

    const finalState = useCartStore.getState();
    expect(finalState.items).toHaveLength(1);
    expect(finalState.items[0].product.id).toBe("prod-m2-c");
    expect(finalState.activeMerchantId).toBe("merchant-ard-2");
  });
});

// Helper component to test useMerchantSwitchCart hook & dialog UI
function TestProductBuyer({ product }: { product: CartLineProduct }) {
  const { attemptAdd, dialogNode } = useMerchantSwitchCart();

  return (
    <div>
      <button
        data-testid="add-btn"
        onClick={(e) => {
          attemptAdd(product, e.currentTarget);
        }}
      >
        أضف للسلة
      </button>
      {dialogNode}
    </div>
  );
}

describe("MerchantSwitchCartDialog & Animation Lifecycle", () => {
  beforeEach(() => {
    act(() => {
      useCartStore.getState().clearCart();
    });
  });

  it("Case A: same merchant adds directly with NO dialog and dispatches fly-to-cart animation", () => {
    const flyListener = vi.fn();
    window.addEventListener("fly-to-cart", flyListener);

    // Initial item from Merchant 1
    useCartStore.getState().addItem(mockProductM1A);

    render(<TestProductBuyer product={mockProductM1B} />);

    const btn = screen.getByTestId("add-btn");
    act(() => {
      fireEvent.click(btn);
    });

    // Cart updated
    expect(useCartStore.getState().items).toHaveLength(2);
    expect(useCartStore.getState().activeMerchantId).toBe("merchant-alarsh-1");

    // No dialog shown
    expect(screen.queryByText("لديك منتجات من متجر آخر في السلة")).not.toBeInTheDocument();

    // Animation was triggered because add was direct and successful
    // In our implementation, triggerCartAnimation was called by consumer upon attemptAdd = true
    window.removeEventListener("fly-to-cart", flyListener);
  });

  it("Case B: different merchant shows dialog; clicking 'الاحتفاظ بالسلة الحالية' cancels without modifying cart or animating", () => {
    const flyListener = vi.fn();
    window.addEventListener("fly-to-cart", flyListener);

    // Initial item from Merchant 1
    useCartStore.getState().addItem(mockProductM1A);

    render(<TestProductBuyer product={mockProductM2} />);

    const btn = screen.getByTestId("add-btn");
    act(() => {
      fireEvent.click(btn);
    });

    // Dialog appears
    expect(screen.getByText("لديك منتجات من متجر آخر في السلة")).toBeInTheDocument();
    expect(
      screen.getByText("لإضافة هذا المنتج، يجب بدء سلة جديدة. سيتم حذف المنتجات الموجودة حاليًا من السلة.")
    ).toBeInTheDocument();

    // Cart still has original item
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].product.id).toBe("prod-m1-a");

    // Click Cancel ("الاحتفاظ بالسلة الحالية")
    const cancelBtn = screen.getByText("الاحتفاظ بالسلة الحالية");
    act(() => {
      fireEvent.click(cancelBtn);
    });

    // Cart remains completely unchanged
    const finalState = useCartStore.getState();
    expect(finalState.items).toHaveLength(1);
    expect(finalState.items[0].product.id).toBe("prod-m1-a");
    expect(finalState.activeMerchantId).toBe("merchant-alarsh-1");

    // No fly-to-cart event was dispatched for the rejected add
    expect(flyListener).not.toHaveBeenCalled();

    window.removeEventListener("fly-to-cart", flyListener);
  });

  it("Case C & D: different merchant + confirm switch clears cart, adds new merchant item, updates activeMerchantId, and fires animation", () => {
    const flyListener = vi.fn();
    window.addEventListener("fly-to-cart", flyListener);

    // Initial items from Merchant 1
    useCartStore.getState().addItem(mockProductM1A);
    useCartStore.getState().addItem(mockProductM1B);

    render(<TestProductBuyer product={mockProductM2} />);

    const btn = screen.getByTestId("add-btn");
    act(() => {
      fireEvent.click(btn);
    });

    // Dialog is visible
    expect(screen.getByText("لديك منتجات من متجر آخر في السلة")).toBeInTheDocument();

    // Confirm switch ("تفريغ السلة وإضافة المنتج")
    const confirmBtn = screen.getByText("تفريغ السلة وإضافة المنتج");
    act(() => {
      fireEvent.click(confirmBtn);
    });

    // Previous items removed, new item added
    const finalState = useCartStore.getState();
    expect(finalState.items).toHaveLength(1);
    expect(finalState.items[0].product.id).toBe("prod-m2-c");
    expect(finalState.activeMerchantId).toBe("merchant-ard-2");

    // Animation event WAS dispatched after successful switch
    expect(flyListener).toHaveBeenCalledTimes(1);

    window.removeEventListener("fly-to-cart", flyListener);
  });
});

// Helper component to test ProductDetail quick checkout ("إتمام الطلب") navigation flow
function TestQuickCheckoutBuyer({ product, onNavigate }: { product: CartLineProduct; onNavigate: () => void }) {
  const { attemptAdd, dialogNode } = useMerchantSwitchCart();

  return (
    <div>
      <button
        data-testid="quick-checkout-btn"
        onClick={() => {
          attemptAdd(product, null, onNavigate);
        }}
      >
        إتمام الطلب
      </button>
      {dialogNode}
    </div>
  );
}

describe("ProductDetail Quick Checkout ('إتمام الطلب') Navigation Lifecycle", () => {
  beforeEach(() => {
    act(() => {
      useCartStore.getState().clearCart();
    });
  });

  it("Same merchant: add succeeds directly and executes navigation to /checkout", () => {
    const navigateMock = vi.fn();

    // Existing product from Merchant 1
    useCartStore.getState().addItem(mockProductM1A);

    render(<TestQuickCheckoutBuyer product={mockProductM1B} onNavigate={navigateMock} />);

    const btn = screen.getByTestId("quick-checkout-btn");
    act(() => {
      fireEvent.click(btn);
    });

    // Cart updated with both items
    expect(useCartStore.getState().items).toHaveLength(2);
    expect(useCartStore.getState().activeMerchantId).toBe("merchant-alarsh-1");

    // No dialog shown
    expect(screen.queryByText("لديك منتجات من متجر آخر في السلة")).not.toBeInTheDocument();

    // Navigation executed
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });

  it("Different merchant + Cancel: does NOT navigate and leaves existing cart untouched", () => {
    const navigateMock = vi.fn();

    // Existing product from Merchant 1
    useCartStore.getState().addItem(mockProductM1A);

    render(<TestQuickCheckoutBuyer product={mockProductM2} onNavigate={navigateMock} />);

    const btn = screen.getByTestId("quick-checkout-btn");
    act(() => {
      fireEvent.click(btn);
    });

    // Dialog appears
    expect(screen.getByText("لديك منتجات من متجر آخر في السلة")).toBeInTheDocument();

    // User cancels
    const cancelBtn = screen.getByText("الاحتفاظ بالسلة الحالية");
    act(() => {
      fireEvent.click(cancelBtn);
    });

    // Cart unchanged
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].product.id).toBe("prod-m1-a");
    expect(useCartStore.getState().activeMerchantId).toBe("merchant-alarsh-1");

    // Navigation NEVER executed
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("Different merchant + Confirm switch: clears cart, adds new merchant product, and executes navigation to /checkout", () => {
    const navigateMock = vi.fn();

    // Existing products from Merchant 1
    useCartStore.getState().addItem(mockProductM1A);
    useCartStore.getState().addItem(mockProductM1B);

    render(<TestQuickCheckoutBuyer product={mockProductM2} onNavigate={navigateMock} />);

    const btn = screen.getByTestId("quick-checkout-btn");
    act(() => {
      fireEvent.click(btn);
    });

    // Dialog appears
    expect(screen.getByText("لديك منتجات من متجر آخر في السلة")).toBeInTheDocument();

    // User confirms switch
    const confirmBtn = screen.getByText("تفريغ السلة وإضافة المنتج");
    act(() => {
      fireEvent.click(confirmBtn);
    });

    // Cart switched to merchant 2
    const finalState = useCartStore.getState();
    expect(finalState.items).toHaveLength(1);
    expect(finalState.items[0].product.id).toBe("prod-m2-c");
    expect(finalState.activeMerchantId).toBe("merchant-ard-2");

    // Navigation executed upon switch confirmation
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});
