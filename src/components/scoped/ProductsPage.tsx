import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  Search,
  Plus,
  Upload,
  Copy,
  AlertTriangle,
  RefreshCw,
  Package,
  Layers,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ScopedContext } from "@/lib/scoped-queries";
import { getScopedProducts, updateScopedProductStatus } from "@/lib/scoped-queries";
import { apiClient } from "@/lib/api-client";
import { listAssignableCategoryOptions, type CategoryRow } from "@/lib/category-assignability";
import { formatPrice } from "@/lib/format";
import { toast } from "sonner";

type ProductChecklistItem = {
  key: string;
  label: string;
  passed: boolean;
};

type ProductItem = {
  id: string;
  name: string;
  price?: number;
  discount_price?: number;
  stock?: number;
  is_active?: boolean;
  is_published?: boolean;
  visibility_status?: string;
  categories?: { id?: string; name?: string } | null;
  merchants?: { id?: string; display_name?: string } | null;
  readiness?: {
    is_ready?: boolean;
    score?: number;
    checklist?: ProductChecklistItem[];
  } | null;
};

type AdminMerchant = {
  id: string;
  display_name: string;
};

type Props = {
  context: ScopedContext;
  title?: string;
  createPath?: string;
  editPathBase: string;
};

export default function ProductsPage({ context, title = "المنتجات", createPath, editPathBase }: Props) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const merchantIdFromUrl = searchParams.get("merchant_id") ?? "";
  const rawPage = parseInt(searchParams.get("page") || "1", 10);
  const pageFromUrl = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawReadiness = searchParams.get("readiness");
  const readinessFilter: "all" | "ready" | "not_ready" =
    rawReadiness === "ready" || rawReadiness === "not_ready" ? rawReadiness : "all";
  const searchFromUrl = searchParams.get("search") ?? "";
  const focusId = searchParams.get("focus") ?? "";

  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const merchantFilter = context.scope === "platform" ? merchantIdFromUrl : "";
  const pageSize = 100;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"" | "activate" | "deactivate" | "update_stock" | "change_category" | "adjust_price_percent" | "archive">("");
  const [bulkValue, setBulkValue] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState({ name: "", category_id: "", price: "", stock: "0", image_url: "" });

  useEffect(() => {
    setSearchInput(searchFromUrl);
  }, [searchFromUrl]);

  // Reset selected IDs whenever page, search query, readiness filter, or merchant scope changes via URL navigation
  useEffect(() => {
    setSelectedIds([]);
  }, [pageFromUrl, searchFromUrl, readinessFilter, merchantFilter]);

  useEffect(() => {
    if (searchInput === searchFromUrl) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      const trimmed = searchInput.trim();
      if (trimmed) {
        params.set("search", trimmed);
      } else {
        params.delete("search");
      }
      params.delete("page");
      params.delete("focus");
      setSearchParams(params, { replace: true });
      setSelectedIds([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, searchFromUrl, searchParams, setSearchParams]);

  const requiresMerchantSelection = context.scope === "platform";
  const hasMerchantSelection = context.scope === "merchant" || merchantFilter.length > 0;

  const { data: merchants } = useQuery({
    queryKey: ["scoped-products-merchants"],
    enabled: context.scope === "platform",
    queryFn: () => apiClient.getAdminMerchants(),
  });
  const { data: categories } = useQuery({
    queryKey: ["scoped-products-categories"],
    queryFn: () => apiClient.getCategoriesAdminList(),
  });
  const assignableCategoryOptions = useMemo(
    () => listAssignableCategoryOptions((categories as CategoryRow[] | undefined) ?? []),
    [categories],
  );

  const selectedMerchant = useMemo(
    () => ((merchants as AdminMerchant[] | undefined) ?? []).find((m) => m.id === merchantFilter) ?? null,
    [merchants, merchantFilter],
  );

  useEffect(() => {
    if (context.scope !== "platform") return;
    if (merchantFilter) return;
    const merchantList = merchants ?? [];
    if (merchantList.length === 1) {
      const defaultId = merchantList[0].id;
      const params = new URLSearchParams(searchParams);
      params.set("merchant_id", defaultId);
      setSearchParams(params, { replace: true });
    }
  }, [context.scope, merchantFilter, merchants, searchParams, setSearchParams]);

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (newPage > 1) {
      params.set("page", String(newPage));
    } else {
      params.delete("page");
    }
    params.delete("focus");
    setSearchParams(params);
    setSelectedIds([]);
  };

  const handleReadinessChange = (nextReadiness: "all" | "ready" | "not_ready") => {
    const params = new URLSearchParams(searchParams);
    if (nextReadiness !== "all") {
      params.set("readiness", nextReadiness);
    } else {
      params.delete("readiness");
    }
    params.delete("page");
    params.delete("focus");
    setSearchParams(params);
    setSelectedIds([]);
  };

  const handleMerchantChange = (nextMerchantId: string) => {
    const params = new URLSearchParams(searchParams);
    if (nextMerchantId) {
      params.set("merchant_id", nextMerchantId);
    } else {
      params.delete("merchant_id");
    }
    params.delete("page");
    params.delete("focus");
    setSearchParams(params, { replace: true });
    setSelectedIds([]);
  };

  const { data: productsData, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["scoped-products", context.scope, context.merchantId, searchFromUrl, merchantFilter, readinessFilter, pageFromUrl, pageSize],
    enabled: hasMerchantSelection,
    queryFn: () =>
      getScopedProducts(context, {
        search: searchFromUrl,
        merchantId: context.scope === "platform" ? merchantFilter : undefined,
        offset: (pageFromUrl - 1) * pageSize,
        limit: pageSize,
        readiness: readinessFilter !== "all" ? readinessFilter : undefined,
      }),
  });

  const products = productsData?.items ?? [];
  const total = productsData?.total ?? products.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = total > 0 ? Math.min(pageFromUrl, totalPages) : pageFromUrl;
  const offset = (effectivePage - 1) * pageSize;
  const startRow = total === 0 ? 0 : offset + 1;
  const endRow = Math.min(offset + products.length, total);

  useEffect(() => {
    if (!isLoading && pageFromUrl > totalPages) {
      const params = new URLSearchParams(searchParams);
      if (totalPages > 1) {
        params.set("page", String(totalPages));
      } else {
        params.delete("page");
      }
      setSearchParams(params, { replace: true });
    }
  }, [isLoading, pageFromUrl, totalPages, searchParams, setSearchParams]);

  useEffect(() => {
    if (!focusId || isLoading || products.length === 0) return;
    const el = document.getElementById(`product-row-${focusId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusId, isLoading, products]);

  const createHref = useMemo(() => {
    if (!createPath) return "";
    const params = new URLSearchParams();
    if (context.scope === "platform" && merchantFilter) {
      params.set("merchant_id", merchantFilter);
    }
    const currentListUrl = `${location.pathname}${location.search ? location.search : ""}`;
    params.set("return_to", currentListUrl);
    const qs = params.toString();
    return qs ? `${createPath}?${qs}` : createPath;
  }, [createPath, context.scope, merchantFilter, location.pathname, location.search]);

  const productsCountLabel = useMemo(() => {
    if (!hasMerchantSelection) return null;
    return `عدد المنتجات: ${total}`;
  }, [hasMerchantSelection, total]);

  const updateStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateScopedProductStatus(context, id, isActive),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["scoped-products"] });
      if (variables.isActive) {
        toast.success("تم نشر المنتج في المتجر");
      } else {
        toast.success("تم تعطيل المنتج");
      }
    },
    onError: (err: unknown) => {
      const message = String((err as { message?: string })?.message ?? "");
      if (message.includes("PRODUCT_NOT_READY")) {
        toast.error("لا يمكن تفعيل المنتج قبل استكمال متطلبات الجاهزية");
        return;
      }
      toast.error("تعذر تحديث حالة المنتج");
    },
  });

  const emptyText = useMemo(() => (context.scope === "merchant" ? "لا توجد منتجات في متجرك حتى الآن." : "لا توجد منتجات مطابقة."), [context.scope]);

  const bulkActionMutation = useMutation({
    mutationFn: async () => {
      const validSelectedIds = selectedIds.filter((id) =>
        products.some((p: ProductItem) => p.id === id),
      );
      if (!validSelectedIds.length) throw new Error("اختر منتجات أولاً");
      if (!bulkAction) throw new Error("اختر العملية");
      let payload: Record<string, unknown> = {};
      if (bulkAction === "update_stock") payload = { stock: Number(bulkValue) };
      if (bulkAction === "change_category") payload = { category_id: bulkValue };
      if (bulkAction === "adjust_price_percent") payload = { percent: Number(bulkValue) };
      return apiClient.merchantBulkProductAction({
        product_ids: validSelectedIds,
        action: bulkAction,
        payload,
      });
    },
    onSuccess: () => {
      toast.success("تم تنفيذ العملية الجماعية");
      setSelectedIds([]);
      setBulkValue("");
      setBulkAction("");
      queryClient.invalidateQueries({ queryKey: ["scoped-products"] });
    },
    onError: (err: unknown) => toast.error((err as { message?: string })?.message ?? "تعذر تنفيذ العملية الجماعية"),
  });

  const quickAddMutation = useMutation({
    mutationFn: async () =>
      apiClient.quickAddMerchantProduct({
        name: quickAdd.name,
        category_id: quickAdd.category_id,
        price: Number(quickAdd.price),
        stock: Number(quickAdd.stock || 0),
        image_url: quickAdd.image_url || undefined,
      }),
    onSuccess: (created) => {
      toast.success(
        created?.is_active
          ? "تمت إضافة المنتج بسرعة"
          : "تمت إضافة المنتج كمسودة — أكمل الصورة والوصف لتفعيله",
      );
      setQuickAddOpen(false);
      setQuickAdd({ name: "", category_id: "", price: "", stock: "0", image_url: "" });
      queryClient.invalidateQueries({ queryKey: ["scoped-products"] });
    },
    onError: (err: unknown) => toast.error((err as { message?: string })?.message ?? "تعذر الإضافة السريعة"),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (productId: string) => apiClient.duplicateMerchantProduct(productId),
    onSuccess: () => {
      toast.success("تم نسخ المنتج");
      queryClient.invalidateQueries({ queryKey: ["scoped-products"] });
    },
    onError: (err: unknown) => toast.error((err as { message?: string })?.message ?? "تعذر نسخ المنتج"),
  });

  return (
    <div className="space-y-5" data-testid="products-page">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            إدارة الكتالوج، الأسعار، المخزون وجاهزية المنتجات للنشر.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {context.scope === "platform" && selectedMerchant ? (
            <Badge variant="secondary" className="text-xs">التاجر: {selectedMerchant.display_name ?? "—"}</Badge>
          ) : null}
          {productsCountLabel ? <Badge variant="outline" className="text-xs">{productsCountLabel}</Badge> : null}
          {createPath && (
            <Link to={createHref}>
              <Button size="sm" className="h-9 gap-1.5 rounded-lg text-xs font-bold" disabled={context.scope === "platform" && !merchantFilter}>
                <Plus className="h-3.5 w-3.5" />
                <span>إضافة منتج</span>
              </Button>
            </Link>
          )}
          {context.scope === "merchant" ? (
            <>
              <Link to="/merchant/products/import">
                <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg text-xs font-bold">
                  <Upload className="h-3.5 w-3.5" />
                  <span>استيراد ملف</span>
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg text-xs font-bold"
                onClick={() => setQuickAddOpen((v) => !v)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>إضافة سريعة</span>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* Quick Add Section */}
      {quickAddOpen ? (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-xs animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">إضافة سريعة</p>
            <span className="text-xs text-muted-foreground">يمكنك إكمال بقية التفاصيل لاحقاً</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
            <Input
              placeholder="الاسم"
              value={quickAdd.name}
              onChange={(e) => setQuickAdd((p) => ({ ...p, name: e.target.value }))}
              className="h-9 text-xs rounded-lg"
            />
            <select
              className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground"
              value={quickAdd.category_id}
              onChange={(e) => setQuickAdd((p) => ({ ...p, category_id: e.target.value }))}
            >
              <option value="">القسم</option>
              {assignableCategoryOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <Input
              placeholder="السعر"
              type="number"
              value={quickAdd.price}
              onChange={(e) => setQuickAdd((p) => ({ ...p, price: e.target.value }))}
              className="h-9 text-xs rounded-lg"
            />
            <Input
              placeholder="المخزون"
              type="number"
              value={quickAdd.stock}
              onChange={(e) => setQuickAdd((p) => ({ ...p, stock: e.target.value }))}
              className="h-9 text-xs rounded-lg"
            />
            <Input
              placeholder="رابط الصورة (اختياري)"
              value={quickAdd.image_url}
              onChange={(e) => setQuickAdd((p) => ({ ...p, image_url: e.target.value }))}
              className="h-9 text-xs rounded-lg"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={() => setQuickAddOpen(false)} className="h-8 text-xs">
              إلغاء
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs font-bold"
              onClick={() => quickAddMutation.mutate()}
              disabled={quickAddMutation.isPending || !quickAdd.name.trim() || !quickAdd.category_id || Number(quickAdd.price) <= 0}
            >
              {quickAddMutation.isPending ? "جاري الحفظ..." : "حفظ المنتج"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Filter Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-8 h-9 text-xs rounded-lg"
            placeholder="بحث عن منتج..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        {context.scope === "platform" && (
          <select
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs md:w-60"
            value={merchantFilter}
            onChange={(e) => handleMerchantChange(e.target.value)}
          >
            <option value="">اختر التاجر أولاً</option>
            {((merchants as AdminMerchant[] | undefined) ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        )}
        <select
          className="h-9 rounded-lg border border-input bg-background px-3 text-xs w-full sm:w-44 text-foreground"
          value={readinessFilter}
          onChange={(e) => handleReadinessChange(e.target.value as "all" | "ready" | "not_ready")}
        >
          <option value="all">كل الجاهزية</option>
          <option value="ready">جاهز</option>
          <option value="not_ready">غير جاهز</option>
        </select>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        {/* Bulk Action Controls */}
        {context.scope === "merchant" && selectedIds.length > 0 ? (
          <div className="border-b p-3 bg-muted/40 flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-foreground">تم اختيار {selectedIds.length} منتج</span>
            <select
              className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value as "" | "activate" | "deactivate" | "update_stock" | "change_category" | "adjust_price_percent" | "archive")}
            >
              <option value="">اختر عملية جماعية</option>
              <option value="activate">تفعيل</option>
              <option value="deactivate">تعطيل</option>
              <option value="update_stock">تحديث المخزون</option>
              <option value="change_category">تغيير الفئة</option>
              <option value="adjust_price_percent">تعديل السعر %</option>
              <option value="archive">أرشفة</option>
            </select>
            {bulkAction === "change_category" ? (
              <select className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
                <option value="">اختر الفئة</option>
                {assignableCategoryOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            ) : bulkAction === "update_stock" || bulkAction === "adjust_price_percent" ? (
              <Input className="h-8 text-xs w-32 rounded-lg" placeholder={bulkAction === "update_stock" ? "المخزون" : "النسبة المئوية"} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
            ) : null}
            <Button size="sm" className="h-8 text-xs font-bold" onClick={() => bulkActionMutation.mutate()} disabled={bulkActionMutation.isPending || !bulkAction}>
              {bulkActionMutation.isPending ? "جاري التنفيذ..." : "تنفيذ"}
            </Button>
          </div>
        ) : null}

        {/* Unified Table View */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                {context.scope === "merchant" ? (
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="تحديد كل المنتجات"
                      checked={products.length > 0 && products.every((p: ProductItem) => selectedIds.includes(p.id))}
                      onChange={(e) => setSelectedIds(e.target.checked ? products.map((p: ProductItem) => p.id) : [])}
                    />
                  </TableHead>
                ) : null}
                <TableHead className="text-right text-xs">المنتج</TableHead>
                <TableHead className="text-right text-xs">القسم</TableHead>
                {context.scope === "platform" && <TableHead className="text-right text-xs">التاجر</TableHead>}
                <TableHead className="text-right text-xs">السعر</TableHead>
                <TableHead className="text-right text-xs">المخزون</TableHead>
                <TableHead className="text-right text-xs">جاهزية الكتالوج</TableHead>
                <TableHead className="text-right text-xs">الحالة</TableHead>
                <TableHead className="text-center text-xs">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requiresMerchantSelection && !hasMerchantSelection ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    اختر التاجر من القائمة أعلاه لعرض منتجاته.
                  </TableCell>
                </TableRow>
              ) : isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    جاري التحميل...
                  </TableCell>
                </TableRow>
              ) : isError || error ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center" data-testid="products-error">
                    <div className="space-y-2">
                      <p className="text-sm text-destructive font-bold">تعذر تحميل المنتجات. يرجى إعادة المحاولة.</p>
                      <p className="text-xs text-muted-foreground">{String((error as { message?: string })?.message ?? "")}</p>
                      <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                        إعادة المحاولة
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground" data-testid="products-empty">
                    {emptyText}
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p: ProductItem) => {
                  const isFocused = focusId === p.id;
                  const isPubliclyVisible =
                    p.is_active === true && p.is_published === true && p.visibility_status === "public";

                  let buttonLabel = "";
                  let targetIsActive = false;
                  if (p.visibility_status === "archived") {
                    buttonLabel = "استعادة ونشر";
                    targetIsActive = true;
                  } else if (isPubliclyVisible) {
                    buttonLabel = "تعطيل";
                    targetIsActive = false;
                  } else if (p.is_active) {
                    buttonLabel = "نشر في المتجر";
                    targetIsActive = true;
                  } else {
                    buttonLabel = "تفعيل ونشر";
                    targetIsActive = true;
                  }

                  const returnParams = new URLSearchParams(searchParams);
                  returnParams.set("focus", p.id);
                  if (context.scope === "platform" && merchantFilter) {
                    returnParams.set("merchant_id", merchantFilter);
                  }
                  const returnTo = `${location.pathname}?${returnParams.toString()}`;
                  const editHref =
                    context.scope === "platform" && merchantFilter
                      ? `${editPathBase}/${p.id}/edit?merchant_id=${encodeURIComponent(merchantFilter)}&return_to=${encodeURIComponent(returnTo)}`
                      : `${editPathBase}/${p.id}/edit?return_to=${encodeURIComponent(returnTo)}`;

                  return (
                    <TableRow
                      key={p.id}
                      id={`product-row-${p.id}`}
                      className={isFocused ? "bg-primary/10 transition-colors duration-700 ring-1 ring-primary/20" : undefined}
                    >
                      {context.scope === "merchant" ? (
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`تحديد منتج ${p.name}`}
                            checked={selectedIds.includes(p.id)}
                            onChange={(e) => setSelectedIds((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))}
                          />
                        </TableCell>
                      ) : null}
                      <TableCell className="font-medium text-xs">{p.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.categories?.name ?? "—"}</TableCell>
                      {context.scope === "platform" && <TableCell className="text-xs">{p.merchants?.display_name ?? "—"}</TableCell>}
                      <TableCell className="text-xs font-mono font-semibold">{formatPrice(p.discount_price ?? p.price)}</TableCell>
                      <TableCell className="text-xs font-mono">
                        <span className={Number(p.stock ?? 0) <= 5 ? "text-amber-600 font-bold" : ""}>
                          {p.stock ?? 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <Badge variant={p?.readiness?.is_ready ? "default" : "secondary"} className="text-[10px] py-0">
                            {p?.readiness?.score ?? 0}%
                          </Badge>
                          {!p?.readiness?.is_ready ? (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={(p?.readiness?.checklist ?? []).filter((c: ProductChecklistItem) => !c.passed && c.key !== "is_active").map((c) => c.label).join("، ")}>
                              نواقص: {(p?.readiness?.checklist ?? []).filter((c: ProductChecklistItem) => !c.passed && c.key !== "is_active").slice(0, 2).map((c) => c.label).join("، ")}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          if (p.visibility_status === "archived") {
                            return <Badge variant="secondary" className="text-[10px]">مؤرشف</Badge>;
                          }
                          if (isPubliclyVisible) {
                            return <Badge variant="default" className="text-[10px]">ظاهر في المتجر</Badge>;
                          }
                          if (p.is_active) {
                            return <Badge variant="secondary" className="text-[10px]">نشط داخلياً — غير منشور</Badge>;
                          }
                          return <Badge variant="secondary" className="text-[10px]">معطل</Badge>;
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link to={editHref}>
                            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs font-medium">
                              تعديل
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => updateStatus.mutate({ id: p.id, isActive: targetIsActive })}
                            disabled={updateStatus.isPending}
                          >
                            {buttonLabel}
                          </Button>
                          {context.scope === "merchant" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => duplicateMutation.mutate(p.id)}
                              disabled={duplicateMutation.isPending}
                              title="نسخ المنتج"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Footer */}
        {hasMerchantSelection && total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 bg-muted/20 text-xs">
            <span className="text-muted-foreground">
              عرض {startRow}–{endRow} من {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-medium"
                onClick={() => handlePageChange(Math.max(1, effectivePage - 1))}
                disabled={effectivePage <= 1 || isLoading}
              >
                السابق
              </Button>
              <span className="text-muted-foreground px-2">
                صفحة {effectivePage} من {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-medium"
                onClick={() => handlePageChange(Math.min(totalPages, effectivePage + 1))}
                disabled={effectivePage >= totalPages || isLoading}
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
