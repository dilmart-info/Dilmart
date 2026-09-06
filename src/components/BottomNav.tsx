import { Heart, Home, LayoutGrid, ShoppingCart, Store, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useCartStore } from "@/lib/cart-store";
import { useAuth } from "@/hooks/use-auth";
import { isNative } from "@/lib/capacitor";

const EXCLUDED_PREFIXES = [
  "/checkout",
  "/thank-you",
  "/auth",
  "/forgot-password",
  "/claim-account",
  "/admin",
  "/merchant",
  "/agent",
];

function isItemActive(itemPath: string, pathname: string): boolean {
  if (itemPath === "/") {
    return pathname === "/";
  }
  if (itemPath === "/products") {
    return pathname.startsWith("/products") || pathname.startsWith("/category") || pathname.startsWith("/product/");
  }
  if (itemPath === "/wishlist") {
    return pathname.startsWith("/wishlist");
  }
  if (itemPath === "/profile") {
    return pathname.startsWith("/profile") || pathname.startsWith("/my-account");
  }
  if (itemPath === "/cart") {
    return pathname.startsWith("/cart");
  }
  return pathname === itemPath;
}

const BottomNav = () => {
  const location = useLocation();
  const itemCount = useCartStore((state) => state.getItemCount());
  const { isMerchantUser } = useAuth();
  const native = isNative();

  const isExcluded = EXCLUDED_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
  if (isExcluded) {
    return null;
  }

  const navItems = [
    { icon: Home, label: "الرئيسية", path: "/" },
    { icon: LayoutGrid, label: "الأقسام", path: "/products" },
    { icon: Heart, label: "المفضلة", path: "/wishlist" },
    { icon: User, label: "حسابي", path: "/profile" },
    ...(!native
      ? [{ icon: Store, label: "التاجر", path: isMerchantUser ? "/merchant" : "/merchant/login" }]
      : []),
    { icon: ShoppingCart, label: "السلة", path: "/cart", badge: itemCount },
  ];

  const gridCols = navItems.length;

  return (
    <nav
      data-testid="mobile-bottom-nav"
      aria-label="شريط التنقل الرئيسي"
      className="md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-white/95 backdrop-blur-lg border-t border-border shadow-[0_-4px_16px_rgba(7,26,61,0.06)] mobile-safe-area-bottom"
      style={{ minHeight: "var(--mobile-bottom-nav-total)" }}
    >
      <div
        className="grid items-center h-16"
        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
      >
        {navItems.map((item) => {
          const isActive = isItemActive(item.path, location.pathname);
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-col items-center justify-center min-h-[44px] min-w-[44px] h-full gap-1 transition-all duration-200 ${
                isActive ? "text-primary font-bold scale-105" : "text-muted-foreground hover:text-primary"
              }`}
            >
              <div className="relative">
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    data-testid="bottom-nav-cart-badge"
                    className="absolute -top-1.5 -right-2 bg-accent text-white text-[10px] font-extrabold min-w-[17px] h-[17px] flex items-center justify-center rounded-full border-2 border-white animate-in zoom-in"
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
