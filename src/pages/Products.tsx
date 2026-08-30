import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import ProductCard from "@/components/ProductCard";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useEffect, useCallback, useState, useRef } from "react";
import { storeConfig } from "@/config/store";
import { apiClient } from "@/lib/api-client";
import { parseMarketplaceListSort, type MarketplaceListSort } from "@/lib/marketplace-list.types";
import { buildProductsQueryKey, buildProductsQueryParams } from "@/lib/products-query-key";
import { getEffectiveMarketplaceSearchTerm } from "@/lib/marketplace-search";
import { Button } from "@/components/ui/button";
import { LayoutGrid, SlidersHorizontal } from "lucide-react";
import CategoryTileVisual from "@/components/category/CategoryTileVisual";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  filterRootStorefrontCategories,
  NEUTRAL_CATEGORY_PLACEHOLDER,
  resolveCategoryImageUrl,
  type StorefrontCategory,
} from "@/lib/category-hierarchy";

const PAGE_SIZE = 24;

const LEGACY_LISTING_KEYS = [] as const;

/** M2.4 — dynamic subtitle under H1; search copy uses `effectiveSearchTerm` only. */
function ProductsContextLine({
  effectiveSearchTerm,
  categorySlug,
  categoryName,
  isWeakSearch,
}: {
  effectiveSearchTerm: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  isWeakSearch: boolean;
}) {
  const catLabel = categorySlug ? (categoryName ?? categorySlug) : null;

  if (isWeakSearch) {
    return (
      <div className="mt-3 max-w-2xl space-y-2 text-sm leading-relaxed">
        {catLabel ? (
          <p className="text-muted-foreground">
            منتجات ضمن «<span className="font-medium text-foreground">{catLabel}</span>» — عرض عام دون تصفية بالاسم حتى يكتمل البحث.
          </p>
        ) : (
          <p className="text-muted-foreground">عرض جميع المنتجات المتاحة — لم يُطبَّق بحث بالاسم بعد.</p>
        )}
        <p className="text-amber-800/90 dark:text-amber-200/90">اكتب حرفين على الأقل للبحث</p>
      </div>
    );
  }

  if (effectiveSearchTerm && catLabel) {
    return (
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground leading-relaxed">
        نتائج البحث عن «<span className="font-medium text-foreground">{effectiveSearchTerm}</span>» ضمن «
        <span className="font-medium text-foreground">{catLabel}</span>»
      </p>
    );
  }

  if (effectiveSearchTerm) {
    return (
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground leading-relaxed">
        نتائج البحث عن «<span className="font-medium text-foreground">{effectiveSearchTerm}</span>»
      </p>
    );
  }

  if (catLabel) {
    return (
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground leading-relaxed">
        منتجات ضمن «<span className="font-medium text-foreground">{catLabel}</span>»
      </p>
    );
  }

  return (
    <p className="mt-3 max-w-2xl text-sm text-muted-foreground leading-relaxed">
      تصفّح المنتجات من جميع المتاجر النشطة — اختر القسم، ابحث بالاسم، ورتّب حسب الأحدث أو السعر.
    </p>
  );
}

function EmptyCtaRow({
  onClearSearch,
  onClearCategory,
  onAllProducts,
  showClearSearch,
  showClearCategory,
  showAllProducts,
}: {
  onClearSearch: () => void;
  onClearCategory: () => void;
  onAllProducts: () => void;
  showClearSearch: boolean;
  showClearCategory: boolean;
  showAllProducts: boolean;
}) {
  if (!showClearSearch && !showClearCategory && !showAllProducts) return null;
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {showClearSearch && (
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onClearSearch}>
          مسح البحث
        </Button>
      )}
      {showClearCategory && (
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onClearCategory}>
          مسح القسم
        </Button>
      )}
      {showAllProducts && (
        <Button type="button" variant="default" size="sm" className="rounded-full" onClick={onAllProducts}>
          كل المنتجات
        </Button>
      )}
    </div>
  );
}

function ProductsEmptyState({
  isWeakSearch,
  effectiveSearchTerm,
  categorySlug,
  categoryName,
  onClearSearch,
  onClearCategory,
  onAllProducts,
}: {
  isWeakSearch: boolean;
  effectiveSearchTerm: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  onClearSearch: () => void;
  onClearCategory: () => void;
  onAllProducts: () => void;
}) {
  const catLabel = categoryName ?? categorySlug;

  if (isWeakSearch) {
    return (
      <div className="rounded-2xl border border-dashed border-DilMart-store-gold/20 bg-card/30 px-6 py-20 text-center">
        <p className="text-muted-foreground">لا توجد منتجات في هذا العرض حالياً.</p>
        <p className="mt-3 text-sm text-amber-800/90 dark:text-amber-200/90">اكتب حرفين على الأقل للبحث في اسم المنتج، أو أزل البحث لعرض أوسع.</p>
        <EmptyCtaRow
          onClearSearch={onClearSearch}
          onClearCategory={onClearCategory}
          onAllProducts={onAllProducts}
          showClearSearch
          showClearCategory={!!categorySlug}
          showAllProducts
        />
      </div>
    );
  }

  if (effectiveSearchTerm && categorySlug) {
    return (
      <div className="rounded-2xl border border-dashed border-DilMart-store-gold/20 bg-card/30 px-6 py-20 text-center">
        <p className="text-muted-foreground">
          لا توجد نتائج للبحث عن «<span className="font-medium text-foreground">{effectiveSearchTerm}</span>» ضمن قسم «
          <span className="font-medium text-foreground">{catLabel}</span>».
        </p>
        <p className="mt-2 text-sm text-muted-foreground">جرّب كلمات أخرى أو خفّف التصفية.</p>
        <EmptyCtaRow
          onClearSearch={onClearSearch}
          onClearCategory={onClearCategory}
          onAllProducts={onAllProducts}
          showClearSearch
          showClearCategory
          showAllProducts
        />
      </div>
    );
  }

  if (effectiveSearchTerm) {
    return (
      <div className="rounded-2xl border border-dashed border-DilMart-store-gold/20 bg-card/30 px-6 py-20 text-center">
        <p className="text-muted-foreground">
          لا توجد نتائج للبحث عن «<span className="font-medium text-foreground">{effectiveSearchTerm}</span>».
        </p>
        <p className="mt-2 text-sm text-muted-foreground">جرّب كلمات مختلفة أو امسح البحث.</p>
        <EmptyCtaRow
          onClearSearch={onClearSearch}
          onClearCategory={onClearCategory}
          onAllProducts={onAllProducts}
          showClearSearch
          showClearCategory={false}
          showAllProducts
        />
      </div>
    );
  }

  if (categorySlug) {
    return (
      <div className="rounded-2xl border border-dashed border-DilMart-store-gold/20 bg-card/30 px-6 py-20 text-center">
        <p className="text-muted-foreground">
          لا توجد منتجات في قسم «<span className="font-medium text-foreground">{catLabel}</span>» حالياً.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">يمكنك تصفّح أقسام أخرى أو عرض كل المنتجات.</p>
        <EmptyCtaRow
          onClearSearch={onClearSearch}
          onClearCategory={onClearCategory}
          onAllProducts={onAllProducts}
          showClearSearch={false}
          showClearCategory
          showAllProducts
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-DilMart-store-gold/20 bg-card/30 px-6 py-20 text-center">
      <p className="text-muted-foreground">لا توجد منتجات معروضة حالياً.</p>
      <p className="mt-2 text-sm text-muted-foreground">عد لاحقاً أو جرّب تصفّح الأقسام أعلاه.</p>
      <EmptyCtaRow
        onClearSearch={onClearSearch}
        onClearCategory={onClearCategory}
        onAllProducts={onAllProducts}
        showClearSearch={false}
        showClearCategory={false}
        showAllProducts={false}
      />
    </div>
  );
}

const Products = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const productsStartRef = useRef<HTMLDivElement | null>(null);
  const categorySlug = searchParams.get("category");
  const search = searchParams.get("search");
  const merchantId = searchParams.get("merchant_id");
  const filter = searchParams.get("filter");
  const minPrice = searchParams.get("min_price");
  const maxPrice = searchParams.get("max_price");
  const color = searchParams.get("color");
  const size = searchParams.get("size");
  const brand = searchParams.get("brand");
  const minWeight = searchParams.get("min_weight");
  const maxWeight = searchParams.get("max_weight");
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const sort: MarketplaceListSort = parseMarketplaceListSort(searchParams.get("sort"));

  const offset = (page - 1) * PAGE_SIZE;

  useEffect(() => {
    const p = new URLSearchParams(searchParams);
    let changed = false;
    for (const k of LEGACY_LISTING_KEYS) {
      if (p.has(k)) {
        p.delete(k);
        changed = true;
      }
    }
    if (changed) setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);

  const { data: categories } = useQuery({
    queryKey: ["marketplace-categories"],
    queryFn: () => apiClient.getMarketplaceCategories(),
  });

  // Single source of truth for "what result set is this?" — every value the
  // queryFn actually sends to the API must live here, so it can never drift
  // out of sync with the queryKey (a value present in one but not the other
  // is exactly how a filter change used to silently reuse a stale cache entry).
  // See src/lib/products-query-key.ts for the shared shape/tests.
  const productsListFilters = useMemo(
    () => ({
      categorySlug,
      merchantId,
      filter,
      search,
      sort,
      minPrice,
      maxPrice,
      brand,
      color,
      size,
      minWeight,
      maxWeight,
      offset,
      limit: PAGE_SIZE,
    }),
    [categorySlug, merchantId, filter, search, sort, minPrice, maxPrice, brand, color, size, minWeight, maxWeight, offset],
  );

  const queryKey = useMemo(() => buildProductsQueryKey(productsListFilters), [productsListFilters]);

  const { data: result, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiClient.getMarketplaceProducts(buildProductsQueryParams(productsListFilters)),
  });

  const products = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const categoryName = categorySlug ? (categories?.find((c) => c.slug === categorySlug)?.name ?? null) : null;
  const selectedCategory = categorySlug
    ? ((categories?.find((c) => c.slug === categorySlug) as StorefrontCategory | undefined) ?? null)
    : null;
  const parentCategory = selectedCategory?.parent_id
    ? ((categories?.find((c) => c.id === selectedCategory.parent_id) as StorefrontCategory | undefined) ?? null)
    : null;
  const isRootSelected = Boolean(selectedCategory && !selectedCategory.parent_id);
  const isLeafSelected = Boolean(selectedCategory && selectedCategory.parent_id);
  const childNavCategories = useMemo(() => {
    if (!categories?.length) return [] as StorefrontCategory[];
    if (isRootSelected && selectedCategory) {
      return (categories as StorefrontCategory[])
        .filter((c) => c.parent_id === selectedCategory.id && c.is_active !== false)
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    }
    if (isLeafSelected && parentCategory) {
      return (categories as StorefrontCategory[])
        .filter((c) => c.parent_id === parentCategory.id && c.is_active !== false)
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    }
    return [] as StorefrontCategory[];
  }, [categories, isRootSelected, isLeafSelected, selectedCategory, parentCategory]);
  const showCategoryBrowser = !categorySlug || isRootSelected;
  const browseCategories = useMemo(
    () => filterRootStorefrontCategories((categories as StorefrontCategory[] | undefined) ?? []),
    [categories],
  );
  const stores = useMemo(() => {
    const map = new Map<string, string>();
    (result?.items ?? []).forEach((p: any) => {
      if (p?.merchants?.id && p?.merchants?.display_name) map.set(p.merchants.id, p.merchants.display_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [result?.items]);
  const brands = useMemo(() => {
    const set = new Set<string>();
    (result?.items ?? []).forEach((p: any) => {
      const value = String(p?.brand ?? "").trim();
      if (value) set.add(value);
    });
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b, "ar"));
  }, [result?.items]);

  const effectiveSearchTerm = getEffectiveMarketplaceSearchTerm(search);
  const isWeakSearch = searchParams.has("search") && effectiveSearchTerm === null;

  const baseTitle = isWeakSearch
    ? categorySlug
      ? categoryName ?? "المنتجات"
      : "المجموعة"
    : effectiveSearchTerm && categorySlug
      ? "نتائج البحث"
      : effectiveSearchTerm
        ? "نتائج البحث"
        : categorySlug
          ? categoryName ?? "المنتجات"
          : "المجموعة";

  // A brand-only entry (e.g. the Customer App Gateway brand tile lands on /products?brand=…) must make
  // the active filter obvious instead of reading as the generic collection page. Search and category
  // titles still win — this only names the case where the brand IS the whole filter.
  const title = !effectiveSearchTerm && !categorySlug && brand ? `منتجات ${brand}` : baseTitle;

  const clearSearch = useCallback(() => {
    const p = new URLSearchParams(searchParams);
    p.delete("search");
    p.delete("page");
    setSearchParams(p);
  }, [searchParams, setSearchParams]);

  const clearCategory = useCallback(() => {
    const p = new URLSearchParams(searchParams);
    p.delete("category");
    p.delete("page");
    setSearchParams(p);
  }, [searchParams, setSearchParams]);

  const allProducts = useCallback(() => {
    const p = new URLSearchParams(searchParams);
    p.delete("search");
    p.delete("category");
    p.delete("page");
    setSearchParams(p);
  }, [searchParams, setSearchParams]);

  const applyAdvancedFilters = useCallback(
    (payload: {
      merchant_id?: string;
      filter?: string;
      min_price?: string;
      max_price?: string;
      brand?: string;
      color?: string;
      size?: string;
      min_weight?: string;
      max_weight?: string;
      sort?: string;
    }) => {
      const p = new URLSearchParams(searchParams);
      const setOrDelete = (key: string, value?: string) => {
        if (value && value.trim().length > 0) p.set(key, value.trim());
        else p.delete(key);
      };
      setOrDelete("merchant_id", payload.merchant_id);
      setOrDelete("filter", payload.filter);
      setOrDelete("min_price", payload.min_price);
      setOrDelete("max_price", payload.max_price);
      setOrDelete("brand", payload.brand);
      setOrDelete("color", payload.color);
      setOrDelete("size", payload.size);
      setOrDelete("min_weight", payload.min_weight);
      setOrDelete("max_weight", payload.max_weight);
      if (payload.sort) {
        const nextSort = parseMarketplaceListSort(payload.sort);
        if (nextSort === "newest") p.delete("sort");
        else p.set("sort", nextSort);
      }
      p.delete("page");
      setSearchParams(p);
      setFiltersOpen(false);
    },
    [searchParams, setSearchParams],
  );

  const resetAdvancedFilters = useCallback(() => {
    const p = new URLSearchParams(searchParams);
    ["merchant_id", "filter", "min_price", "max_price", "brand", "color", "size", "min_weight", "max_weight"].forEach((key) => p.delete(key));
    p.delete("page");
    setSearchParams(p);
    setFiltersOpen(false);
  }, [searchParams, setSearchParams]);

  const setPage = (next: number) => {
    const p = new URLSearchParams(searchParams);
    if (next <= 1) p.delete("page");
    else p.set("page", String(next));
    setSearchParams(p);
  };

  const setSort = (next: string) => {
    const p = new URLSearchParams(searchParams);
    const s = parseMarketplaceListSort(next);
    if (s === "newest") p.delete("sort");
    else p.set("sort", s);
    p.delete("page");
    setSearchParams(p);
  };

  const showResultsCount = !isLoading && products.length > 0 && !isWeakSearch;

  useEffect(() => {
    if (!categorySlug) return;
    if (isRootSelected && childNavCategories.length > 0) return;
    productsStartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [categorySlug, isRootSelected, childNavCategories.length]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="border-b border-DilMart-store-gold/10 bg-gradient-to-l from-card/80 to-background">
          <div className="container py-10 md:py-14">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.28em] text-DilMart-store-gold">{storeConfig.brand.en}</p>
            {isLeafSelected && parentCategory ? (
              <nav className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground" dir="rtl" aria-label="مسار القسم">
                <button
                  type="button"
                  className="hover:text-DilMart-store-gold"
                  onClick={() => {
                    const p = new URLSearchParams(searchParams);
                    p.set("category", parentCategory.slug);
                    p.delete("page");
                    setSearchParams(p);
                  }}
                >
                  {parentCategory.name}
                </button>
                <span aria-hidden>›</span>
                <span className="text-foreground">{selectedCategory?.name}</span>
              </nav>
            ) : null}
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{title}</h1>
            <ProductsContextLine
              effectiveSearchTerm={effectiveSearchTerm}
              categorySlug={categorySlug}
              categoryName={categoryName}
              isWeakSearch={isWeakSearch}
            />
          </div>
        </div>

        <div className="container py-8 md:py-10">
          <div ref={productsStartRef} className="mb-8 space-y-4">
            {childNavCategories.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1" dir="rtl">
                <button
                  type="button"
                  onClick={() => {
                    const p = new URLSearchParams(searchParams);
                    const rootSlug = isLeafSelected ? parentCategory?.slug : selectedCategory?.slug;
                    if (rootSlug) p.set("category", rootSlug);
                    else p.delete("category");
                    p.delete("page");
                    setSearchParams(p);
                  }}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                    isRootSelected
                      ? "border-DilMart-store-gold/50 bg-DilMart-store-gold/20 text-foreground"
                      : "border-DilMart-store-gold/20 bg-card/70 text-muted-foreground"
                  }`}
                >
                  الكل
                </button>
                {childNavCategories.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      const p = new URLSearchParams(searchParams);
                      p.set("category", sub.slug);
                      p.delete("page");
                      setSearchParams(p);
                    }}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                      categorySlug === sub.slug
                        ? "border-DilMart-store-gold/50 bg-DilMart-store-gold/20 text-foreground"
                        : "border-DilMart-store-gold/20 bg-card/70 text-muted-foreground"
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            ) : null}

            {showCategoryBrowser ? (
              <div className="grid grid-cols-4 gap-x-2 gap-y-4 md:grid-cols-6 md:gap-x-3 lg:grid-cols-8 xl:grid-cols-12">
                <button
                  type="button"
                  onClick={() => {
                    const p = new URLSearchParams(searchParams);
                    p.delete("category");
                    p.delete("page");
                    setSearchParams(p);
                  }}
                  className="group block text-center"
                  aria-label="كل الأقسام"
                >
                  <span
                    className={`flex aspect-[1/1.05] w-full items-center justify-center rounded-2xl bg-card/80 ${
                      !categorySlug ? "ring-2 ring-DilMart-store-gold" : "ring-1 ring-DilMart-store-gold/20"
                    }`}
                  >
                    <LayoutGrid size={22} className="text-DilMart-store-gold" aria-hidden />
                  </span>
                  <span className="mt-2 block text-center text-[12px] font-semibold leading-[1.35] text-foreground">
                    الكل
                  </span>
                </button>
                {(isRootSelected ? childNavCategories : browseCategories).map((cat) => {
                  const imageSrc = resolveCategoryImageUrl(
                    cat,
                    cat.parent_id
                      ? ((categories as StorefrontCategory[] | undefined)?.find((c) => c.id === cat.parent_id) ?? null)
                      : null,
                  );
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        const p = new URLSearchParams(searchParams);
                        p.set("category", cat.slug);
                        p.delete("page");
                        setSearchParams(p);
                      }}
                      className="group block text-center"
                      aria-label={cat.name}
                      title={cat.name}
                    >
                      <CategoryTileVisual
                        category={{ ...cat, icon_url: null, image_url: imageSrc }}
                        fallbackImage={NEUTRAL_CATEGORY_PLACEHOLDER}
                        selected={categorySlug === cat.slug}
                        labelClassName="text-[11px] md:text-[12px]"
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="flex items-center justify-start gap-2" dir="rtl">
              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="rounded-full gap-2 border-DilMart-store-gold/25">
                    <SlidersHorizontal size={16} />
                    فلاتر شاملة
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle className="text-right">الفلاتر الشاملة</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4 grid gap-4">
                    <div className="space-y-2">
                      <Label>المتجر</Label>
                      <Select
                        value={merchantId ?? "all"}
                        onValueChange={(v) =>
                          applyAdvancedFilters({
                            merchant_id: v === "all" ? "" : v,
                            filter: filter ?? "",
                            min_price: minPrice ?? "",
                            max_price: maxPrice ?? "",
                            brand: brand ?? "",
                            color: color ?? "",
                            size: size ?? "",
                            min_weight: minWeight ?? "",
                            max_weight: maxWeight ?? "",
                            sort,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="اختر العلامة التجارية" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">كل المتاجر</SelectItem>
                          {stores.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>العلامة التجارية</Label>
                      <Select
                        value={brand ?? "all"}
                        onValueChange={(v) =>
                          applyAdvancedFilters({
                            merchant_id: merchantId ?? "",
                            filter: filter ?? "",
                            min_price: minPrice ?? "",
                            max_price: maxPrice ?? "",
                            brand: v === "all" ? "" : v,
                            color: color ?? "",
                            size: size ?? "",
                            min_weight: minWeight ?? "",
                            max_weight: maxWeight ?? "",
                            sort,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="اختر العلامة التجارية" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">كل العلامات التجارية</SelectItem>
                          {brands.map((b) => (
                            <SelectItem key={b} value={b}>
                              {b}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label>السعر الأدنى</Label>
                        <Input
                          dir="ltr"
                          defaultValue={minPrice ?? ""}
                          placeholder="0"
                          onBlur={(e) =>
                            applyAdvancedFilters({
                              merchant_id: merchantId ?? "",
                              filter: filter ?? "",
                              min_price: e.currentTarget.value,
                              max_price: maxPrice ?? "",
                              brand: brand ?? "",
                              color: color ?? "",
                              size: size ?? "",
                              min_weight: minWeight ?? "",
                              max_weight: maxWeight ?? "",
                              sort,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>السعر الأعلى</Label>
                        <Input
                          dir="ltr"
                          defaultValue={maxPrice ?? ""}
                          placeholder="999999"
                          onBlur={(e) =>
                            applyAdvancedFilters({
                              merchant_id: merchantId ?? "",
                              filter: filter ?? "",
                              min_price: minPrice ?? "",
                              max_price: e.currentTarget.value,
                              brand: brand ?? "",
                              color: color ?? "",
                              size: size ?? "",
                              min_weight: minWeight ?? "",
                              max_weight: maxWeight ?? "",
                              sort,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>نوع العرض</Label>
                      <Select
                        value={filter ?? "all"}
                        onValueChange={(v) =>
                          applyAdvancedFilters({
                            merchant_id: merchantId ?? "",
                            filter: v === "all" ? "" : v,
                            min_price: minPrice ?? "",
                            max_price: maxPrice ?? "",
                            brand: brand ?? "",
                            color: color ?? "",
                            size: size ?? "",
                            min_weight: minWeight ?? "",
                            max_weight: maxWeight ?? "",
                            sort,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="اختر نوع العرض" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">الكل</SelectItem>
                          <SelectItem value="new">وصل حديثاً</SelectItem>
                          <SelectItem value="offers">تخفيضات وعروض</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label>اللون</Label>
                        <Input
                          defaultValue={color ?? ""}
                          placeholder="مثل: أسود"
                          onBlur={(e) =>
                            applyAdvancedFilters({
                              merchant_id: merchantId ?? "",
                              filter: filter ?? "",
                              min_price: minPrice ?? "",
                              max_price: maxPrice ?? "",
                              brand: brand ?? "",
                              color: e.currentTarget.value,
                              size: size ?? "",
                              min_weight: minWeight ?? "",
                              max_weight: maxWeight ?? "",
                              sort,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>المقاس</Label>
                        <Input
                          defaultValue={size ?? ""}
                          placeholder="مثل: كبير"
                          onBlur={(e) =>
                            applyAdvancedFilters({
                              merchant_id: merchantId ?? "",
                              filter: filter ?? "",
                              min_price: minPrice ?? "",
                              max_price: maxPrice ?? "",
                              brand: brand ?? "",
                              color: color ?? "",
                              size: e.currentTarget.value,
                              min_weight: minWeight ?? "",
                              max_weight: maxWeight ?? "",
                              sort,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label>وزن أدنى (غرام)</Label>
                        <Input
                          dir="ltr"
                          defaultValue={minWeight ?? ""}
                          placeholder="0"
                          onBlur={(e) =>
                            applyAdvancedFilters({
                              merchant_id: merchantId ?? "",
                              filter: filter ?? "",
                              min_price: minPrice ?? "",
                              max_price: maxPrice ?? "",
                              brand: brand ?? "",
                              color: color ?? "",
                              size: size ?? "",
                              min_weight: e.currentTarget.value,
                              max_weight: maxWeight ?? "",
                              sort,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>وزن أعلى (غرام)</Label>
                        <Input
                          dir="ltr"
                          defaultValue={maxWeight ?? ""}
                          placeholder="10000"
                          onBlur={(e) =>
                            applyAdvancedFilters({
                              merchant_id: merchantId ?? "",
                              filter: filter ?? "",
                              min_price: minPrice ?? "",
                              max_price: maxPrice ?? "",
                              brand: brand ?? "",
                              color: color ?? "",
                              size: size ?? "",
                              min_weight: minWeight ?? "",
                              max_weight: e.currentTarget.value,
                              sort,
                            })
                          }
                        />
                      </div>
                    </div>

                    <Button variant="outline" onClick={resetAdvancedFilters}>
                      إعادة ضبط الفلاتر
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-full rounded-full border-DilMart-store-gold/20 bg-card/80 sm:w-[220px]">
                  <SelectValue placeholder="الترتيب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">الأحدث</SelectItem>
                  <SelectItem value="price-asc">السعر: الأقل</SelectItem>
                  <SelectItem value="price-desc">السعر: الأعلى</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {showResultsCount && (
            <p className="mb-6 text-sm text-muted-foreground">
              عرض {products.length} من {total} منتجاً
              {totalPages > 1 ? ` · صفحة ${page} من ${totalPages}` : ""}
            </p>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl bg-muted/30" />
              ))}
            </div>
          ) : products.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
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
            <ProductsEmptyState
              isWeakSearch={isWeakSearch}
              effectiveSearchTerm={effectiveSearchTerm}
              categorySlug={categorySlug}
              categoryName={categoryName}
              onClearSearch={clearSearch}
              onClearCategory={clearCategory}
              onAllProducts={allProducts}
            />
          )}
        </div>
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
};

export default Products;
