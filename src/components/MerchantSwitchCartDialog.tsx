import { useState, useCallback, useRef } from "react";
import type { CartLineProduct } from "@/lib/cart-store";
import { useCartStore } from "@/lib/cart-store";
import { triggerCartAnimation } from "@/components/FlyingCartAnimation";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ShoppingBag, ArrowLeftRight } from "lucide-react";

interface PendingSwitch {
  product: CartLineProduct;
  /** The DOM element that triggered the add — used for the flying animation after confirm. */
  triggerElement: HTMLElement | null;
  /** Optional callback invoked after successful addition (both direct add and confirmed switch). */
  onSuccess?: () => void;
}

/**
 * Shared hook + dialog for the merchant-switch cart flow.
 *
 * Usage in any consumer:
 * ```tsx
 * const { attemptAdd, dialogNode } = useMerchantSwitchCart();
 * // in JSX: {dialogNode}
 * // on click: attemptAdd(product, e.currentTarget)
 * ```
 */
export function useMerchantSwitchCart() {
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const addItem = useCartStore((s) => s.addItem);
  const clearCart = useCartStore((s) => s.clearCart);
  // Keep a stable ref to avoid stale closures in the confirm handler.
  const pendingRef = useRef<PendingSwitch | null>(null);

  const attemptAdd = useCallback(
    (product: CartLineProduct, triggerElement: HTMLElement | null, onSuccess?: () => void): boolean => {
      const result = addItem(product);
      if (result.success) {
        onSuccess?.();
        return true;
      }
      if (result.reason === "DIFFERENT_MERCHANT") {
        const entry: PendingSwitch = { product, triggerElement, onSuccess };
        pendingRef.current = entry;
        setPending(entry);
        return false;
      }
      // INVALID_PRODUCT — toast already shown by the store
      return false;
    },
    [addItem],
  );

  const handleConfirmSwitch = useCallback(() => {
    const entry = pendingRef.current;
    if (!entry) return;
    clearCart();
    const result = addItem(entry.product);
    if (result.success) {
      if (entry.triggerElement) {
        triggerCartAnimation(entry.triggerElement);
      }
      entry.onSuccess?.();
    }
    pendingRef.current = null;
    setPending(null);
  }, [clearCart, addItem]);

  const handleCancel = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);

  const dialogNode = (
    <AlertDialog open={!!pending} onOpenChange={(open) => !open && handleCancel()}>
      <AlertDialogContent className="max-w-[92vw] rounded-2xl border-DilMart-store-gold/20 bg-card sm:max-w-md" dir="rtl">
        <AlertDialogHeader className="text-right">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-DilMart-store-gold/30 bg-DilMart-store-gold/10">
            <ArrowLeftRight className="h-5 w-5 text-DilMart-store-gold-bright" strokeWidth={1.5} />
          </div>
          <AlertDialogTitle className="text-center text-lg font-semibold">
            لديك منتجات من متجر آخر في السلة
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-sm leading-relaxed text-muted-foreground">
            لإضافة هذا المنتج، يجب بدء سلة جديدة. سيتم حذف المنتجات الموجودة حاليًا من السلة.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <AlertDialogCancel
            onClick={handleCancel}
            className="rounded-full border-DilMart-store-gold/20 text-sm"
          >
            الاحتفاظ بالسلة الحالية
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmSwitch}
            className="gap-2 rounded-full bg-primary text-sm text-primary-foreground"
          >
            <ShoppingBag size={16} strokeWidth={1.5} />
            تفريغ السلة وإضافة المنتج
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { attemptAdd, dialogNode } as const;
}
