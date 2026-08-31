import { Heart, LayoutGrid, ShoppingCart, Store, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useCartStore } from "@/lib/cart-store";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { isNative } from "@/lib/capacitor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatPrice } from "@/lib/format";

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  children?: CategoryNode[];
};

type IconNavProps = {
  categories?: CategoryNode[];
  showCategoryTrigger?: boolean;
  categoryTriggerClassName?: string;
};

type CategoryTriggerProps = {
  categories: CategoryNode[];
  className?: string;
};

const IconButton = ({
  to,
  label,
  icon: Icon,
  badge,
}: {
  to: string;
  label: string;
  icon: typeof ShoppingCart;
  badge?: number;
}) => (
  <Link
    to={to}
    className="group flex min-w-[3.5rem] flex-col items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 transition-all hover:bg-primary/10 hover:text-primary text-foreground/80"
  >
    <span className="relative">
      <Icon
        size={20}
        strokeWidth={1.8}
        className="transition-colors group-hover:text-primary text-foreground/80"
      />
      {badge != null && badge > 0 && (
        <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-white shadow-sm ring-2 ring-white">
          {badge}
        </span>
      )}
    </span>
    <span className="text-[11px] font-semibold text-foreground/80 group-hover:text-primary transition-colors">
      {label}
    </span>
  </Link>
);

function CartTrigger({
  itemCount,
  items,
  getTotal,
  removeItem,
  updateQuantity,
}: {
  itemCount: number;
  items: ReturnType<typeof useCartStore.getState>["items"];
  getTotal: () => number;
  removeItem: ReturnType<typeof useCartStore.getState>["removeItem"];
  updateQuantity: ReturnType<typeof useCartStore.getState>["updateQuantity"];
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          id="cart-icon-header"
          type="button"
          className="group flex min-w-[3.5rem] flex-col items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 transition-all hover:bg-primary/10 text-foreground/80"
          aria-label="السلة"
        >
          <span className="relative">
            <ShoppingCart
              size={20}
              strokeWidth={1.8}
              className="transition-colors group-hover:text-primary text-foreground/80"
            />
            {itemCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-white shadow-sm ring-2 ring-white animate-in zoom-in">
                {itemCount}
              </span>
            )}
          </span>
          <span className="text-[11px] font-semibold text-foreground/80 group-hover:text-primary transition-colors">
            السلة
          </span>
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full overflow-y-auto border-border bg-white sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-right font-tajawal text-xl font-bold text-navy">
            سلة التسوق ({itemCount})
          </SheetTitle>
        </SheetHeader>
        {items.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="h-16 w-16 rounded-full bg-surface-light flex items-center justify-center text-muted-foreground">
              <ShoppingCart size={32} strokeWidth={1.5} />
            </div>
            <p className="text-base font-bold text-foreground">سلتك فارغة حالياً</p>
            <p className="text-xs text-muted-foreground">استكشف آلاف المنتجات وأضف ما يعجبك إلى السلة</p>
            <Link to="/products" className="pt-3 w-full">
              <Button className="w-full bg-primary hover:bg-primary-hover text-white font-bold">
                تصفح المنتجات
              </Button>
            </Link>
          </div>
        ) : (
          <div className="mt-6 flex flex-col h-[calc(100vh-140px)] justify-between">
            <div className="space-y-4 overflow-y-auto pr-1">
              {items.map((item) => (
                <div
                  key={item.product.id}
                  className="flex gap-3 border border-border/80 rounded-xl p-3 bg-surface-light/50 transition-all hover:bg-surface-light"
                >
                  <img
                    src={item.product.images?.[0] || "/placeholder.svg"}
                    alt={item.product.name}
                    className="h-16 w-16 rounded-lg object-cover bg-white border border-border shrink-0"
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <p className="text-xs font-bold leading-snug text-foreground line-clamp-2">
                        {item.product.name}
                      </p>
                      <p className="text-sm font-extrabold text-primary mt-1">
                        {formatPrice(item.product.discount_price ?? item.product.price)}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 bg-white border border-border rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold hover:bg-muted"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold hover:bg-muted"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        className="text-xs text-destructive hover:underline font-medium"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4 bg-white mt-4 space-y-3">
              <div className="flex justify-between items-center text-base font-extrabold text-navy">
                <span>المجموع الفرعي</span>
                <span className="text-primary text-lg">{formatPrice(getTotal())}</span>
              </div>
              <Link to="/checkout" className="block">
                <Button
                  className="w-full bg-accent hover:bg-accent-hover text-white font-extrabold text-sm h-12 shadow-sm rounded-xl"
                  size="lg"
                >
                  إتمام الطلب
                </Button>
              </Link>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function CategoryDrawerTrigger({ categories, className = "" }: CategoryTriggerProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-2 rounded-xl bg-surface-light border border-border/80 px-3.5 py-2 font-bold text-xs text-navy hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm ${className}`}
          aria-label="الأقسام"
        >
          <LayoutGrid size={17} strokeWidth={2.2} />
          <span>الأقسام</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[92vw] overflow-y-auto border-border bg-white sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-right font-tajawal text-xl font-extrabold text-navy">
            أقسام ديلمارت
          </SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-3">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="space-y-2 rounded-xl border border-border/80 bg-surface-light/40 p-3.5 transition-all hover:border-primary/40 hover:bg-surface-light"
            >
              <Link
                to={`/products?category=${cat.slug}`}
                className="block text-right text-sm font-extrabold text-navy hover:text-primary transition-colors"
              >
                {cat.name}
              </Link>
              {cat.children && cat.children.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 border-r-2 border-primary/30 pr-3 mt-2">
                  {cat.children.map((child) => (
                    <Link
                      key={child.id}
                      to={`/products?category=${child.slug}`}
                      className="rounded-lg bg-white border border-border/60 px-2.5 py-1 text-right text-xs font-semibold text-foreground/80 hover:text-primary hover:border-primary/40 transition-colors"
                    >
                      {child.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function IconNav({
  categories = [],
  showCategoryTrigger = false,
  categoryTriggerClassName = "",
}: IconNavProps) {
  const { items, getItemCount, getTotal, removeItem, updateQuantity } = useCartStore();
  const { user, session, isMerchantUser, logoutCurrentDevice } = useAuth();
  const itemCount = getItemCount();
  const native = isNative();
  const hasSession = !!session || !!user;

  return (
    <div dir="rtl" className="flex items-center gap-1 md:gap-1.5">
      {showCategoryTrigger && categories.length > 0 && (
        <CategoryDrawerTrigger
          categories={categories}
          className={categoryTriggerClassName}
        />
      )}

      {!native && (
        <IconButton
          to={isMerchantUser ? "/merchant" : "/merchant/login"}
          icon={Store}
          label="التاجر"
        />
      )}
      <IconButton to="/wishlist" icon={Heart} label="المفضلة" />

      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group flex min-w-[3.5rem] flex-col items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 transition-all hover:bg-primary/10 text-foreground/80"
            aria-label="حسابي"
          >
            <User
              size={20}
              strokeWidth={1.8}
              className="transition-colors group-hover:text-primary text-foreground/80"
            />
            <span className="text-[11px] font-semibold text-foreground/80 group-hover:text-primary transition-colors">
              {hasSession ? "حسابي" : "دخول"}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 border-border bg-white shadow-lg rounded-xl p-1.5">
          {hasSession ? (
            <>
              <DropdownMenuItem asChild>
                <Link to="/profile" className="w-full cursor-pointer font-bold text-xs py-2">
                  الملف الشخصي
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/my-account/orders" className="w-full cursor-pointer font-bold text-xs py-2">
                  طلباتي ومشترياتي
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive font-bold text-xs py-2"
                onClick={async () => {
                  try {
                    await logoutCurrentDevice();
                    toast.success("تم تسجيل الخروج بنجاح");
                  } catch {
                    // ignore
                  }
                }}
              >
                تسجيل الخروج
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem asChild>
              <Link to="/auth" className="w-full cursor-pointer font-bold text-xs py-2 text-primary">
                تسجيل الدخول / إنشاء حساب جديد
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CartTrigger
        itemCount={itemCount}
        items={items}
        getTotal={getTotal}
        removeItem={removeItem}
        updateQuantity={updateQuantity}
      />
    </div>
  );
}
