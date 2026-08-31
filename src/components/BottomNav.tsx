import { Heart, Home, LayoutGrid, ShoppingCart, Store, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useCartStore } from "@/lib/cart-store";
import { useAuth } from "@/hooks/use-auth";
import { isNative } from "@/lib/capacitor";

const BottomNav = () => {
  const location = useLocation();
  const { getItemCount } = useCartStore();
  const { isMerchantUser } = useAuth();
  const itemCount = getItemCount();
  const native = isNative();

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

  if (location.pathname.startsWith("/product/") || location.pathname.startsWith("/checkout")) {
    return null;
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-white/95 backdrop-blur-lg border-t border-border shadow-[0_-4px_16px_rgba(7,26,61,0.06)] h-16 safe-area-inset-bottom">
      <div
        className="grid h-full items-center"
        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
      >
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
                isActive ? "text-primary font-bold scale-105" : "text-muted-foreground hover:text-primary"
              }`}
            >
              <div className="relative">
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-accent text-white text-[10px] font-extrabold min-w-[17px] h-[17px] flex items-center justify-center rounded-full border-2 border-white animate-in zoom-in">
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
