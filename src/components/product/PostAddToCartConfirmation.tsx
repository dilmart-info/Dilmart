import { CheckCircle2, ShoppingBag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface PostAddToCartConfirmationProps {
  open: boolean;
  productName: string;
  quantity?: number;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 7000;

export default function PostAddToCartConfirmation({
  open,
  productName,
  quantity = 1,
  onDismiss,
}: PostAddToCartConfirmationProps) {
  const navigate = useNavigate();
  const [isPaused, setIsPaused] = useState(false);
  const remainingMsRef = useRef(AUTO_DISMISS_MS);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setIsPaused(false);
      remainingMsRef.current = AUTO_DISMISS_MS;
      startTimeRef.current = null;
      return;
    }

    remainingMsRef.current = AUTO_DISMISS_MS;
    startTimeRef.current = Date.now();

    let timeoutId: NodeJS.Timeout | null = null;

    if (!isPaused) {
      timeoutId = setTimeout(() => {
        onDismiss();
      }, remainingMsRef.current);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [open, isPaused, onDismiss]);

  const handleMouseEnter = () => {
    if (!isPaused && startTimeRef.current) {
      const elapsed = Date.now() - startTimeRef.current;
      remainingMsRef.current = Math.max(1000, remainingMsRef.current - elapsed);
      setIsPaused(true);
    }
  };

  const handleMouseLeave = () => {
    if (isPaused) {
      startTimeRef.current = Date.now();
      setIsPaused(false);
    }
  };

  if (!open) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="تأكيد إضافة المنتج إلى السلة"
      data-testid="post-add-to-cart-confirmation"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleMouseEnter}
      onTouchEnd={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      className="fixed left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-[55] bg-white border border-slate-200/90 rounded-2xl shadow-xl p-3.5 animate-in slide-in-from-bottom-3 fade-in duration-200"
      style={{
        bottom: "calc(var(--mobile-pdp-total-bottom) + 0.75rem)",
      }}
      dir="rtl"
    >
      <div className="flex items-start justify-between gap-2.5 mb-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-navy truncate">
              تمت الإضافة إلى السلة بنجاح
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {quantity > 1 ? `${quantity}x ` : ""}
              {productName}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="إغلاق التنبيه"
          className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
        <Button
          type="button"
          onClick={() => {
            onDismiss();
            navigate("/cart");
          }}
          className="h-10 rounded-xl bg-primary hover:bg-primary-hover font-bold text-xs text-white shadow-xs gap-1.5 active:scale-95 transition-all"
        >
          <ShoppingBag size={15} />
          <span>عرض السلة</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onDismiss}
          className="h-10 rounded-xl border-slate-200 font-bold text-xs text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
        >
          متابعة التسوق
        </Button>
      </div>
    </aside>
  );
}
