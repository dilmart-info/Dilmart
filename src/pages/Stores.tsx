import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useMemo, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { parseStoresSort, type MarketplaceMerchantCard, type StoresSort } from "@/lib/marketplace-stores.types";
import { Store, TriangleAlert } from "lucide-react";

const PAGE_SIZE = 24;

function sortLabelAr(sort: StoresSort): string {
  if (sort === "newest") return "الأحدث";
  if (sort === "name") return "الاسم (أ–ي)";
  return "مميز أولاً";
}

function StoresGridSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4 md:p-6" aria-busy="true" aria-label="جاري التحميل">
      <Skeleton className="min-h-[22rem] w-full rounded-xl bg-muted/40 md:min-h-[28rem]" />
    </div>
  );
}

function MerchantDiscoveryCard({ m }: { m: MarketplaceMerchantCard }) {
  return (
    <Link
      to={`/store/${m.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] bg-muted/30">
        {m.logo_url ? (
          <img src={m.logo_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-2xl font-semibold text-muted-foreground">
            {m.display_name.slice(0, 2)}
          </div>
        )}
        {m.is_featured ? (
          <span className="absolute left-3 top-3 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary backdrop-blur-sm">
            مميز
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4 text-right">
        <h2 className="font-display text-lg font-bold leading-snug text-foreground group-hover:text-primary transition-colors">
          {m.display_name}
        </h2>
        <p className="mt-2 text-xs font-medium text-muted-foreground">زيارة المتجر</p>
      </div>
    </Link>
  );
}

function StoresErrorState({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-dashed border-destructive/30 bg-card/40 px-6 py-20 text-center"
    >
      <TriangleAlert className="mx-auto h-8 w-8 text-destructive/80" strokeWidth={1.5} aria-hidden />
      <p className="mt-4 text-base font-bold text-foreground">تعذر تحميل المتاجر</p>
      <p className="mt-2 text-sm text-muted-foreground">حدث خطأ أثناء تحميل قائمة المتاجر. حاول مرة أخرى.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={onRetry} disabled={isRetrying} className="rounded-full px-8">
          {isRetrying ? "...جارِ إعادة المحاولة" : "إعادة المحاولة"}
        </Button>
        <Button asChild type="button" variant="outline" className="rounded-full px-8">
          <Link to="/products">تصفّح المنتجات</Link>
        </Button>
      </div>
    </div>
  );
}

export default function Stores() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const sort: StoresSort = parseStoresSort(searchParams.get("sort"));
  const offset = (page - 1) * PAGE_SIZE;

  useEffect(() => {
    document.title = "المتاجر | DILMART";
  }, []);

  const queryKey = useMemo(() => ["marketplace-merchants-list", offset, sort], [offset, sort]);

  const { data: result, isLoading, isError, isFetching, refetch } = useQuery({
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

  const showResultsMeta = !isLoading && !isError && items.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="border-b border-border bg-gradient-to-l from-muted/50 to-background">
          <div className="container py-10 md:py-14">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Store className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <div>
                <h1 className="font-display text-3xl font-black tracking-tight text-foreground md:text-4xl">المتاجر</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">
                  تصفّح المتاجر النشطة على المنصة، واستعرض منتجات كل متجر لشراء ما يناسبك مباشرة.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="container py-8 md:py-10">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-full rounded-full border-border bg-card sm:w-[220px]">
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
          ) : isError ? (
            <StoresErrorState onRetry={() => refetch()} isRetrying={isFetching} />
          ) : items.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
                {items.map((m) => (
                  <MerchantDiscoveryCard key={m.id} m={m} />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="rounded-full px-5 py-2 text-sm"
                  >
                    السابق
                  </Button>
                  <span className="text-sm font-medium text-muted-foreground">
                    صفحة {page} من {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="rounded-full px-5 py-2 text-sm"
                  >
                    التالي
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
              <p className="text-base font-bold text-foreground">لا توجد متاجر معروضة حالياً.</p>
              <p className="mt-2 text-sm text-muted-foreground">يمكنك تصفّح المنتجات من جميع المتاجر عبر صفحة المنتجات.</p>
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
