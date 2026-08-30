import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { formatPrice } from "@/lib/format";
import { useWishlistStore } from "@/lib/wishlist-store";
import { ShoppingBag, MessageCircle, ArrowRight, Heart, Gift } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect, useCallback } from "react";
import { triggerCartAnimation } from "@/components/FlyingCartAnimation";
import { useMerchantSwitchCart } from "@/components/MerchantSwitchCartDialog";
import { apiClient } from "@/lib/api-client";
import { MARKETPLACE_EMPTY_SUGGESTED, type MarketplacePublicProduct } from "@/lib/marketplace-product-detail.types";
import { addRecentlyViewedItem, trackGrowthHookEvent } from "@/lib/growth-hooks";
import { startTrackedWhatsAppIntent } from "@/lib/whatsapp-assisted";
import { toast } from "sonner";

const PLACEHOLDER_IMG = "/placeholder.svg";

const ProductDetail = () => {
  const { slug } = useParams();

  const {
    data: product,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["marketplace-product", slug],
    queryFn: () => apiClient.getMarketplaceProductBySlug(slug!),
    enabled: !!slug,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1 container py-10">
          <div className="grid gap-10 md:grid-cols-2">
            <Skeleton className="aspect-square rounded-2xl bg-muted/30" />
            <div className="space-y-4">
              <Skeleton className="h-10 w-3/4 bg-muted/30" />
              <Skeleton className="h-8 w-1/2 bg-muted/30" />
              <Skeleton className="h-28 w-full bg-muted/30" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1 container py-24 text-center">
          <h1 className="font-display text-2xl font-semibold">المنتج غير موجود</h1>
          <p className="mt-2 text-sm text-muted-foreground">قد يكون الرابط غير صحيح أو المنتج غير متاح حالياً.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild className="rounded-full">
              <Link to="/products">العودة للمنتجات</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full border-DilMart-store-gold/30">
              <Link to="/stores">استعراض المتاجر</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return <ProductDetailLoaded product={product} />;
};

function ProductDetailLoaded({ product }: { product: MarketplacePublicProduct }) {
  const { attemptAdd, dialogNode } = useMerchantSwitchCart();
  const navigate = useNavigate();
  const { addItem: addToWishlist, removeItem: removeFromWishlist, hasItem: isInWishlist } = useWishlistStore();
  const [selectedImage, setSelectedImage] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const displaySrc = useCallback(
    (url: string) => (failedUrls[url] ? PLACEHOLDER_IMG : url),
    [failedUrls],
  );
  const onImgError = useCallback((url: string) => {
    setFailedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  }, []);

  const { data: suggestedPayload } = useQuery({
    queryKey: ["marketplace-suggested", product.category_id, product.id],
    queryFn: async () => {
      try {
        return await apiClient.getMarketplaceSuggested({
          category_id: product.category_id!,
          exclude_id: product.id,
        });
      } catch {
        return MARKETPLACE_EMPTY_SUGGESTED;
      }
    },
    enabled: !!product.category_id,
  });

  const suggested = suggestedPayload?.items ?? [];

  useEffect(() => {
    setFailedUrls({});
    setSelectedImage(0);
  }, [product.id]);

  useEffect(() => {
    trackGrowthHookEvent("product.viewed", {
      sourceSurface: "product_detail",
      productId: product.id,
      merchantId: product.merchant_id ?? undefined,
      path: `/product/${product.slug}`,
    });
    addRecentlyViewedItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      merchantId: product.merchant_id ?? null,
    });
  }, [product.id, product.slug, product.name, product.merchant_id]);

  const merchantEmbed = product.merchants;

  const hasDiscount = product.discount_price != null && product.discount_price < product.price;
  const images = product.images && product.images.length > 0 ? product.images : ["/placeholder.svg"];
  const productUrl = `${window.location.origin}/product/${product.slug}`;
  const isOutOfStock = product.stock !== null && product.stock <= 0;
  const loyaltyPts =
    product.loyalty_points_enabled !== false && !isOutOfStock
      ? Math.floor((product.discount_price ?? product.price) / 100)
      : null;

  const handleWhatsAppIntent = async (mode: "order" | "inquiry") => {
    try {
      await startTrackedWhatsAppIntent({
        merchantId: product.merchant_id,
        merchantName: merchantEmbed?.display_name ?? "",
        sourceSurface: "product",
        product: { id: product.id, name: product.name },
        completionLink: mode === "order" ? `${window.location.origin}/checkout` : productUrl,
      });
    } catch (error: any) {
      toast.error(error?.message || "تعذّر فتح واتساب حالياً");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="container py-8 md:py-12">
          <nav className="mb-8 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-DilMart-store-gold">
              الرئيسية
            </Link>
            <ArrowRight size={12} className="opacity-50" />
            <Link to="/products" className="transition-colors hover:text-DilMart-store-gold">
              المنتجات
            </Link>
            {merchantEmbed?.slug ? (
              <>
                <ArrowRight size={12} className="opacity-50" />
                <Link to={`/store/${merchantEmbed.slug}`} className="transition-colors hover:text-DilMart-store-gold line-clamp-1">
                  {merchantEmbed.display_name}
                </Link>
              </>
            ) : null}
            <ArrowRight size={12} className="opacity-50" />
            <span className="line-clamp-1 text-foreground">{product.name}</span>
          </nav>

          <div className="grid gap-10 md:grid-cols-2 md:gap-14 lg:gap-16">
            <div>
              <div className="overflow-hidden rounded-2xl border border-DilMart-store-gold/15 bg-card shadow-2xl shadow-black/40">
                <div className="aspect-square">
                  <img
                    src={displaySrc(images[selectedImage])}
                    alt={product.name}
                    onError={() => onImgError(images[selectedImage])}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              {images.length > 1 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedImage(i)}
                      className={`h-16 w-16 overflow-hidden rounded-lg border-2 transition-colors ${
                        i === selectedImage ? "border-DilMart-store-gold" : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={displaySrc(img)}
                        alt=""
                        onError={() => onImgError(img)}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-6 text-right">
              <div className="space-y-2">
                <h1 className="font-display text-3xl font-semibold leading-tight text-foreground md:text-4xl lg:text-[2.4rem]">
                  {product.name}
                </h1>
                {merchantEmbed?.slug ? (
                  <p className="text-sm text-muted-foreground">
                    من متجر:{" "}
                    <Link
                      to={`/store/${merchantEmbed.slug}`}
                      className="font-medium text-DilMart-store-gold transition-colors hover:text-DilMart-store-gold-bright hover:underline"
                    >
                      {merchantEmbed.display_name}
                    </Link>
                  </p>
                ) : null}
                {String(product.brand ?? "").trim() ? (
                  <p className="text-sm text-muted-foreground">{String(product.brand).trim()}</p>
                ) : null}
                {String(product.short_description ?? "").trim() ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {String(product.short_description).trim()}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-baseline gap-3">
                {hasDiscount ? (
                  <>
                    <span className="font-display text-3xl font-semibold text-DilMart-store-gold-bright md:text-4xl">
                      {formatPrice(product.discount_price!)}
                    </span>
                    <span className="text-lg text-muted-foreground line-through">{formatPrice(product.price)}</span>
                    <span className="rounded-full border border-DilMart-store-gold/25 bg-DilMart-store-gold/10 px-3 py-1 text-xs font-medium text-DilMart-store-gold-bright">
                      خصم {Math.round(((product.price - product.discount_price!) / product.price) * 100)}%
                    </span>
                  </>
                ) : (
                  <span className="font-display text-3xl font-semibold text-DilMart-store-gold-bright md:text-4xl">{formatPrice(product.price)}</span>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                {isOutOfStock
                  ? "غير متوفر"
                  : product.stock != null && product.stock > 0 && product.stock < 5
                    ? `المتبقي: ${product.stock}`
                    : "متوفر"}
              </p>

              <Button
                size="lg"
                className="w-full gap-2 rounded-full"
                disabled={isOutOfStock}
                onClick={(e) => {
                  const added = attemptAdd(product, e.currentTarget);
                  if (added) {
                    triggerCartAnimation(e.currentTarget);
                  }
                }}
              >
                <ShoppingBag size={18} strokeWidth={1.5} />
                {isOutOfStock ? "غير متوفر" : "أضف إلى السلة"}
              </Button>

              {(() => {
                const detailed = String(product.description ?? "").trim();
                const short = String(product.short_description ?? "").trim();
                if (!detailed || detailed === short) return null;
                return (
                  <div className="rounded-2xl border border-DilMart-store-gold/10 bg-card/40 p-5">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-DilMart-store-gold">وصف تفصيلي</p>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{detailed}</div>
                  </div>
                );
              })()}

              {loyaltyPts != null && loyaltyPts > 0 ? (
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-DilMart-store-gold/15 bg-DilMart-store-gold/5 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-DilMart-store-gold/30 bg-background/50">
                      <Gift className="h-5 w-5 text-DilMart-store-gold-bright" strokeWidth={1.25} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">نقاط الولاء</p>
                      <p className="text-xs text-muted-foreground">تُضاف عند إتمام الشراء</p>
                    </div>
                  </div>
                  <span className="font-display text-2xl font-semibold text-DilMart-store-gold-bright">+{loyaltyPts}</span>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 border-t border-DilMart-store-gold/10 pt-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={`rounded-full border-DilMart-store-gold/25 px-3 ${
                      isInWishlist(product.id) ? "border-DilMart-store-gold/50 bg-DilMart-store-gold/10 text-DilMart-store-gold-bright" : "text-muted-foreground"
                    }`}
                    onClick={() =>
                      isInWishlist(product.id)
                        ? removeFromWishlist(product.id, { sourceSurface: "product_detail" })
                        : addToWishlist(product.id, { sourceSurface: "product_detail" })
                    }
                  >
                    <Heart size={16} strokeWidth={1.5} className="ms-1" fill={isInWishlist(product.id) ? "currentColor" : "none"} />
                    المفضلة
                  </Button>
                  {!isOutOfStock ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full border-DilMart-store-gold/25 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        attemptAdd(product, null, () => navigate("/checkout"));
                      }}
                    >
                      إتمام الطلب
                    </Button>
                  ) : null}
                  {!isOutOfStock ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 rounded-full border-DilMart-store-gold/25 text-muted-foreground hover:text-foreground"
                      onClick={() => void handleWhatsAppIntent("order")}
                    >
                      <MessageCircle size={15} strokeWidth={1.5} />
                      واتساب
                    </Button>
                  ) : null}
                </div>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto self-start px-0 py-1 text-xs text-muted-foreground hover:text-DilMart-store-gold"
                  onClick={() => void handleWhatsAppIntent("inquiry")}
                >
                  استفسار عن المنتج
                </Button>
              </div>
            </div>
          </div>

          {suggested.length > 0 ? (
            <section className="mt-20 border-t border-DilMart-store-gold/10 pt-14">
              <div className="mb-8 text-right">
                <h2 className="font-display text-2xl font-semibold">قد يعجبك أيضاً</h2>
                <p className="mt-1 text-sm text-muted-foreground">من نفس الفئة</p>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
                {suggested.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <Footer />
      {dialogNode}
    </div>
  );
}

export default ProductDetail;
