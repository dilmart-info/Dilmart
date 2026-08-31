import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { formatPrice } from "@/lib/format";
import { useWishlistStore } from "@/lib/wishlist-store";
import {
  ShoppingBag,
  MessageCircle,
  ChevronLeft,
  Heart,
  Gift,
  Truck,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  Minus,
  Plus,
  Share2,
  Sparkles,
  ShieldCheck,
  Store,
  Tag,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect, useCallback, useRef } from "react";
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
      <div className="flex min-h-screen flex-col bg-background selection:bg-primary selection:text-white" dir="rtl">
        <Header />
        <main className="flex-1 container py-6 md:py-10">
          <div className="mb-6 flex items-center gap-2">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-28 rounded" />
          </div>
          <div className="grid gap-8 md:grid-cols-12 md:gap-12">
            <div className="md:col-span-6 space-y-4">
              <Skeleton className="aspect-square w-full rounded-2xl bg-muted/40" />
              <div className="flex gap-3">
                <Skeleton className="h-16 w-16 rounded-xl bg-muted/30" />
                <Skeleton className="h-16 w-16 rounded-xl bg-muted/30" />
                <Skeleton className="h-16 w-16 rounded-xl bg-muted/30" />
              </div>
            </div>
            <div className="md:col-span-6 space-y-5">
              <Skeleton className="h-8 w-3/4 rounded-xl bg-muted/40" />
              <Skeleton className="h-5 w-1/3 rounded bg-muted/30" />
              <Skeleton className="h-9 w-1/2 rounded-xl bg-muted/40" />
              <Skeleton className="h-24 w-full rounded-2xl bg-muted/30" />
              <div className="flex gap-4 pt-4">
                <Skeleton className="h-12 flex-1 rounded-xl bg-muted/40" />
                <Skeleton className="h-12 w-12 rounded-xl bg-muted/30" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="flex min-h-screen flex-col bg-background selection:bg-primary selection:text-white" dir="rtl">
        <Header />
        <main className="flex-1 container py-20 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <AlertCircle size={32} />
          </div>
          <h1 className="font-tajawal text-2xl md:text-3xl font-black text-navy">المنتج غير موجود</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            قد يكون الرابط غير صحيح أو تم إيقاف توفر هذا المنتج مؤقتاً.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild className="rounded-xl bg-primary hover:bg-primary-hover font-bold text-xs h-10 px-6">
              <Link to="/products">العودة للمنتجات</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl border-border font-bold text-xs h-10 px-6">
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
  const { addItem: addToWishlist, removeItem: removeFromWishlist, hasItem: isInWishlist } = useWishlistStore();
  const [selectedImage, setSelectedImage] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [quantity, setQuantity] = useState(1);
  const addToCartBtnRef = useRef<HTMLButtonElement | null>(null);

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
        if (!product.category_id) return MARKETPLACE_EMPTY_SUGGESTED;
        return await apiClient.getMarketplaceSuggested({
          category_id: product.category_id,
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
    setQuantity(1);
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
  const images = product.images && product.images.length > 0 ? product.images : [PLACEHOLDER_IMG];
  const productUrl = `${window.location.origin}/product/${product.slug}`;
  const isOutOfStock = product.stock !== null && product.stock <= 0;
  const isLowStock = product.stock !== null && product.stock > 0 && product.stock <= 5;
  const maxAvailableQuantity = product.stock !== null && product.stock > 0 ? Math.min(product.stock, 99) : 99;

  const inWishlist = isInWishlist(product.id);

  const handleWishlistToggle = () => {
    if (inWishlist) {
      removeFromWishlist(product.id);
      toast.success("تمت الإزالة من المفضلة");
    } else {
      addToWishlist(product.id, { sourceSurface: "product_detail" });
      toast.success("تمت الإضافة إلى المفضلة");
    }
  };

  const handleAddToCart = (targetEl?: HTMLElement | null) => {
    if (isOutOfStock) return;
    const trigger = targetEl ?? addToCartBtnRef.current;
    attemptAdd(
      product,
      trigger,
      () => {
        if (trigger) triggerCartAnimation(trigger);
        toast.success(`تمت إضافة ${quantity > 1 ? `${quantity} قطع` : "المنتج"} إلى السلة`);
      },
      quantity,
    );
  };

  const handleQuantityDecrease = () => {
    setQuantity((q) => Math.max(1, q - 1));
  };

  const handleQuantityIncrease = () => {
    setQuantity((q) => Math.min(maxAvailableQuantity, q + 1));
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          url: productUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      navigator.clipboard.writeText(productUrl);
      toast.success("تم نسخ رابط المنتج");
    }
  };

  const handleWhatsAppInquiry = async () => {
    try {
      await startTrackedWhatsAppIntent({
        merchantId: product.merchant_id,
        merchantName: merchantEmbed?.display_name ?? "",
        sourceSurface: "product",
        product: { id: product.id, name: product.name },
        completionLink: productUrl,
      });
    } catch (error: any) {
      toast.error(error?.message || "تعذّر فتح واتساب حالياً");
    }
  };

  // Build clean specifications list from actual available contract fields
  const specs = [
    product.brand ? { label: "العلامة التجارية", value: String(product.brand).trim() } : null,
    product.dimensions ? { label: "الأبعاد", value: String(product.dimensions).trim() } : null,
    product.weight_grams
      ? {
          label: "الوزن",
          value:
            product.weight_grams >= 1000
              ? `${(product.weight_grams / 1000).toFixed(1)} كغ`
              : `${product.weight_grams} غرام`,
        }
      : null,
    product.colors && product.colors.length > 0
      ? { label: "الألوان المتوفرة", value: product.colors.join("، ") }
      : null,
    product.sizes && product.sizes.length > 0
      ? { label: "المقاسات المتوفرة", value: product.sizes.join("، ") }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const discountPercentage = hasDiscount
    ? Math.round(((product.price - product.discount_price!) / product.price) * 100)
    : 0;

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary selection:text-white" dir="rtl">
      {dialogNode}
      <Header />

      <main className="flex-1 pb-24 md:pb-16">
        {/* 1. Breadcrumbs Nav */}
        <div className="border-b border-border/70 bg-white shadow-xs">
          <div className="container py-3 md:py-4">
            <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground font-medium" aria-label="مسار المنتج">
              <Link to="/" className="hover:text-primary transition-colors">
                الرئيسية
              </Link>
              <ChevronLeft size={13} className="text-muted-foreground/60" />
              <Link to="/products" className="hover:text-primary transition-colors">
                المنتجات
              </Link>
              {merchantEmbed?.slug ? (
                <>
                  <ChevronLeft size={13} className="text-muted-foreground/60" />
                  <Link
                    to={`/store/${merchantEmbed.slug}`}
                    className="hover:text-primary transition-colors line-clamp-1 max-w-[140px]"
                  >
                    {merchantEmbed.display_name}
                  </Link>
                </>
              ) : null}
              <ChevronLeft size={13} className="text-muted-foreground/60" />
              <span className="font-bold text-navy line-clamp-1 max-w-[200px] sm:max-w-md">{product.name}</span>
            </nav>
          </div>
        </div>

        {/* 2. Product Main Container: Gallery + Identity & Purchase Panel */}
        <div className="container py-6 md:py-10">
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
            {/* Gallery Column (Desktop: 6 cols, Mobile: full width) */}
            <div className="lg:col-span-6 space-y-4">
              {/* Main Image Container */}
              <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-white p-3 shadow-xs">
                {/* Discount & Status Badges */}
                <div className="absolute top-5 right-5 z-10 flex flex-col gap-1.5">
                  {hasDiscount && (
                    <span className="inline-flex items-center rounded-lg bg-accent px-2.5 py-1 text-xs font-black text-white shadow-sm">
                      خصم %{discountPercentage}
                    </span>
                  )}
                </div>

                {/* Wishlist & Share Quick Actions */}
                <div className="absolute top-5 left-5 z-10 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleWishlistToggle}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 backdrop-blur-xs border border-border/60 shadow-xs transition-all ${
                      inWishlist ? "text-rose-600" : "text-muted-foreground hover:text-rose-600"
                    }`}
                    aria-label={inWishlist ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                  >
                    <Heart size={18} fill={inWishlist ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 backdrop-blur-xs border border-border/60 shadow-xs text-muted-foreground hover:text-navy transition-all"
                    aria-label="مشاركة المنتج"
                  >
                    <Share2 size={16} />
                  </button>
                </div>

                {/* Main Image */}
                <div className="aspect-square w-full overflow-hidden rounded-xl bg-slate-50 flex items-center justify-center">
                  <img
                    src={displaySrc(images[selectedImage])}
                    alt={product.name}
                    onError={() => onImgError(images[selectedImage])}
                    className="h-full w-full object-contain md:object-cover transition-all duration-300"
                  />
                </div>
              </div>

              {/* Thumbnails Row */}
              {images.length > 1 && (
                <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedImage(idx)}
                      className={`relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-white p-1 transition-all ${
                        idx === selectedImage
                          ? "border-primary ring-2 ring-primary/20 shadow-xs"
                          : "border-border/70 opacity-70 hover:opacity-100 hover:border-primary/40"
                      }`}
                      aria-label={`عرض الصورة ${idx + 1}`}
                    >
                      <img
                        src={displaySrc(img)}
                        alt=""
                        onError={() => onImgError(img)}
                        className="h-full w-full object-cover rounded-lg"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Purchase & Details Column (Desktop: 6 cols) */}
            <div className="lg:col-span-6 space-y-6">
              {/* Identity Header: Title, Brand, Store & Stock */}
              <div className="space-y-3">
                {/* Brand & Stock Row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {String(product.brand ?? "").trim() ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-navy">
                      <Tag size={12} className="text-primary" />
                      <span>{String(product.brand).trim()}</span>
                    </span>
                  ) : <span />}

                  {/* Stock Status Badge */}
                  {isOutOfStock ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2.5 py-1 text-xs font-bold text-rose-700">
                      <AlertCircle size={13} />
                      <span>نفد من المخزون</span>
                    </span>
                  ) : isLowStock ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-bold text-amber-700">
                      <Clock size={13} />
                      <span>متبقي كمية محدودة ({product.stock} فقط)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 size={13} />
                      <span>متوفر في المخزون</span>
                    </span>
                  )}
                </div>

                {/* H1 Title */}
                <h1 className="font-tajawal text-xl sm:text-2xl lg:text-3xl font-black text-navy leading-tight">
                  {product.name}
                </h1>

                {/* Merchant Link */}
                {merchantEmbed?.slug ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Store size={14} className="text-primary" />
                    <span>يُباع ويُشحن بواسطة:</span>
                    <Link
                      to={`/store/${merchantEmbed.slug}`}
                      className="font-bold text-primary hover:underline"
                    >
                      {merchantEmbed.display_name}
                    </Link>
                  </div>
                ) : null}

                {/* Short Description */}
                {String(product.short_description ?? "").trim() ? (
                  <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground pt-1">
                    {String(product.short_description).trim()}
                  </p>
                ) : null}
              </div>

              {/* Price Panel */}
              <div className="rounded-2xl border border-border/80 bg-slate-50/50 p-4 space-y-2">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-tajawal text-2xl sm:text-3xl lg:text-4xl font-black text-navy">
                    {formatPrice(hasDiscount ? product.discount_price! : product.price)}
                  </span>
                  {hasDiscount && (
                    <>
                      <span className="text-base sm:text-lg text-muted-foreground line-through font-medium">
                        {formatPrice(product.price)}
                      </span>
                      <span className="rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-black text-accent">
                        وفر %{discountPercentage}
                      </span>
                    </>
                  )}
                </div>

                {/* Loyalty Info Note (Informational only — No fake client formula) */}
                {product.loyalty_points_enabled !== false && !isOutOfStock && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 pt-1">
                    <Gift size={14} className="text-emerald-600" />
                    <span>قد تحصل على نقاط مكافآت عند إتمام الشراء</span>
                  </div>
                )}
              </div>

              {/* Informational Product Attributes (Colors & Sizes) */}
              {(product.colors?.length || product.sizes?.length) ? (
                <div className="space-y-3.5 border-t border-border/60 pt-4">
                  {/* Colors List */}
                  {product.colors && product.colors.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-navy">الألوان المتوفرة:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {product.colors.map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center rounded-lg border border-border/80 bg-white px-2.5 py-1 text-xs font-medium text-navy"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sizes List */}
                  {product.sizes && product.sizes.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-navy">المقاسات المتوفرة:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {product.sizes.map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center rounded-lg border border-border/80 bg-white px-2.5 py-1 text-xs font-medium text-navy"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Quantity Stepper & Add to Cart Action */}
              <div className="space-y-4 border-t border-border/60 pt-4">
                {!isOutOfStock && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-navy">الكمية:</span>
                    <div className="flex items-center rounded-xl border border-border bg-white shadow-2xs">
                      <button
                        type="button"
                        onClick={handleQuantityDecrease}
                        disabled={quantity <= 1}
                        className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-navy disabled:opacity-40 transition-colors"
                        aria-label="تقليل الكمية"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-10 text-center text-sm font-bold text-navy" data-testid="product-quantity-display">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={handleQuantityIncrease}
                        disabled={quantity >= maxAvailableQuantity}
                        className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-navy disabled:opacity-40 transition-colors"
                        aria-label="زيادة الكمية"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Primary & Secondary Action CTAs */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    ref={addToCartBtnRef}
                    type="button"
                    onClick={() => handleAddToCart()}
                    disabled={isOutOfStock}
                    className="h-12 flex-1 rounded-xl bg-primary hover:bg-primary-hover font-bold text-sm text-white gap-2 shadow-xs disabled:opacity-50"
                  >
                    <ShoppingBag size={18} strokeWidth={2} />
                    <span>{isOutOfStock ? "نفد من المخزون" : "أضف إلى السلة"}</span>
                  </Button>

                  {/* Secondary WhatsApp Inquiry */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleWhatsAppInquiry}
                    className="h-12 rounded-xl border-border hover:bg-slate-50 font-bold text-xs text-navy gap-2"
                  >
                    <MessageCircle size={18} className="text-emerald-600" />
                    <span>استفسار عبر واتساب</span>
                  </Button>
                </div>
              </div>

              {/* Neutral Delivery & Trust Highlights */}
              <div className="rounded-2xl border border-border/80 bg-white p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-3 text-xs text-navy font-medium">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Truck size={16} />
                  </div>
                  <span>توصيل موثوق — تفاصيل التوصيل تظهر أثناء إتمام الطلب</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-navy font-medium">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CreditCard size={16} />
                  </div>
                  <span>خيارات دفع متاحة عند إتمام الطلب</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-navy font-medium">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ShieldCheck size={16} />
                  </div>
                  <span>تسوق آمن ومباشر من المتجر المعتمد</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Description & Specifications Section */}
          <div className="mt-12 space-y-6">
            <div className="border-b border-border/80 pb-3">
              <h2 className="font-tajawal text-lg sm:text-xl font-black text-navy">
                تفاصيل ومواصفات المنتج
              </h2>
            </div>

            <div className="grid gap-8 lg:grid-cols-12">
              {/* Full Description */}
              <div className="lg:col-span-7 space-y-3">
                <h3 className="text-sm font-bold text-navy">وصف المنتج</h3>
                <div className="rounded-2xl border border-border/80 bg-white p-5 text-xs sm:text-sm leading-relaxed text-muted-foreground whitespace-pre-line shadow-xs">
                  {product.description || product.short_description || "لا يوجد وصف إضافي متوفر لهذا المنتج حالياً."}
                </div>
              </div>

              {/* Specifications Table (Built only from real existing fields) */}
              <div className="lg:col-span-5 space-y-3">
                <h3 className="text-sm font-bold text-navy">المواصفات الفنية</h3>
                {specs.length > 0 ? (
                  <div className="overflow-hidden rounded-2xl border border-border/80 bg-white shadow-xs">
                    <table className="w-full text-right text-xs">
                      <tbody>
                        {specs.map((spec, idx) => (
                          <tr
                            key={spec.label}
                            className={idx % 2 === 0 ? "bg-slate-50/60" : "bg-white"}
                          >
                            <td className="py-3 px-4 font-bold text-navy border-b border-border/50 w-1/3">
                              {spec.label}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground border-b border-border/50">
                              {spec.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border/80 bg-white p-5 text-center text-xs text-muted-foreground shadow-xs">
                    المواصفات الأساسية موضحة في الوصف أعلاه.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Suggested Products Section */}
          {suggested.length > 0 && (
            <div className="mt-16 space-y-6">
              <div className="flex items-center justify-between border-b border-border/80 pb-3">
                <h2 className="font-tajawal text-lg sm:text-xl font-black text-navy flex items-center gap-2">
                  <Sparkles size={18} className="text-primary" />
                  <span>منتجات قد تعجبك</span>
                </h2>
                <Link
                  to="/products"
                  className="text-xs font-bold text-primary hover:underline"
                >
                  عرض الكل
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {suggested.map((item) => (
                  <ProductCard key={item.id} product={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 5. Mobile Sticky Purchase Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-border/80 p-3 shadow-lg" dir="rtl">
        <div className="container flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] text-muted-foreground font-medium block">السعر</span>
            <span className="font-tajawal text-lg font-black text-navy">
              {formatPrice(hasDiscount ? product.discount_price! : product.price)}
            </span>
          </div>

          <Button
            type="button"
            onClick={() => handleAddToCart()}
            disabled={isOutOfStock}
            className="h-11 flex-1 max-w-[200px] rounded-xl bg-primary hover:bg-primary-hover font-bold text-xs text-white gap-2 shadow-xs disabled:opacity-50"
          >
            <ShoppingBag size={16} strokeWidth={2} />
            <span>{isOutOfStock ? "نفد من المخزون" : "أضف إلى السلة"}</span>
          </Button>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default ProductDetail;
