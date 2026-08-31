import { Tables } from "@/integrations/supabase/types";
import type { MarketplacePublicProduct } from "@/lib/marketplace-product-detail.types";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { trackGrowthHookEvent } from "@/lib/growth-hooks";

type Product = Tables<"products">;

/** Cart lines may hold full DB-shaped products or public marketplace payloads (omit internal cost fields). */
export type CartLineProduct = Product | MarketplacePublicProduct;

export interface CartItem {
  product: CartLineProduct;
  quantity: number;
}

export interface Coupon {
  id: string;
  code: string;
  type: "fixed" | "percentage";
  value: number;
}

type CartIntegrityState = {
  items: CartItem[];
  activeMerchantId: string | null;
  coupon: Coupon | null;
};

function getMerchantId(product: CartLineProduct): string | null {
  return product.merchant_id ?? null;
}

function sanitizeCartState(state: CartIntegrityState) {
  if (state.items.length === 0) {
    return { ...state, activeMerchantId: null, coupon: null, hadInvalidMix: false };
  }

  const baseMerchantId = state.activeMerchantId ?? getMerchantId(state.items[0].product);
  if (!baseMerchantId) {
    return { items: [], activeMerchantId: null, coupon: null, hadInvalidMix: true };
  }

  const consistentItems = state.items.filter((item) => getMerchantId(item.product) === baseMerchantId);
  const hadInvalidMix = consistentItems.length !== state.items.length;

  return {
    items: consistentItems,
    activeMerchantId: consistentItems.length > 0 ? baseMerchantId : null,
    coupon: consistentItems.length > 0 ? state.coupon : null,
    hadInvalidMix,
  };
}

export type AddItemResult =
  | { success: true }
  | { success: false; reason: "DIFFERENT_MERCHANT" | "INVALID_PRODUCT" };

interface CartStore {
  activeMerchantId: string | null;
  items: CartItem[];
  coupon: Coupon | null;
  addItem: (product: CartLineProduct, quantity?: number) => AddItemResult;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  applyCoupon: (coupon: Coupon) => void;
  removeCoupon: () => void;
  ensureIntegrity: (notify?: boolean) => { valid: boolean; merchantId: string | null };
  replaceCartWithReorder: (items: Array<{ product: CartLineProduct; quantity: number }>, merchantId: string) => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      activeMerchantId: null,
      items: [],
      coupon: null,
      addItem: (product, quantity = 1) => {
        const incomingMerchantId = getMerchantId(product);
        const activeMerchantId = get().activeMerchantId;

        if (!incomingMerchantId) {
          toast.error("هذا المنتج غير مرتبط بمتجر صالح حالياً.");
          return { success: false, reason: "INVALID_PRODUCT" } as const;
        }

        if (activeMerchantId && activeMerchantId !== incomingMerchantId) {
          return { success: false, reason: "DIFFERENT_MERCHANT" } as const;
        }

        const addQty = Math.max(1, Math.floor(quantity || 1));

        set((state) => {
          const existing = state.items.find((i) => i.product.id === product.id);
          if (existing) {
            return {
              items: state.items.map((i) => (i.product.id === product.id ? { ...i, quantity: i.quantity + addQty } : i)),
            };
          }
          return {
            items: [...state.items, { product, quantity: addQty }],
            activeMerchantId: state.activeMerchantId || incomingMerchantId,
          };
        });
        trackGrowthHookEvent("cart.added", {
          productId: product.id,
          merchantId: incomingMerchantId,
          sourceSurface: "cart_store",
        });
        return { success: true } as const;
      },
      removeItem: (productId) => {
        set((state) => {
          const nextItems = state.items.filter((i) => i.product.id !== productId);
          const sanitized = sanitizeCartState({
            items: nextItems,
            activeMerchantId: state.activeMerchantId,
            coupon: state.coupon,
          });
          return {
            items: sanitized.items,
            activeMerchantId: sanitized.activeMerchantId,
            coupon: sanitized.coupon,
          };
        });
      },
      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }

        set((state) => {
          const nextState = {
            items: state.items.map((i) => (i.product.id === productId ? { ...i, quantity } : i)),
            activeMerchantId: state.activeMerchantId,
            coupon: state.coupon,
          };
          const sanitized = sanitizeCartState(nextState);
          return {
            items: sanitized.items,
            activeMerchantId: sanitized.activeMerchantId,
            coupon: sanitized.coupon,
          };
        });
      },
      clearCart: () => set({ items: [], coupon: null, activeMerchantId: null }),
      applyCoupon: (coupon) => set({ coupon }),
      removeCoupon: () => set({ coupon: null }),
      ensureIntegrity: (notify = true) => {
        const state = get();
        const sanitized = sanitizeCartState({
          items: state.items,
          activeMerchantId: state.activeMerchantId,
          coupon: state.coupon,
        });

        if (sanitized.hadInvalidMix) {
          set({
            items: sanitized.items,
            activeMerchantId: sanitized.activeMerchantId,
            coupon: sanitized.coupon,
          });
          if (notify) {
            toast.error("تم تنظيف السلة لأن بعض المنتجات كانت من متجر مختلف.");
          }
          return { valid: false, merchantId: sanitized.activeMerchantId };
        }

        if (
          sanitized.activeMerchantId !== state.activeMerchantId ||
          sanitized.items.length !== state.items.length ||
          sanitized.coupon !== state.coupon
        ) {
          set({
            items: sanitized.items,
            activeMerchantId: sanitized.activeMerchantId,
            coupon: sanitized.coupon,
          });
        }

        return { valid: true, merchantId: sanitized.activeMerchantId };
      },
      replaceCartWithReorder: (items, merchantId) => {
        const sanitized = sanitizeCartState({
          items,
          activeMerchantId: merchantId,
          coupon: null,
        });
        set({
          items: sanitized.items,
          activeMerchantId: sanitized.activeMerchantId,
          coupon: null,
        });
      },
      getSubtotal: () =>
        get().items.reduce((total, item) => {
          const price = item.product.discount_price ?? item.product.price;
          return total + price * item.quantity;
        }, 0),
      getDiscountAmount: () => {
        const subtotal = get().getSubtotal();
        const coupon = get().coupon;
        if (!coupon) return 0;
        return coupon.type === "percentage" ? (subtotal * coupon.value) / 100 : coupon.value;
      },
      getTotal: () => {
        const subtotal = get().getSubtotal();
        const discount = get().getDiscountAmount();
        return Math.max(0, subtotal - discount);
      },
      getItemCount: () => get().items.reduce((count, item) => count + item.quantity, 0),
    }),
    {
      name: "DilMart-store-cart-storage",
      version: 3,
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as Partial<CartStore>;
        const rawItems = state.items ?? [];
        const inferredMerchantId = rawItems.length > 0 ? getMerchantId(rawItems[0].product) : null;

        const sanitized = sanitizeCartState({
          items: rawItems,
          coupon: state.coupon ?? null,
          activeMerchantId: state.activeMerchantId ?? inferredMerchantId ?? null,
        });

        return {
          ...state,
          items: sanitized.items,
          coupon: sanitized.coupon,
          activeMerchantId: sanitized.activeMerchantId,
        } as CartStore;
      },
    },
  ),
);
