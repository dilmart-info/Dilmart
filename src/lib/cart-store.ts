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

export type AddItemResult =
  | { success: true }
  | {
      success: false;
      reason: "DIFFERENT_MERCHANT" | "INVALID_PRODUCT" | "OUT_OF_STOCK" | "MAX_STOCK_REACHED";
    };

function sanitizeCartState(state: CartIntegrityState) {
  if (state.items.length === 0) {
    return { ...state, activeMerchantId: null, coupon: null, hadInvalidMix: false };
  }

  const baseMerchantId = state.activeMerchantId ?? getMerchantId(state.items[0].product);
  if (!baseMerchantId) {
    return { items: [], activeMerchantId: null, coupon: null, hadInvalidMix: true };
  }

  const consistentItems: CartItem[] = [];
  let hadInvalidMix = false;

  for (const item of state.items) {
    if (getMerchantId(item.product) !== baseMerchantId) {
      hadInvalidMix = true;
      continue;
    }
    const knownStock =
      typeof item.product.stock === "number" && item.product.stock >= 0 ? item.product.stock : null;
    if (knownStock === 0) {
      hadInvalidMix = true;
      continue;
    }
    const rawQty = Math.floor(item.quantity || 0);
    if (rawQty <= 0) {
      hadInvalidMix = true;
      continue;
    }
    const validQty = knownStock !== null ? Math.min(knownStock, rawQty) : rawQty;
    if (validQty <= 0) {
      hadInvalidMix = true;
      continue;
    }
    if (validQty !== item.quantity) {
      hadInvalidMix = true;
    }
    consistentItems.push({
      product: item.product,
      quantity: validQty,
    });
  }

  return {
    items: consistentItems,
    activeMerchantId: consistentItems.length > 0 ? baseMerchantId : null,
    coupon: consistentItems.length > 0 ? state.coupon : null,
    hadInvalidMix: hadInvalidMix || consistentItems.length !== state.items.length,
  };
}

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

        const knownStock =
          typeof product.stock === "number" && product.stock >= 0 ? product.stock : null;
        if (knownStock === 0) {
          toast.error("هذا المنتج غير متوفر في المخزون حالياً.");
          return { success: false, reason: "OUT_OF_STOCK" } as const;
        }

        if (activeMerchantId && activeMerchantId !== incomingMerchantId) {
          return { success: false, reason: "DIFFERENT_MERCHANT" } as const;
        }

        const existing = get().items.find((i) => i.product.id === product.id);
        if (existing && knownStock !== null && existing.quantity >= knownStock) {
          return { success: false, reason: "MAX_STOCK_REACHED" } as const;
        }

        const addQty = Math.max(1, Math.floor(quantity || 1));

        set((state) => {
          if (existing) {
            const desiredQty = existing.quantity + addQty;
            const finalQty =
              knownStock !== null ? Math.max(1, Math.min(knownStock, desiredQty)) : Math.max(1, desiredQty);
            return {
              items: state.items.map((i) => (i.product.id === product.id ? { ...i, quantity: finalQty } : i)),
            };
          }
          const initialQty =
            knownStock !== null ? Math.max(1, Math.min(knownStock, addQty)) : Math.max(1, addQty);
          return {
            items: [...state.items, { product, quantity: initialQty }],
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
          const item = state.items.find((i) => i.product.id === productId);
          if (!item) return state;
          const knownStock =
            typeof item.product.stock === "number" && item.product.stock >= 0 ? item.product.stock : null;
          if (knownStock === 0) {
            const sanitized = sanitizeCartState({
              items: state.items.filter((i) => i.product.id !== productId),
              activeMerchantId: state.activeMerchantId,
              coupon: state.coupon,
            });
            return {
              items: sanitized.items,
              activeMerchantId: sanitized.activeMerchantId,
              coupon: sanitized.coupon,
            };
          }
          const targetQty =
            knownStock !== null ? Math.max(1, Math.min(knownStock, quantity)) : Math.max(1, quantity);

          const nextState = {
            items: state.items.map((i) => (i.product.id === productId ? { ...i, quantity: targetQty } : i)),
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
