import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { storeConfig } from "@/config/store";
import { apiClient } from "@/lib/api-client";
import { parseStoresSort, type MarketplaceMerchantCard, type StoresSort } from "@/lib/marketplace-stores.types";
import { Store } from "lucide-react";

const PAGE_SIZE = 24;

function sortLabelAr(sort: StoresSort): string {
  if (sort === "newest") return "الأحدث";
  if (sort === "name") return "الاسم (أ–ي)";
  return "مميز أولاً";
}

/** M2.5 — single grid-level placeholder while merchants list loads. */
function StoresGridSkeleton() {
  return (
    <div className="rounded-2xl border border-DilMart-store-gold/10 bg-card/20 p-4 md:p-6" aria-busy="true" aria-label="جاري التحميل">
      <Skeleton className="min-h-[22rem] w-full rounded-xl bg-muted/35 md:min-h-[28rem]" />
    </div>
  );
}

function MerchantDiscoveryCard({ m }: { m: MarketplaceMerchantCard }) {
  return (
    <Link
      to={`/store/${m.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-DilMart-store-gold/12 bg-card text-card-foreground shadow-sm transition-all hover:border-DilMart-store-gold/35 hover:shadow-lg"
    >
      <div className="relative aspect-[4/3] bg-muted/40">
        {m.logo_url ? (
          <img src={m.logo_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-2xl font-semibold text-muted-foreground">
            {m.display_name.slice(0, 2)}
          </div>
        )}
        {m.is_featured ? (
          <span className="absolute left-3 top-3 rounded-full border border-DilMart-store-gold/30 bg-background/90 px-2.5 py-0.5 text-[10px] font-medium text-DilMart-store-gold-bright backdrop-blur-sm">
            مميز
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4 text-right">
        <h2 className="font-display text-lg font-semibold leading-snug text-foreground group-hover:text-DilMart-store-gold-bright">{m.display_name}</h2>
        <p className="mt-2 text-xs text-muted-foreground">زيارة المتجر</p>
      </div>
    </Link>
  );
}

export default function Stores() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const sort: StoresSort = parseStoresSort(searchParams.get("sort"));
  const offset = (page - 1) * PAGE_SIZE;

  const queryKey = useMemo(() => ["marketplace-merchants-list", offset, sort], [offset, sort]);

  const { data: result, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      apiClient.getMarketplaceMerchantsList({
        offset,
        limit: PAGE_SIZE,
        sort,
      }),
  });

  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setPage = (next: number) => {
    const p = new URLSearchParams(searchParams);
    if (next <= 1) p.delete("page");
    else p.set("page", String(next));
    setSearchParams(p);
  };

  const setSort = (next: string) => {
    const p = new URLSearchParams(searchParams);
    const s: StoresSort = parseStoresSort(next);
    if (s === "featured") p.delete("sort");
    else p.set("sort", s);
    p.delete("page");
    setSearchParams(p);
  };

  const showResultsMeta = !isLoading && items.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="border-b border-DilMart-store-gold/10 bg-gradient-to-l from-card/80 to-background">
          <div className="container py-10 md:py-14">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.28em] text-DilMart-store-gold">{storeConfig.brand.en}</p>
            <div className="flex flex-wrap items-end gap-4">
              <Store className="h-10 w-10 text-DilMart-store-gold/80" strokeWidth={1.25} />
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">المتاجر</h1>
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground leading-relaxed">
                  تصفّح المتاجر النشطة على المنصة — اختر الترتيب المناسب، ثم ادخل إلى متجرك لعرض منتجاته وشرائها.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="container py-8 md:py-10">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-full rounded-full border-DilMart-store-gold/20 bg-card/80 sm:w-[220px]">
                <SelectValue placeholder="الترتيب" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">مميز أولاً</SelectItem>
                <SelectItem value="newest">الأحدث</SelectItem>
                <SelectItem value="name">الاسم (أ–ي)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showResultsMeta && (
            <div className="mb-6 space-y-1 text-sm text-muted-foreground">
              <p>
                عرض {items.length} من {total} متجر
                {totalPages > 1 ? ` · صفحة ${page} من ${totalPages}` : ""}
              </p>
              <p className="text-xs">الترتيب الحالي: {sortLabelAr(sort)}</p>
            </div>
          )}

          {isLoading ? (
            <StoresGridSkeleton />
          ) : items.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
                {items.map((m) => (
                  <MerchantDiscoveryCard key={m.id} m={m} />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="rounded-full border border-DilMart-store-gold/20 px-4 py-2 text-sm disabled:opacity-40"
                  >
                    السابق
                  </button>
                  <span className="text-sm text-muted-foreground">
                    صفحة {page} من {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="rounded-full border border-DilMart-store-gold/20 px-4 py-2 text-sm disabled:opacity-40"
                  >
                    التالي
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-DilMart-store-gold/20 bg-card/30 px-6 py-20 text-center">
              <p className="text-muted-foreground">لا توجد متاجر نشطة معروضة حالياً.</p>
              <p className="mt-2 text-sm text-muted-foreground">يمكنك تصفّح المنتجات من جميع المتاجر عبر صفحة المجموعة.</p>
              <Button asChild className="mt-8 rounded-full px-8">
                <Link to="/products">تصفّح المنتجات</Link>
              </Button>
            </div>
          )}
        </div>
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
