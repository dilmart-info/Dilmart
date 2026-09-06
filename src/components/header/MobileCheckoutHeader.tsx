import { ChevronRight, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function MobileCheckoutHeader() {
  const navigate = useNavigate();

  return (
    <div
      data-testid="mobile-checkout-header"
      className="md:hidden mobile-safe-area-top bg-white text-navy border-b border-border/80 shadow-xs"
    >
      <div className="flex h-14 items-center justify-between px-3 gap-2" dir="rtl">
        {/* Back to Cart button */}
        <button
          type="button"
          onClick={() => navigate("/cart")}
          aria-label="الرجوع إلى السلة"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-navy hover:bg-slate-100 active:scale-95 transition-all"
        >
          <ChevronRight size={24} className="text-navy" />
        </button>

        {/* Focused Title */}
        <span className="text-sm sm:text-base font-bold text-navy truncate text-center flex-1">
          إتمام الطلب والدفع
        </span>

        {/* Secure Checkout Badge */}
        <div
          className="flex h-11 items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 rounded-lg border border-emerald-200/60"
          title="دفع آمن وموثوق"
        >
          <ShieldCheck size={16} className="text-emerald-600" />
          <span className="hidden sm:inline">آمن</span>
        </div>
      </div>
    </div>
  );
}
