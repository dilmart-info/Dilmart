import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import ProductCard from "@/components/ProductCard";
import { useWishlistStore } from "@/lib/wishlist-store";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { useEffect, useMemo } from "react";
import { trackGrowthHookEvent } from "@/lib/growth-hooks";
import AccountRecommendations from "@/components/AccountRecommendations";
import { Heart, Info, TriangleAlert, Trash2 } from "lucide-react";

export default function Wishlist() {
  const { items, removeItems } = useWishlistStore();

  useEffect(() => {
    document.title = "المفضلة | DILMART";
    trackGrowthHookEvent("wishlist.opened", {
      sourceSurface: "wishlist_page",
      path: "/wishlist",
    });
  }, []);

  const {
    data: products,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["wishlist-products", items],
    queryFn: async () => {
      if (items.length === 0) return [];
      return apiClient.getMarketplaceProductsByIds(items);
    },
    enabled: items.length > 0,
  });

  const productList = products ?? [];

  // Determine unavailable items (IDs in local storage but omitted by marketplace API)
  const unavailableIds = useMemo(() => {
    if (isLoading || isError || items.length === 0) return [];
    const availableSet = new Set(productList.map((p) => p.id));
    return items.filter((id) => !availableSet.has(id));
  }, [items, productList, isLoading, isError]);

  const handleRemoveUnavailable = () => {
    if (unavailableIds.length > 0) {
      removeItems(unavailableIds, { sourceSurface: "wishlist_cleanup" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container py-8 md:py-12">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Heart className="h-5 w-5 fill-primary/20" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground md:text-3xl">قائمة المفضلة</h1>
              {items.length > 0 && !isLoading && !isError ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {productList.length} منتج محفوظ
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-card/40">
            <Heart className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-base font-bold text-foreground mb-1">قائمة المفضلة فارغة</p>
            <p className="text-sm text-muted-foreground mb-6">
              لم تقم بحفظ أي منتجات في المفضلة بعد. تصفّح المنتجات واحفظ ما يعجبك.
            </p>
            <Button asChild className="rounded-full px-8">
              <Link to="/products">تصفّح المنتجات</Link>
            </Button>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {[...Array(items.length || 4)].map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-2xl bg-muted/40" />
            ))}
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="text-center py-16 rounded-2xl border border-dashed border-destructive/30 bg-card/40 p-6"
          >
            <TriangleAlert className="mx-auto h-8 w-8 text-destructive/80 mb-3" />
            <p className="text-base font-bold text-foreground mb-1">تعذر تحميل عناصر المفضلة</p>
            <p className="text-sm text-muted-foreground mb-6">
              حدث خطأ أثناء جلب تفاصيل المنتجات المحفوظة. العناصر المحفوظة لا تزال بأمان.
            </p>
            <div className="flex justify-center gap-3">
              <Button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="rounded-full px-8"
              >
                {isFetching ? "...جارِ إعادة المحاولة" : "إعادة المحاولة"}
              </Button>
              <Button asChild variant="outline" className="rounded-full px-8">
                <Link to="/products">تصفّح المنتجات</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Unavailable products banner */}
            {unavailableIds.length > 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-muted/60 border border-border rounded-xl text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info size={18} className="shrink-0 text-primary" />
                  <span>بعض المنتجات المحفوظة لم تعد متاحة حالياً ({unavailableIds.length}).</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveUnavailable}
                  className="shrink-0 gap-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg"
                >
                  <Trash2 size={14} />
                  <span>إزالة العناصر غير المتاحة</span>
                </Button>
              </div>
            ) : null}

            {productList.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {productList.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 rounded-2xl border border-dashed border-border bg-card/30">
                <p className="text-sm text-muted-foreground mb-4">
                  جميع المنتجات المحفوظة لم تعد متاحة حالياً.
                </p>
                <Button asChild className="rounded-full px-8">
                  <Link to="/products">تصفّح المنتجات المتاحة</Link>
                </Button>
              </div>
            )}
          </div>
        )}

        <AccountRecommendations
          title="اكتشافات قد تعجبك"
          subtitle="اقتراحات إضافية قد تهمك"
        />
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
