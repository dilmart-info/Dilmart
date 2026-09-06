import { ChevronRight, ShoppingCart } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCartStore } from "@/lib/cart-store";

function resolveTitle(pathname: string, search: string): string {
  if (pathname.startsWith("/product/")) return "تفاصيل المنتج";
  if (pathname.startsWith("/cart")) return "سلة التسوق";
  if (pathname.startsWith("/wishlist")) return "المفضلة";
  if (pathname.startsWith("/products")) {
    const params = new URLSearchParams(search);
    const cat = params.get("category");
    if (cat) return "الأقسام";
    const q = params.get("search");
    if (q) return `البحث: ${q}`;
    return "المنتجات";
  }
  if (pathname.startsWith("/stores") || pathname.startsWith("/store/")) return "المتاجر";
  if (pathname.startsWith("/brands")) return "العلامات التجارية";
  if (pathname.startsWith("/offers")) return "العروض الخاصة";
  if (pathname.startsWith("/profile") || pathname.startsWith("/my-account")) return "حسابي";
  if (pathname.startsWith("/track-order")) return "تتبع الطلب";
  if (pathname.startsWith("/about")) return "عن ديلمارت";
  if (pathname.startsWith("/contact")) return "تواصل معنا";
  if (pathname.startsWith("/privacy")) return "سياسة الخصوصية";
  if (pathname.startsWith("/terms")) return "الشروط والأحكام";
  if (pathname.startsWith("/returns")) return "سياسة الاسترجاع";
  if (pathname.startsWith("/support")) return "الدعم الفني";
  return "ديلمارت";
}

export default function MobileInnerHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const rawItemCount = useCartStore((state) => (typeof state?.getItemCount === "function" ? state.getItemCount() : 0));
  const itemCount = typeof rawItemCount === "number" ? rawItemCount : (typeof (rawItemCount as any)?.getItemCount === "function" ? (rawItemCount as any).getItemCount() : 0);

  const title = resolveTitle(location.pathname, location.search);

  const handleBack = () => {
    // Router-state aware back navigation:
    // If user navigated within the app (idx > 0), go back.
    // If direct entry / deep-link (idx === 0 or undefined), fallback deterministically.
    const historyIdx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof historyIdx === "number" && historyIdx > 0) {
      navigate(-1);
    } else if (location.pathname.startsWith("/product/")) {
      navigate("/products");
    } else {
      navigate("/");
    }
  };

  return (
    <div
      data-testid="mobile-inner-header"
      className="md:hidden mobile-safe-area-top bg-white text-navy border-b border-border/80 shadow-xs"
    >
      <div className="flex h-14 items-center justify-between px-3 gap-2" dir="rtl">
        {/* 1. Back Button */}
        <button
          type="button"
          onClick={handleBack}
          aria-label="الرجوع للخلف"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-navy hover:bg-slate-100 active:scale-95 transition-all"
        >
          <ChevronRight size={24} className="text-navy" />
        </button>

        {/* 2. Contextual Title */}
        <span className="text-sm sm:text-base font-bold text-navy truncate text-center flex-1 px-1">
          {title}
        </span>

        {/* 3. Cart Icon with Live Badge */}
        <Link
          to="/cart"
          aria-label="السلة"
          className="relative flex h-11 w-11 items-center justify-center rounded-xl text-navy hover:bg-slate-100 active:scale-95 transition-all"
        >
          <ShoppingCart size={22} className="text-navy" />
          {itemCount > 0 && (
            <span
              data-testid="header-cart-badge"
              className="absolute top-1 left-1 bg-accent text-white text-[10px] font-extrabold min-w-[17px] h-[17px] flex items-center justify-center rounded-full border-2 border-white animate-in zoom-in"
            >
              {itemCount}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}
