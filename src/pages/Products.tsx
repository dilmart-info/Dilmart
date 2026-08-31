import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import ProductCard from "@/components/ProductCard";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useEffect, useCallback, useState, useRef } from "react";
import { storeConfig } from "@/config/store";
import { apiClient } from "@/lib/api-client";
import { parseMarketplaceListSort, type MarketplaceListSort } from "@/lib/marketplace-list.types";
import { buildProductsQueryKey, buildProductsQueryParams } from "@/lib/products-query-key";
import { getEffectiveMarketplaceSearchTerm } from "@/lib/marketplace-search";
import { Button } from "@/components/ui/button";
import {
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  RotateCcw,
  Sparkles,
  Search,
  Check,
  Tag,
  ChevronDown,
  Layers,
} from "lucide-react";
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
import type { MarketplaceListProduct } from "@/lib/marketplace-product-detail.types";

const PAGE_SIZE = 24;

const QUICK_PRICE_PRESETS = [
  { label: "أقل من 25,000 د.ع", min: "", max: "25000" },
  { label: "25,000 - 50,000 د.ع", min: "25000", max: "50000" },
  { label: "50,000 - 100,000 د.ع", min: "50000", max: "100000" },
  { label: "أكثر من 100,000 د.ع", min: "100000", max: "" },
];

/** Dynamic context description under H1 */
function ProductsContextLine({
  effectiveSearchTerm,
  categorySlug,
  categoryName,
  isWeakSearch,
  totalCount,
}: {
  effectiveSearchTerm: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  isWeakSearch: boolean;
  totalCount?: number;
}) {
  const catLabel = categorySlug ? (categoryName ?? categorySlug) : null;

  if (isWeakSearch) {
    return (
      <div className="mt-2 max-w-2xl space-y-1.5 text-xs sm:text-sm leading-relaxed" dir="rtl">
        {catLabel ? (
          <p className="text-muted-foreground">
            منتجات ضمن «<span className="font-bold text-navy">{catLabel}</span>» — عرض عام دون تصفية بالاسم حتى يكتمل البحث.
          </p>
        ) : (
          <p className="text-muted-foreground">عرض جميع المنتجات المتاحة — لم يُطبَّق بحث بالاسم بعد.</p>
        )}
        <p className="font-semibold text-amber-600 dark:text-amber-400">اكتب حرفين على الأقل للبحث</p>
      </div>
    );
  }

  if (effectiveSearchTerm && catLabel) {
    return (
      <p className="mt-2 max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed" dir="rtl">
        نتائج البحث عن «<span className="font-bold text-navy">{effectiveSearchTerm}</span>» ضمن «
        <span className="font-bold text-navy">{catLabel}</span>»
        {typeof totalCount === "number" && totalCount > 0 ? ` (${totalCount} منتج)` : ""}
      </p>
    );
  }

  if (effectiveSearchTerm) {
    return (
      <p className="mt-2 max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed" dir="rtl">
        نتائج البحث عن «<span className="font-bold text-navy">{effectiveSearchTerm}</span>»
        {typeof totalCount === "number" && totalCount > 0 ? ` (${totalCount} منتج)` : ""}
      </p>
    );
  }

  if (catLabel) {
    return (
      <p className="mt-2 max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed" dir="rtl">
        تصفح أفضل المنتجات المتاحة ضمن قسم «<span className="font-bold text-navy">{catLabel}</span>»
        {typeof totalCount === "number" && totalCount > 0 ? ` (${totalCount} منتج)` : ""}
      </p>
    );
  }

  return (
    <p className="mt-2 max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed" dir="rtl">
      تصفّح تشكيلة ديلمارت الشاملة — اختر القسم، ابحث بالاسم، ورتّب حسب الأحدث أو السعر مع شحن مباشر لجميع المحافظات.
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
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
      {showClearSearch && (
        <Button type="button" variant="outline" size="sm" className="rounded-xl font-bold" onClick={onClearSearch}>
          مسح البحث
        </Button>
      )}
      {showClearCategory && (
        <Button type="button" variant="outline" size="sm" className="rounded-xl font-bold" onClick={onClearCategory}>
          مسح تصفية القسم
        </Button>
      )}
      {showAllProducts && (
        <Button type="button" variant="default" size="sm" className="rounded-xl bg-primary hover:bg-primary-hover font-bold" onClick={onAllProducts}>
          عرض كل المنتجات
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

  return (
    <div className="rounded-2xl border border-dashed border-border bg-white p-8 md:p-12 text-center shadow-sm" dir="rtl">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
        <Search size={28} strokeWidth={2.2} />
      </div>

      {isWeakSearch ? (
        <>
          <h3 className="font-tajawal text-lg md:text-xl font-extrabold text-navy">اكتب حرفين على الأقل للبحث</h3>
          <p className="mt-2 text-xs md:text-sm text-muted-foreground max-w-md mx-auto">
            أدخل كلمة بحث أطول للحصول على نتائج دقيقة، أو أزل البحث لتصفح المعروض كاملاً.
          </p>
          <EmptyCtaRow
            onClearSearch={onClearSearch}
            onClearCategory={onClearCategory}
            onAllProducts={onAllProducts}
            showClearSearch
            showClearCategory={!!categorySlug}
            showAllProducts
          />
        </>
      ) : effectiveSearchTerm && categorySlug ? (
        <>
          <h3 className="font-tajawal text-lg md:text-xl font-extrabold text-navy">لا توجد منتجات مطابقة للبحث</h3>
          <p className="mt-2 text-xs md:text-sm text-muted-foreground max-w-md mx-auto">
            لم نجد منتجات تطابق «<span className="font-bold text-navy">{effectiveSearchTerm}</span>» ضمن قسم «
            <span className="font-bold text-navy">{catLabel}</span>».
          </p>
          <EmptyCtaRow
            onClearSearch={onClearSearch}
            onClearCategory={onClearCategory}
            onAllProducts={onAllProducts}
            showClearSearch
            showClearCategory
            showAllProducts
          />
        </>
      ) : effectiveSearchTerm ? (
        <>
          <h3 className="font-tajawal text-lg md:text-xl font-extrabold text-navy">لا توجد نتائج للبحث</h3>
          <p className="mt-2 text-xs md:text-sm text-muted-foreground max-w-md mx-auto">
            لم نعثر على أي منتجات مطابقة لـ «<span className="font-bold text-navy">{effectiveSearchTerm}</span>». تأكد من صحة الكلمات أو جرب كلمات عامة.
          </p>
          <EmptyCtaRow
            onClearSearch={onClearSearch}
            onClearCategory={onClearCategory}
            onAllProducts={onAllProducts}
            showClearSearch
            showClearCategory={false}
            showAllProducts
          />
        </>
      ) : categorySlug ? (
        <>
          <h3 className="font-tajawal text-lg md:text-xl font-extrabold text-navy">لا توجد منتجات في هذا القسم حالياً</h3>
          <p className="mt-2 text-xs md:text-sm text-muted-foreground max-w-md mx-auto">
            قسم «<span className="font-bold text-navy">{catLabel}</span>» قيد التحديث. تصفح أقساماً أخرى أو تفقد العروض اليومية.
          </p>
          <EmptyCtaRow
            onClearSearch={onClearSearch}
            onClearCategory={onClearCategory}
            onAllProducts={onAllProducts}
            showClearSearch={false}
            showClearCategory
            showAllProducts
          />
        </>
      ) : (
        <>
          <h3 className="font-tajawal text-lg md:text-xl font-extrabold text-navy">لا توجد منتجات معروضة حالياً</h3>
          <p className="mt-2 text-xs md:text-sm text-muted-foreground max-w-md mx-auto">
            يتم تحديث المخزون باستمرار. عاود الزيارة قريباً أو استكشف الأقسام الرئيسية.
          </p>
          <EmptyCtaRow
            onClearSearch={onClearSearch}
            onClearCategory={onClearCategory}
            onAllProducts={onAllProducts}
            showClearSearch={false}
            showClearCategory={false}
            showAllProducts={false}
          />
        </>
      )}
    </div>
  );
}

const Products = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const productsStartRef = useRef<HTMLDivElement | null>(null);

  // Canonical query parameters supported by backend contract
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

  // Local filter draft state for sidebar inputs
  const [draftMinPrice, setDraftMinPrice] = useState(minPrice ?? "");
  const [draftMaxPrice, setDraftMaxPrice] = useState(maxPrice ?? "");
  const [draftColor, setDraftColor] = useState(color ?? "");
  const [draftSize, setDraftSize] = useState(size ?? "");
  const [draftMinWeight, setDraftMinWeight] = useState(minWeight ?? "");
  const [draftMaxWeight, setDraftMaxWeight] = useState(maxWeight ?? "");

  useEffect(() => {
    setDraftMinPrice(minPrice ?? "");
    setDraftMaxPrice(maxPrice ?? "");
    setDraftColor(color ?? "");
    setDraftSize(size ?? "");
    setDraftMinWeight(minWeight ?? "");
    setDraftMaxWeight(maxWeight ?? "");
  }, [minPrice, maxPrice, color, size, minWeight, maxWeight]);

  const { data: categories } = useQuery({
    queryKey: ["marketplace-categories"],
    queryFn: () => apiClient.getMarketplaceCategories(),
  });

  const { data: brandsData } = useQuery({
    queryKey: ["marketplace-brands"],
    queryFn: () => apiClient.getMarketplaceBrands(),
  });

  // Single source of truth query key
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

  const availableBrands = useMemo(() => {
    const list: string[] = [];
    if (brandsData?.brands?.length) {
      brandsData.brands.forEach((b) => {
        if (b.name) list.push(b.name);
      });
    }
    (result?.items ?? []).forEach((p: any) => {
      const val = String(p?.brand ?? "").trim();
      if (val && !list.includes(val)) list.push(val);
    });
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, "ar"));
  }, [brandsData?.brands, result?.items]);

  const effectiveSearchTerm = getEffectiveMarketplaceSearchTerm(search);
  const isWeakSearch = searchParams.has("search") && effectiveSearchTerm === null;

  const baseTitle = isWeakSearch
    ? categorySlug
      ? categoryName ?? "المنتجات"
      : "كل المنتجات"
    : effectiveSearchTerm && categorySlug
      ? `نتائج البحث عن «${effectiveSearchTerm}»`
      : effectiveSearchTerm
        ? `نتائج البحث عن «${effectiveSearchTerm}»`
        : categorySlug
          ? categoryName ?? "المنتجات"
          : "جميع المنتجات";

  const title = !effectiveSearchTerm && !categorySlug && brand ? `منتجات ماركة ${brand}` : baseTitle;

  const activeFilterChips = useMemo(() => {
    const chips: { label: string; key: string }[] = [];
    if (categorySlug && categoryName) {
      chips.push({ label: `القسم: ${categoryName}`, key: "category" });
    }
    if (brand) {
      chips.push({ label: `الماركة: ${brand}`, key: "brand" });
    }
    if (minPrice || maxPrice) {
      const minStr = minPrice ? `${Number(minPrice).toLocaleString("en-US")} د.ع` : "0";
      const maxStr = maxPrice ? `${Number(maxPrice).toLocaleString("en-US")} د.ع` : "بلا حد";
      chips.push({ label: `السعر: ${minStr} - ${maxStr}`, key: "price" });
    }
    if (color) {
      chips.push({ label: `اللون: ${color}`, key: "color" });
    }
    if (size) {
      chips.push({ label: `المقاس: ${size}`, key: "size" });
    }
    if (filter === "offers") {
      chips.push({ label: "عروض وتخفيضات", key: "filter" });
    } else if (filter === "new") {
      chips.push({ label: "وصل حديثاً", key: "filter" });
    }
    return chips;
  }, [categorySlug, categoryName, brand, minPrice, maxPrice, color, size, filter]);

  const removeFilterChip = useCallback(
    (key: string) => {
      const p = new URLSearchParams(searchParams);
      if (key === "price") {
        p.delete("min_price");
        p.delete("max_price");
      } else {
        p.delete(key);
      }
      p.delete("page");
      setSearchParams(p);
    },
    [searchParams, setSearchParams],
  );

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
    p.delete("brand");
    p.delete("min_price");
    p.delete("max_price");
    p.delete("color");
    p.delete("size");
    p.delete("filter");
    p.delete("min_weight");
    p.delete("max_weight");
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setSort = (next: string) => {
    const p = new URLSearchParams(searchParams);
    const s = parseMarketplaceListSort(next);
    if (s === "newest") p.delete("sort");
    else p.set("sort", s);
    p.delete("page");
    setSearchParams(p);
  };

  const setCategoryFilter = (slug: string | null) => {
    const p = new URLSearchParams(searchParams);
    if (slug) p.set("category", slug);
    else p.delete("category");
    p.delete("page");
    setSearchParams(p);
  };

  const setBrandFilter = (brandName: string | null) => {
    const p = new URLSearchParams(searchParams);
    if (brandName) p.set("brand", brandName);
    else p.delete("brand");
    p.delete("page");
    setSearchParams(p);
  };

  const showResultsCount = !isLoading && products.length > 0 && !isWeakSearch;

  useEffect(() => {
    if (!categorySlug) return;
    if (isRootSelected && childNavCategories.length > 0) return;
    productsStartRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [categorySlug, isRootSelected, childNavCategories.length]);

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary selection:text-white">
      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <Header />

      {/* ── Main Catalog Surface ──────────────────────────────────────────── */}
      <main className="flex-1 pb-12">
        {/* 1. Category Context & Breadcrumbs Header */}
        <div className="border-b border-border/80 bg-white shadow-xs">
          <div className="container py-4 md:py-6" dir="rtl">
            {/* Breadcrumb path */}
            <nav className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground font-medium" aria-label="مسار التصفح">
              <Link to="/" className="hover:text-primary transition-colors">
                الرئيسية
              </Link>
              <ChevronLeft size={13} className="text-muted-foreground/60" />
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={`hover:text-primary transition-colors ${!categorySlug ? "font-bold text-navy" : ""}`}
              >
                الأقسام
              </button>
              {isLeafSelected && parentCategory ? (
                <>
                  <ChevronLeft size={13} className="text-muted-foreground/60" />
                  <button
                    type="button"
                    onClick={() => setCategoryFilter(parentCategory.slug)}
                    className="hover:text-primary transition-colors"
                  >
                    {parentCategory.name}
                  </button>
                  <ChevronLeft size={13} className="text-muted-foreground/60" />
                  <span className="font-bold text-navy">{selectedCategory?.name}</span>
                </>
              ) : selectedCategory ? (
                <>
                  <ChevronLeft size={13} className="text-muted-foreground/60" />
                  <span className="font-bold text-navy">{selectedCategory.name}</span>
                </>
              ) : effectiveSearchTerm ? (
                <>
                  <ChevronLeft size={13} className="text-muted-foreground/60" />
                  <span className="font-bold text-navy">نتائج البحث</span>
                </>
              ) : null}
            </nav>

            {/* Main Header Title */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <h1 className="font-tajawal text-xl sm:text-2xl md:text-3xl font-black text-navy leading-tight">
                  {title}
                </h1>
                <ProductsContextLine
                  effectiveSearchTerm={effectiveSearchTerm}
                  categorySlug={categorySlug}
                  categoryName={categoryName}
                  isWeakSearch={isWeakSearch}
                  totalCount={total}
                />
              </div>

              {/* Active Filter Chips */}
              {activeFilterChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-2 md:pt-0">
                  {activeFilterChips.map((chip) => (
                    <span
                      key={chip.key}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"
                    >
                      <span>{chip.label}</span>
                      <button
                        type="button"
                        onClick={() => removeFilterChip(chip.key)}
                        className="hover:bg-primary/20 rounded p-0.5 transition-colors"
                        aria-label={`إزالة ${chip.label}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={resetAdvancedFilters}
                    className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-destructive transition-colors px-1"
                  >
                    <RotateCcw size={12} />
                    <span>مسح الفلاتر</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Catalog Main Body with Desktop Sidebar + Product Grid */}
        <div className="container py-4 md:py-6" dir="rtl">
          {/* Subcategory Pills (if category has children) */}
          {childNavCategories.length > 0 && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => {
                  const rootSlug = isLeafSelected ? parentCategory?.slug : selectedCategory?.slug;
                  setCategoryFilter(rootSlug ?? null);
                }}
                className={`shrink-0 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition-all ${
                  isRootSelected
                    ? "border-primary bg-primary text-white shadow-xs"
                    : "border-border/80 bg-white text-muted-foreground hover:border-primary/40 hover:text-navy"
                }`}
              >
                الكل
              </button>
              {childNavCategories.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setCategoryFilter(sub.slug)}
                  className={`shrink-0 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition-all ${
                    categorySlug === sub.slug
                      ? "border-primary bg-primary text-white shadow-xs"
                      : "border-border/80 bg-white text-muted-foreground hover:border-primary/40 hover:text-navy"
                  }`}
                >
                  {sub.name}
                </button>
              ))}
            </div>
          )}

          {/* Top Categories Grid (when viewing all categories or root) */}
          {showCategoryBrowser && !effectiveSearchTerm && (
            <div className="mb-6 rounded-2xl border border-border/80 bg-white p-3.5 sm:p-4 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-tajawal text-xs sm:text-sm font-extrabold text-navy flex items-center gap-1.5">
                  <Layers size={16} className="text-primary" />
                  <span>تصفح الأقسام الرئيسية</span>
                </h3>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 md:gap-2.5">
                {(isRootSelected ? childNavCategories : browseCategories).slice(0, 8).map((cat) => {
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
                      onClick={() => setCategoryFilter(cat.slug)}
                      className={`group flex flex-col items-center text-center p-1.5 rounded-xl transition-all ${
                        categorySlug === cat.slug
                          ? "bg-primary/10 border border-primary/40 shadow-xs"
                          : "hover:bg-slate-50 border border-transparent"
                      }`}
                      aria-label={cat.name}
                    >
                      <div className="h-12 w-12 sm:h-14 sm:w-14 overflow-hidden rounded-xl bg-slate-100 mb-1.5">
                        <img
                          src={imageSrc || NEUTRAL_CATEGORY_PLACEHOLDER}
                          alt={cat.name}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                      </div>
                      <span className="text-[11px] font-bold text-navy line-clamp-1 group-hover:text-primary transition-colors">
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Catalog Layout: Sidebar Filters + Main Product Grid */}
          <div className="flex items-start gap-6">
            {/* Desktop Filter Sidebar (Persistent) */}
            <aside className="hidden lg:block w-64 xl:w-72 shrink-0 space-y-4 text-right">
              <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <h3 className="font-tajawal text-sm font-black text-navy flex items-center gap-1.5">
                    <SlidersHorizontal size={16} className="text-primary" />
                    <span>تصفية النتائج</span>
                  </h3>
                  {activeFilterChips.length > 0 && (
                    <button
                      type="button"
                      onClick={resetAdvancedFilters}
                      className="text-[11px] font-bold text-primary hover:underline"
                    >
                      إعادة ضبط
                    </button>
                  )}
                </div>

                {/* Categories Filter List */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-navy">القسم</Label>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => setCategoryFilter(null)}
                      className={`w-full text-right px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between ${
                        !categorySlug ? "bg-primary text-white font-bold" : "text-muted-foreground hover:bg-slate-50 hover:text-navy"
                      }`}
                    >
                      <span>كل الأقسام</span>
                      {!categorySlug && <Check size={14} />}
                    </button>
                    {browseCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoryFilter(cat.slug)}
                        className={`w-full text-right px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between ${
                          categorySlug === cat.slug
                            ? "bg-primary text-white font-bold"
                            : "text-muted-foreground hover:bg-slate-50 hover:text-navy"
                        }`}
                      >
                        <span>{cat.name}</span>
                        {categorySlug === cat.slug && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Brands Filter List */}
                {availableBrands.length > 0 && (
                  <div className="space-y-2 border-t border-border/60 pt-4">
                    <Label className="text-xs font-bold text-navy">العلامة التجارية</Label>
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      <button
                        type="button"
                        onClick={() => setBrandFilter(null)}
                        className={`w-full text-right px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between ${
                          !brand ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground hover:bg-slate-50 hover:text-navy"
                        }`}
                      >
                        <span>كل الماركات</span>
                        {!brand && <Check size={14} />}
                      </button>
                      {availableBrands.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setBrandFilter(brand === b ? null : b)}
                          className={`w-full text-right px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between ${
                            brand === b
                              ? "bg-primary text-white font-bold"
                              : "text-muted-foreground hover:bg-slate-50 hover:text-navy"
                          }`}
                        >
                          <span>{b}</span>
                          {brand === b && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price Range Filter */}
                <div className="space-y-2 border-t border-border/60 pt-4">
                  <Label className="text-xs font-bold text-navy">نطاق السعر (د.ع)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-muted-foreground font-medium mb-1 block">من</span>
                      <Input
                        dir="ltr"
                        value={draftMinPrice}
                        placeholder="0"
                        onChange={(e) => setDraftMinPrice(e.target.value)}
                        className="h-8 text-xs text-center rounded-lg"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground font-medium mb-1 block">إلى</span>
                      <Input
                        dir="ltr"
                        value={draftMaxPrice}
                        placeholder="500000"
                        onChange={(e) => setDraftMaxPrice(e.target.value)}
                        className="h-8 text-xs text-center rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Quick price presets */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {QUICK_PRICE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setDraftMinPrice(preset.min);
                          setDraftMaxPrice(preset.max);
                          applyAdvancedFilters({
                            merchant_id: merchantId ?? "",
                            filter: filter ?? "",
                            min_price: preset.min,
                            max_price: preset.max,
                            brand: brand ?? "",
                            color: color ?? "",
                            size: size ?? "",
                            min_weight: minWeight ?? "",
                            max_weight: maxWeight ?? "",
                            sort,
                          });
                        }}
                        className="rounded-lg border border-border/80 bg-slate-50/60 p-1.5 text-[10px] font-bold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors text-center"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color & Size Filters */}
                <div className="space-y-2 border-t border-border/60 pt-4">
                  <Label className="text-xs font-bold text-navy">المواصفات</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={draftColor}
                      placeholder="اللون (مثال: أسود)"
                      onChange={(e) => setDraftColor(e.target.value)}
                      className="h-8 text-xs rounded-lg"
                    />
                    <Input
                      value={draftSize}
                      placeholder="المقاس (مثال: L)"
                      onChange={(e) => setDraftSize(e.target.value)}
                      className="h-8 text-xs rounded-lg"
                    />
                  </div>
                </div>

                {/* Apply Button */}
                <Button
                  type="button"
                  onClick={() =>
                    applyAdvancedFilters({
                      merchant_id: merchantId ?? "",
                      filter: filter ?? "",
                      min_price: draftMinPrice,
                      max_price: draftMaxPrice,
                      brand: brand ?? "",
                      color: draftColor,
                      size: draftSize,
                      min_weight: draftMinWeight,
                      max_weight: draftMaxWeight,
                      sort,
                    })
                  }
                  className="w-full rounded-xl bg-primary hover:bg-primary-hover font-bold text-xs h-9"
                >
                  تطبيق التصفية
                </Button>
              </div>
            </aside>

            {/* Main Products Area */}
            <div className="flex-1 min-w-0">
              {/* Top Toolbar: Count + Mobile Filter Trigger + Sort Dropdown */}
              <div ref={productsStartRef} className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-border/80 shadow-xs">
                {/* Mobile Filters Trigger */}
                <div className="flex items-center gap-2">
                  <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm" className="lg:hidden rounded-xl gap-1.5 font-bold text-xs h-9">
                        <SlidersHorizontal size={15} />
                        <span>تصفية</span>
                        {activeFilterChips.length > 0 && (
                          <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-primary text-[10px] text-white">
                            {activeFilterChips.length}
                          </span>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl p-5" dir="rtl">
                      <SheetHeader className="text-right border-b border-border/60 pb-3">
                        <SheetTitle className="font-tajawal text-base font-black text-navy flex items-center justify-between">
                          <span>تصفية المنتجات</span>
                          {activeFilterChips.length > 0 && (
                            <button
                              type="button"
                              onClick={resetAdvancedFilters}
                              className="text-xs font-bold text-primary"
                            >
                              إعادة ضبط
                            </button>
                          )}
                        </SheetTitle>
                      </SheetHeader>

                      <div className="mt-4 space-y-4">
                        {/* Mobile Category Select */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-navy">القسم</Label>
                          <Select
                            value={categorySlug ?? "all"}
                            onValueChange={(v) => setCategoryFilter(v === "all" ? null : v)}
                          >
                            <SelectTrigger className="rounded-xl">
                              <SelectValue placeholder="اختر القسم" />
                            </SelectTrigger>
                            <SelectContent dir="rtl">
                              <SelectItem value="all">كل الأقسام</SelectItem>
                              {browseCategories.map((c) => (
                                <SelectItem key={c.id} value={c.slug}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Mobile Brand Select */}
                        {availableBrands.length > 0 && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-navy">العلامة التجارية</Label>
                            <Select
                              value={brand ?? "all"}
                              onValueChange={(v) => setBrandFilter(v === "all" ? null : v)}
                            >
                              <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="اختر العلامة التجارية" />
                              </SelectTrigger>
                              <SelectContent dir="rtl">
                                <SelectItem value="all">كل العلامات التجارية</SelectItem>
                                {availableBrands.map((b) => (
                                  <SelectItem key={b} value={b}>
                                    {b}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Mobile Price Inputs */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-navy">نطاق السعر (د.ع)</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              dir="ltr"
                              value={draftMinPrice}
                              placeholder="السعر الأدنى"
                              onChange={(e) => setDraftMinPrice(e.target.value)}
                              className="rounded-xl text-center"
                            />
                            <Input
                              dir="ltr"
                              value={draftMaxPrice}
                              placeholder="السعر الأعلى"
                              onChange={(e) => setDraftMaxPrice(e.target.value)}
                              className="rounded-xl text-center"
                            />
                          </div>
                        </div>

                        {/* Mobile Color & Size */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs font-bold text-navy">اللون</Label>
                            <Input
                              value={draftColor}
                              placeholder="مثل: أسود"
                              onChange={(e) => setDraftColor(e.target.value)}
                              className="rounded-xl"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-bold text-navy">المقاس</Label>
                            <Input
                              value={draftSize}
                              placeholder="مثل: L"
                              onChange={(e) => setDraftSize(e.target.value)}
                              className="rounded-xl"
                            />
                          </div>
                        </div>

                        <div className="pt-2">
                          <Button
                            type="button"
                            onClick={() =>
                              applyAdvancedFilters({
                                merchant_id: merchantId ?? "",
                                filter: filter ?? "",
                                min_price: draftMinPrice,
                                max_price: draftMaxPrice,
                                brand: brand ?? "",
                                color: draftColor,
                                size: draftSize,
                                min_weight: draftMinWeight,
                                max_weight: draftMaxWeight,
                                sort,
                              })
                            }
                            className="w-full rounded-xl bg-primary hover:bg-primary-hover font-bold text-sm h-11"
                          >
                            عرض النتائج ({total} منتج)
                          </Button>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>

                  {/* Results Count Text */}
                  {showResultsCount ? (
                    <p className="text-xs font-bold text-muted-foreground">
                      عرض <span className="text-navy">{products.length}</span> من <span className="text-navy">{total}</span> منتجاً
                    </p>
                  ) : null}
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-xs font-bold text-muted-foreground">الترتيب:</span>
                  <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger className="w-[170px] sm:w-[190px] rounded-xl border-border/80 bg-slate-50/50 text-xs font-bold h-9">
                      <SelectValue placeholder="ترتيب حسب" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="newest">الأحدث</SelectItem>
                      <SelectItem value="price-asc">السعر: من الأقل للأعلى</SelectItem>
                      <SelectItem value="price-desc">السعر: من الأعلى للأقل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 4. Product Cards Grid / Loading Skeletons / Empty State */}
              {isLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex flex-col rounded-2xl border border-border/70 bg-white p-2.5 sm:p-3 space-y-2.5 shadow-xs">
                      <Skeleton className="aspect-square w-full rounded-xl bg-muted/40" />
                      <Skeleton className="h-4 w-3/4 rounded bg-muted/30" />
                      <Skeleton className="h-4 w-1/2 rounded bg-muted/30" />
                      <div className="flex items-center justify-between pt-2">
                        <Skeleton className="h-5 w-20 rounded bg-muted/30" />
                        <Skeleton className="h-8 w-8 rounded-xl bg-muted/30" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : products.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
                    {products.map((p) => (
                      <ProductCard key={p.id} product={p as MarketplaceListProduct} />
                    ))}
                  </div>

                  {/* 5. Pagination Navigation */}
                  {totalPages > 1 && (
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2" dir="rtl">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                        className="rounded-xl border-border/80 gap-1 font-bold text-xs disabled:opacity-40"
                      >
                        <ChevronRight size={14} />
                        <span>السابق</span>
                      </Button>

                      {Array.from({ length: Math.min(totalPages, 5) }).map((_, idx) => {
                        const pageNum = idx + 1;
                        return (
                          <Button
                            key={pageNum}
                            type="button"
                            variant={page === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPage(pageNum)}
                            className={`h-8 w-8 rounded-xl p-0 font-bold text-xs ${
                              page === pageNum
                                ? "bg-primary hover:bg-primary-hover text-white shadow-xs"
                                : "border-border/80 text-muted-foreground hover:text-navy"
                            }`}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}

                      {totalPages > 5 && (
                        <span className="px-1 text-xs text-muted-foreground font-bold">...</span>
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage(page + 1)}
                        className="rounded-xl border-border/80 gap-1 font-bold text-xs disabled:opacity-40"
                      >
                        <span>التالي</span>
                        <ChevronLeft size={14} />
                      </Button>
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
          </div>
        </div>
      </main>

      {/* ── WhatsApp Floating Action ──────────────────────────────────────── */}
      <WhatsAppButton />

      {/* ── Modern Marketplace Footer ─────────────────────────────────────── */}
      <Footer />
    </div>
  );
};

export default Products;
