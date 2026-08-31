import { Link } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import type { MarketplaceHomeMerchantEmbed } from "@/lib/marketplace-home.types";
import type { MarketplacePublicProduct } from "@/lib/marketplace-product-detail.types";
import { formatPrice } from "@/lib/format";
import { useWishlistStore } from "@/lib/wishlist-store";
import { ShoppingCart, Timer, Heart, Check, Store } from "lucide-react";
import { useState, useEffect } from "react";
import { triggerCartAnimation } from "@/components/FlyingCartAnimation";
import { useMerchantSwitchCart } from "@/components/MerchantSwitchCartDialog";

const CountdownTimer = ({ targetDate }: { targetDate: string }) => {
  const [timeLeft, setTimeLeft] = useState<{ h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const difference = +new Date(targetDate) - +new Date();
      if (difference > 0) {
        setTimeLeft({
          h: Math.floor(difference / (1000 * 60 * 60)),
          m: Math.floor((difference / 1000 / 60) % 60),
          s: Math.floor((difference / 1000) % 60),
        });
      } else {
        setTimeLeft(null);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  if (!timeLeft) return null;

  return (
    <div className="flex items-center gap-1 rounded-md bg-navy/90 px-2 py-0.5 font-mono text-[10px] font-bold text-accent shadow-sm">
      <Timer size={11} strokeWidth={2} />
      <span className="tabular-nums" dir="ltr">
        {timeLeft.h.toString().padStart(2, "0")}:{timeLeft.m.toString().padStart(2, "0")}:
        {timeLeft.s.toString().padStart(2, "0")}
      </span>
    </div>
  );
};

type ProductCardProduct = (Tables<"products"> | MarketplacePublicProduct) & {
  merchants?: MarketplaceHomeMerchantEmbed | null;
  is_best_seller?: boolean | null;
  is_new?: boolean | null;
  loyalty_points_enabled?: boolean | null;
  offer_ends_at?: string | null;
};

interface Props {
  product: ProductCardProduct;
}

const PLACEHOLDER_IMG = "/placeholder.svg";

const ProductCard = ({ product }: Props) => {
  const merchantEmbed = product.merchants;
  const { attemptAdd, dialogNode } = useMerchantSwitchCart();
  const { addItem, removeItem, hasItem } = useWishlistStore();
  const [imgSrc, setImgSrc] = useState(() => product.images?.[0] || PLACEHOLDER_IMG);
  const [isAdded, setIsAdded] = useState(false);

  useEffect(() => {
    setImgSrc(product.images?.[0] || PLACEHOLDER_IMG);
  }, [product.id, product.images]);

  const hasDiscount = product.discount_price != null && product.discount_price < product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.price - product.discount_price!) / product.price) * 100)
    : 0;
  const isOutOfStock = product.stock !== null && product.stock <= 0;
  const effectivePrice = product.discount_price ?? product.price;
  const isWishlisted = hasItem(product.id);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock) return;

    attemptAdd(product as unknown as Tables<"products">);
    triggerCartAnimation(e.currentTarget as HTMLElement);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1500);
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isWishlisted) {
      removeItem(product.id);
    } else {
      addItem({
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        discount_price: product.discount_price,
        images: product.images,
        stock: product.stock,
      });
    }
  };

  return (
    <>
      <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-white shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:-translate-y-1">
        {/* Top Image Container */}
        <Link to={`/product/${product.slug}`} className="relative block overflow-hidden bg-surface-light aspect-square">
          <img
            src={imgSrc}
            alt={product.name}
            width={512}
            height={512}
            referrerPolicy="no-referrer"
            onError={() => setImgSrc(PLACEHOLDER_IMG)}
            className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              isOutOfStock ? "opacity-45 grayscale" : ""
            }`}
            loading="lazy"
          />

          {/* Badges Overlay */}
          <div className="absolute top-2.5 right-2.5 flex flex-col items-start gap-1.5 z-10">
            {hasDiscount && (
              <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-extrabold text-white shadow-sm">
                خصم {discountPercent}%
              </span>
            )}
            {product.is_best_seller && (
              <span className="rounded-md bg-navy px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                الأكثر مبيعاً
              </span>
            )}
            {product.is_new && !hasDiscount && (
              <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                جديد
              </span>
            )}
            {isOutOfStock && (
              <span className="rounded-md bg-zinc-800/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                نفد من المخزون
              </span>
            )}
          </div>

          {/* Wishlist Button */}
          <button
            type="button"
            onClick={handleToggleWishlist}
            className={`absolute top-2.5 left-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:scale-110 ${
              isWishlisted ? "text-rose-600" : "text-muted-foreground hover:text-rose-600"
            }`}
            aria-label={isWishlisted ? "إزالة من المفضلة" : "إضافة للمفضلة"}
          >
            <Heart size={16} fill={isWishlisted ? "currentColor" : "none"} strokeWidth={2} />
          </button>

          {/* Countdown Timer (if offer ending) */}
          {product.offer_ends_at && hasDiscount && (
            <div className="absolute bottom-2 right-2 left-2 flex justify-center z-10">
              <CountdownTimer targetDate={product.offer_ends_at} />
            </div>
          )}
        </Link>

        {/* Content Container */}
        <div className="flex flex-1 flex-col p-3.5 text-right">
          {/* Merchant / Store Tag */}
          {merchantEmbed && (
            <Link
              to={`/store/${merchantEmbed.slug}`}
              className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary/85 hover:text-primary hover:underline line-clamp-1"
            >
              <Store size={12} className="shrink-0" />
              <span>{merchantEmbed.business_name}</span>
            </Link>
          )}

          {/* Product Name */}
          <Link
            to={`/product/${product.slug}`}
            className="mb-2 font-tajawal text-xs md:text-sm font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2"
          >
            {product.name}
          </Link>

          {/* Price & Action Section */}
          <div className="mt-auto pt-2 border-t border-border/50 flex items-end justify-between gap-2">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-tajawal text-base md:text-lg font-black text-navy leading-none">
                  {formatPrice(effectivePrice)}
                </span>
              </div>
              {hasDiscount && (
                <span className="text-[11px] font-medium text-muted-foreground line-through">
                  {formatPrice(product.price)}
                </span>
              )}
            </div>

            {/* Quick Add To Cart Button */}
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={handleAddToCart}
              className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold transition-all shadow-sm ${
                isOutOfStock
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : isAdded
                  ? "bg-emerald-600 text-white scale-105"
                  : "bg-primary hover:bg-primary-hover text-white active:scale-95"
              }`}
              aria-label="إضافة إلى السلة"
              title="إضافة إلى السلة"
            >
              {isAdded ? (
                <Check size={18} strokeWidth={2.5} />
              ) : (
                <ShoppingCart size={17} strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>
      </div>
      {dialogNode}
    </>
  );
};

export default ProductCard;
