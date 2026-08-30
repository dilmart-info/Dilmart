import { Link } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import type { MarketplaceHomeMerchantEmbed } from "@/lib/marketplace-home.types";
import type { MarketplacePublicProduct } from "@/lib/marketplace-product-detail.types";
import { formatPrice } from "@/lib/format";
import { useWishlistStore } from "@/lib/wishlist-store";
import { ShoppingBag, Timer, Heart } from "lucide-react";
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
    <div className="flex items-center gap-1.5 rounded-full border border-DilMart-store-gold/25 bg-black/55 px-2.5 py-1 font-mono text-[10px] text-DilMart-store-gold-bright backdrop-blur-sm">
      <Timer size={10} strokeWidth={1.5} />
      <span className="tabular-nums">
        {timeLeft.h.toString().padStart(2, "0")}:{timeLeft.m.toString().padStart(2, "0")}:{timeLeft.s.toString().padStart(2, "0")}
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
  /** May include `merchants` embed from marketplace APIs — no extra fetch required for store link/label. */
  product: ProductCardProduct;
}

const PLACEHOLDER_IMG = "/placeholder.svg";

const ProductCard = ({ product }: Props) => {
  const merchantEmbed = product.merchants;
  const { attemptAdd, dialogNode } = useMerchantSwitchCart();
  const { addItem, removeItem, hasItem } = useWishlistStore();
  const [imgSrc, setImgSrc] = useState(() => product.images?.[0] || PLACEHOLDER_IMG);
  useEffect(() => {
    setImgSrc(product.images?.[0] || PLACEHOLDER_IMG);
  }, [product.id, product.images]);
  const hasDiscount = product.discount_price != null && product.discount_price < product.price;
  const discountPercent = hasDiscount ? Math.round(((product.price - product.discount_price!) / product.price) * 100) : 0;
  const isOutOfStock = product.stock !== null && product.stock <= 0;
  const loyaltyPoints =
    product.loyalty_points_enabled !== false ? Math.floor((product.discount_price ?? product.price) / 100) : null;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-DilMart-store-gold/10 bg-card text-card-foreground shadow-sm transition-all duration-300 hover:border-DilMart-store-gold/30 hover:shadow-lg hover:shadow-black/25">
      <Link to={`/product/${product.slug}`} className="relative block">
        <div className="aspect-square overflow-hidden bg-muted/30">
          <img
            src={imgSrc}
            alt={product.name}
            width={512}
            height={512}
            referrerPolicy="no-referrer"
            onError={() => setImgSrc(PLACEHOLDER_IMG)}
            className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${isOutOfStock ? "opacity-55 grayscale" : ""}`}
            loading="lazy"
          />
        </div>

        <div className="absolute left-3 top-3 flex flex-col items-start gap-2">
          {hasDiscount && (
            <span className="rounded-full border border-orange-300/70 bg-orange-100/90 px-2.5 py-1 text-[11px] font-semibold text-orange-700 backdrop-blur-sm">
              خصم {discountPercent}%
            </span>
          )}
          {isOutOfStock && (
            <span className="rounded-full border border-border bg-background/90 px-2.5 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">
              غير متوفر
            </span>
          )}
        </div>

        {product.offer_ends_at && (
          <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-center">
            <CountdownTimer targetDate={product.offer_ends_at} />
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {product.is_new && !hasDiscount && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-DilMart-store-gold/90">جديد</span>
          )}
          {product.is_best_seller && (
            <span className="text-[10px] text-muted-foreground">الأكثر مبيعاً</span>
          )}
        </div>

        <Link to={`/product/${product.slug}`} className="flex-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-DilMart-store-gold-bright md:text-[15px]">
            {product.name}
          </h3>
          {String(product.short_description ?? "").trim() ? (
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
              {String(product.short_description).trim()}
            </p>
          ) : null}
        </Link>

        {merchantEmbed?.slug && merchantEmbed.display_name && (
          <Link
            to={`/store/${merchantEmbed.slug}`}
            className="mt-1 line-clamp-1 text-[11px] text-muted-foreground transition-colors hover:text-DilMart-store-gold"
            onClick={(e) => e.stopPropagation()}
          >
            {merchantEmbed.display_name}
          </Link>
        )}

        {loyaltyPoints != null && loyaltyPoints > 0 && (
          <p className="mt-2 text-[11px] text-DilMart-store-gold/75">+{loyaltyPoints} نقطة ولاء</p>
        )}

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {hasDiscount ? (
              <>
                <span className="text-base font-semibold text-DilMart-store-gold-bright md:text-lg">
                  {formatPrice(product.discount_price!)}
                </span>
                <span className="text-[11px] text-muted-foreground line-through decoration-DilMart-store-gold/40">
                  {formatPrice(product.price)}
                </span>
              </>
            ) : (
              <span className="text-base font-semibold md:text-lg">{formatPrice(product.price)}</span>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => {
                if (hasItem(product.id)) removeItem(product.id, { sourceSurface: "product_card" });
                else addItem(product.id, { sourceSurface: "product_card" });
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
                hasItem(product.id)
                  ? "border-DilMart-store-gold/50 bg-DilMart-store-gold/15 text-DilMart-store-gold-bright"
                  : "border-transparent bg-secondary/80 text-foreground hover:border-DilMart-store-gold/30 hover:bg-DilMart-store-gold/10"
              }`}
              aria-label="المفضلة"
            >
              <Heart size={17} strokeWidth={1.5} fill={hasItem(product.id) ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                if (isOutOfStock) return;
                const added = attemptAdd(product, e.currentTarget);
                if (added) {
                  triggerCartAnimation(e.currentTarget);
                }
              }}
              disabled={isOutOfStock}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                isOutOfStock
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
              aria-label={isOutOfStock ? "غير متوفر" : "أضف للسلة"}
            >
              <ShoppingBag size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
      {dialogNode}
    </div>
  );
};

export default ProductCard;

