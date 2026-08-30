import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
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

  const { data: productsData, isLoading, error, refetch } = useQuery({
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
    onError: (error: unknown) => {
      const message = String((error as { message?: string })?.message ?? "");
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
      // The backend creates the product as a draft when the quick payload does not meet the
      // activation readiness rules (e.g. no image or description) — say so instead of implying
      // it went live.
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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-bold">{title}</h2>
        <div className="flex items-center gap-2">
          {context.scope === "platform" && selectedMerchant ? (
            <Badge variant="secondary">التاجر: {selectedMerchant.display_name ?? "—"}</Badge>
          ) : null}
          {productsCountLabel ? <Badge variant="outline">{productsCountLabel}</Badge> : null}
          {createPath && (
            <Link to={createHref}>
              <Button disabled={context.scope === "platform" && !merchantFilter}>إضافة منتج</Button>
            </Link>
          )}
          {context.scope === "merchant" ? (
            <>
              <Link to="/merchant/products/import">
                <Button variant="outline">استيراد ملف المنتجات</Button>
              </Link>
              <Button variant="outline" onClick={() => setQuickAddOpen((v) => !v)}>
                إضافة سريعة
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {quickAddOpen ? (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <p className="text-sm font-semibold">إضافة سريعة</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <Input placeholder="الاسم" value={quickAdd.name} onChange={(e) => setQuickAdd((p) => ({ ...p, name: e.target.value }))} />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={quickAdd.category_id}
              onChange={(e) => setQuickAdd((p) => ({ ...p, category_id: e.target.value }))}
            >
              <option value="">القسم</option>
              {assignableCategoryOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <Input placeholder="السعر" type="number" value={quickAdd.price} onChange={(e) => setQuickAdd((p) => ({ ...p, price: e.target.value }))} />
            <Input placeholder="المخزون" type="number" value={quickAdd.stock} onChange={(e) => setQuickAdd((p) => ({ ...p, stock: e.target.value }))} />
            <Input placeholder="رابط الصورة (اختياري)" value={quickAdd.image_url} onChange={(e) => setQuickAdd((p) => ({ ...p, image_url: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => quickAddMutation.mutate()}
              disabled={quickAddMutation.isPending || !quickAdd.name.trim() || !quickAdd.category_id || Number(quickAdd.price) <= 0}
            >
              حفظ المنتج
            </Button>
            <Button variant="outline" onClick={() => setQuickAddOpen(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative md:w-80">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-9"
            placeholder="بحث عن منتج..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
            }}
          />
        </div>
        {context.scope === "platform" && (
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-64"
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
          className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-52"
          value={readinessFilter}
          onChange={(e) => handleReadinessChange(e.target.value as "all" | "ready" | "not_ready")}
        >
          <option value="all">كل الجاهزية</option>
          <option value="ready">جاهز</option>
          <option value="not_ready">غير جاهز</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {context.scope === "merchant" && selectedIds.length > 0 ? (
          <div className="border-b p-3 flex flex-col md:flex-row gap-2 md:items-center">
            <span className="text-sm text-muted-foreground">تم اختيار {selectedIds.length} منتج</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm md:w-48"
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
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm md:w-52" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
                <option value="">اختر الفئة</option>
                {assignableCategoryOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            ) : bulkAction === "update_stock" || bulkAction === "adjust_price_percent" ? (
              <Input className="md:w-40" placeholder={bulkAction === "update_stock" ? "المخزون" : "النسبة المئوية"} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
            ) : null}
            <Button size="sm" onClick={() => bulkActionMutation.mutate()} disabled={bulkActionMutation.isPending || !bulkAction}>
              تنفيذ
            </Button>
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              {context.scope === "merchant" ? (
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={products.length > 0 && products.every((p: ProductItem) => selectedIds.includes(p.id))}
                    onChange={(e) => setSelectedIds(e.target.checked ? products.map((p: ProductItem) => p.id) : [])}
                  />
                </TableHead>
              ) : null}
              <TableHead className="text-right">المنتج</TableHead>
              <TableHead className="text-right">القسم</TableHead>
              {context.scope === "platform" && <TableHead className="text-right">التاجر</TableHead>}
              <TableHead className="text-right">السعر</TableHead>
              <TableHead className="text-right">المخزون</TableHead>
              <TableHead className="text-right">جاهزية الكتالوج</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-center">إجراءات</TableHead>
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
            ) : error ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center">
                  <div className="space-y-2">
                    <p className="text-sm text-destructive">تعذر تحميل المنتجات. يرجى إعادة المحاولة.</p>
                    <p className="text-xs text-muted-foreground">{String((error as { message?: string })?.message ?? "")}</p>
                    <Button size="sm" variant="outline" onClick={() => refetch()}>
                      إعادة المحاولة
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              products.map((p: ProductItem) => {
                const isFocused = focusId === p.id;
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
                          checked={selectedIds.includes(p.id)}
                          onChange={(e) => setSelectedIds((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.categories?.name ?? "—"}</TableCell>
                    {context.scope === "platform" && <TableCell>{p.merchants?.display_name ?? "—"}</TableCell>}
                    <TableCell>{formatPrice(p.discount_price ?? p.price)}</TableCell>
                    <TableCell>{p.stock ?? 0}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant={p?.readiness?.is_ready ? "default" : "secondary"}>{p?.readiness?.score ?? 0}%</Badge>
                        {!p?.readiness?.is_ready ? (
                          <p className="text-[11px] text-muted-foreground">
                            نواقص: {(p?.readiness?.checklist ?? []).filter((c: ProductChecklistItem) => !c.passed && c.key !== "is_active").slice(0, 2).map((c) => c.label).join("، ")}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        if (p.visibility_status === "archived") {
                          return <Badge variant="secondary">مؤرشف</Badge>;
                        }
                        const isPubliclyVisible =
                          p.is_active === true &&
                          p.is_published === true &&
                          p.visibility_status === "public";
                        if (isPubliclyVisible) {
                          return <Badge variant="default">ظاهر في المتجر</Badge>;
                        }
                        if (p.is_active) {
                          return <Badge variant="secondary">نشط داخلياً — غير منشور</Badge>;
                        }
                        return <Badge variant="secondary">معطل</Badge>;
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        {(() => {
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
                            <Link to={editHref}>
                              <Button size="sm" variant="outline">
                                تعديل
                              </Button>
                            </Link>
                          );
                        })()}
                        {(() => {
                          const isPubliclyVisible =
                            p.is_active === true &&
                            p.is_published === true &&
                            p.visibility_status === "public";

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

                          return (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateStatus.mutate({ id: p.id, isActive: targetIsActive })}
                              disabled={updateStatus.isPending}
                            >
                              {buttonLabel}
                            </Button>
                          );
                        })()}
                        {context.scope === "merchant" ? (
                          <Button size="sm" variant="ghost" onClick={() => duplicateMutation.mutate(p.id)} disabled={duplicateMutation.isPending}>
                            نسخ المنتج
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

        {hasMerchantSelection && total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 bg-muted/20 text-sm">
            <span className="text-muted-foreground">
              عرض {startRow}–{endRow} من {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(Math.max(1, effectivePage - 1))}
                disabled={effectivePage <= 1 || isLoading}
              >
                السابق
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                صفحة {effectivePage} من {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
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
