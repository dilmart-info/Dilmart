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
  <Link to={to} className="group flex min-w-[3.5rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 transition-colors hover:bg-DilMart-store-gold/10">
    <span className="relative">
      <Icon size={20} strokeWidth={1.75} className="text-foreground/90 transition-colors group-hover:text-DilMart-store-gold" />
      {badge != null && badge > 0 && (
        <span className="absolute -right-2 -top-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border border-background bg-DilMart-store-gold px-1 text-[10px] font-bold text-primary-foreground">
          {badge}
        </span>
      )}
    </span>
    <span className="text-[10px] font-semibold text-muted-foreground md:text-xs">{label}</span>
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
          className="group flex min-w-[3.5rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 transition-colors hover:bg-DilMart-store-gold/10"
          aria-label="السلة"
        >
          <span className="relative">
            <ShoppingCart size={20} strokeWidth={1.75} className="text-foreground/90 transition-colors group-hover:text-DilMart-store-gold" />
            {itemCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border border-background bg-DilMart-store-gold px-1 text-[10px] font-bold text-primary-foreground">
                {itemCount}
              </span>
            )}
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground md:text-xs">السلة</span>
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full overflow-y-auto border-DilMart-store-gold/15 bg-card sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-right font-display text-xl">سلة التسوق</SheetTitle>
        </SheetHeader>
        {items.length === 0 ? (
          <p className="mt-12 text-center text-muted-foreground">السلة فارغة</p>
        ) : (
          <div className="mt-6 space-y-4">
            {items.map((item) => (
              <div key={item.product.id} className="flex gap-3 border-b border-border pb-4">
                <img src={item.product.images?.[0] || "/placeholder.svg"} alt={item.product.name} className="h-16 w-16 rounded-md object-cover ring-1 ring-DilMart-store-gold/10" />
                <div className="flex-1">
                  <p className="text-sm font-medium leading-snug">{item.product.name}</p>
                  <p className="text-sm text-muted-foreground">{formatPrice(item.product.discount_price ?? item.product.price)}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <button type="button" onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="flex h-7 w-7 items-center justify-center rounded border border-border text-xs">
                      −
                    </button>
                    <span className="text-sm">{item.quantity}</span>
                    <button type="button" onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="flex h-7 w-7 items-center justify-center rounded border border-border text-xs">
                      +
                    </button>
                    <button type="button" onClick={() => removeItem(item.product.id)} className="mr-auto text-xs text-destructive">
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div className="border-t border-border pt-4">
              <div className="flex justify-between text-lg font-semibold">
                <span>المجموع</span>
                <span>{formatPrice(getTotal())}</span>
              </div>
              <Link to="/checkout">
                <Button className="mt-4 w-full bg-primary text-primary-foreground hover:bg-primary/90" size="lg">
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
          className={`group flex min-w-[3.5rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 transition-colors hover:bg-DilMart-store-gold/10 ${className}`}
          aria-label="الأقسام"
        >
          <LayoutGrid size={20} strokeWidth={1.75} className="text-foreground/90 transition-colors group-hover:text-DilMart-store-gold" />
          <span className="text-[10px] font-semibold text-muted-foreground md:text-xs">الأقسام</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[92vw] overflow-y-auto border-DilMart-store-gold/15 bg-card sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-right font-display text-xl">الأقسام</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {categories.map((cat) => (
            <div key={cat.id} className="space-y-2 rounded-xl border border-DilMart-store-gold/15 p-3">
              <Link to={`/products?category=${cat.slug}`} className="block text-right text-sm font-semibold hover:text-DilMart-store-gold">
                {cat.name}
              </Link>
              {cat.children && cat.children.length > 0 && (
                <div className="grid grid-cols-2 gap-2 border-r border-DilMart-store-gold/20 pr-3">
                  {cat.children.map((child) => (
                    <Link key={child.id} to={`/products?category=${child.slug}`} className="rounded-lg bg-muted/30 px-2 py-1 text-right text-xs text-muted-foreground hover:text-foreground">
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

export default function IconNav({ categories = [], showCategoryTrigger = false, categoryTriggerClassName = "" }: IconNavProps) {
  const { items, getItemCount, getTotal, removeItem, updateQuantity } = useCartStore();
  const { user, session, isMerchantUser, logoutCurrentDevice } = useAuth();
  const itemCount = getItemCount();
  const native = isNative();
  const hasSession = !!session || !!user;

  return (
    <div dir="rtl" className="flex items-center gap-1 md:gap-1.5">
      {showCategoryTrigger && categories.length > 0 && <CategoryDrawerTrigger categories={categories} className={categoryTriggerClassName} />}

      {!native && (
        <IconButton to={isMerchantUser ? "/merchant" : "/merchant/login"} icon={Store} label="التاجر" />
      )}
      <IconButton to="/wishlist" icon={Heart} label="المفضلة" />

      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <button type="button" className="group flex min-w-[3.5rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 transition-colors hover:bg-DilMart-store-gold/10" aria-label="حسابي">
            <User size={20} strokeWidth={1.75} className="text-foreground/90 transition-colors group-hover:text-DilMart-store-gold" />
            <span className="text-[10px] font-semibold text-muted-foreground md:text-xs">{hasSession ? "حسابي" : "تسجيل الدخول"}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 border-DilMart-store-gold/15 bg-card">
          {hasSession ? (
            <>
              <DropdownMenuItem asChild>
                <Link to="/profile" className="w-full cursor-pointer">الملف الشخصي</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/my-account/orders" className="w-full cursor-pointer">طلباتي</Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={async () => {
                  try {
                    await logoutCurrentDevice();
                    toast.success("تم تسجيل الخروج");
                  } catch {
                    // Secure-clear failure surfaces as storage_error — never toast success.
                  }
                }}
              >
                تسجيل الخروج
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem asChild>
              <Link to="/auth" className="w-full cursor-pointer">تسجيل الدخول / إنشاء حساب</Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CartTrigger itemCount={itemCount} items={items} getTotal={getTotal} removeItem={removeItem} updateQuantity={updateQuantity} />
    </div>
  );
}
