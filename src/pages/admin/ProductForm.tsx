import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { ArrowRight, CalendarDays, Save, Upload, X } from "lucide-react";
import { attachScopeToPayload, merchantScope, platformScope } from "@/lib/data-scope";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { apiClient } from "@/lib/api-client";
import { listAssignableCategoryOptions } from "@/lib/category-assignability";
import { codePointLength } from "@/lib/text-length";
import { getCommercialPolicyProfile, resolveMerchantCommercialPolicyProfile } from "@/lib/commercial-policy-profiles";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const KNOWN_BRANDS = [
    "Wahl",
    "Andis",
    "Babyliss Pro",
    "Panasonic",
    "Philips",
    "Kemei",
    "Geemy",
    "Moser",
    "Oster",
    "Dingling",
];

function toLocalDateInput(value?: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatThousandsInput(value?: string | null) {
    if (!value) return "";
    const digitsOnly = String(value).replace(/[^\d]/g, "");
    if (!digitsOnly) return "";
    return digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function parseThousandsInput(value?: string | null) {
    if (!value) return 0;
    const normalized = String(value).replace(/,/g, "").trim();
    if (!normalized) return 0;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
}

function parsePercentInput(value?: string | null) {
    if (!value) return 0;
    const normalized = String(value).replace(/[^\d.]/g, "").trim();
    if (!normalized) return 0;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
}

function parseCommaValues(value?: string | null) {
    if (!value) return [];
    return Array.from(
        new Set(
            value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    );
}

export default function AdminProductForm() {
    const { id } = useParams();
    const navigate = useNavigate();
  const location = useLocation();
    const queryClient = useQueryClient();
    const isEdit = !!id;
  const preselectedMerchantId = new URLSearchParams(location.search).get("merchant_id") ?? "";
  const returnTo = new URLSearchParams(location.search).get("return_to");

    const [loading, setLoading] = useState(false);
    const [discountMode, setDiscountMode] = useState<"final_price" | "amount_off" | "percent_off">("final_price");
    const [colorInput, setColorInput] = useState("");
    const [sizeInput, setSizeInput] = useState("");
    const { isAdmin, isMerchantUser } = useAuth();
    const { data: membership } = useCurrentMerchant();
    const merchantIdFromMembership = (membership as any)?.merchant_id as string | undefined;
    const hasValidScope = !isMerchantUser || !!merchantIdFromMembership;
    const scope = isMerchantUser && merchantIdFromMembership ? merchantScope(merchantIdFromMembership) : platformScope();
    const [images, setImages] = useState<string[]>([]);
    const [brandMode, setBrandMode] = useState<"known" | "custom">("known");
    const [form, setForm] = useState({
        name: "",
        slug: "",
        description: "",
        short_description: "",
        price: "",
        discount_price: "",
        category_id: "",
        stock: "0",
        purchase_price: "0",
        low_stock_threshold: "5",
        is_active: false,
        is_featured: false,
        is_new: false,
        is_best_seller: false,
        is_mobile_promo: false,
        mobile_promo_image_url: "",
        offer_ends_at: "",
        loyalty_points_enabled: true,
        merchant_id: "",
        brand: "",
        colors: "",
        sizes: "",
        dimensions: "",
        weight_grams: "",
        // B2B Segmentation Fields (M26)
        target_audience: "all",        // comma-string → TEXT[]
        business_type_tags: "all",     // comma-string → TEXT[]
        product_use_cases: "",         // comma-string → TEXT[]
        visible_in: "web_store",       // comma-string → TEXT[]
        purchase_mode: "retail",       // comma-string → TEXT[]
        is_b2b_offer: false,
        requires_verified_salon: false,
        min_order_qty: "",
        max_order_qty: "",
    });

    const { data: categories } = useQuery({
        queryKey: ["admin-categories-list"],
        queryFn: () => apiClient.getCategoriesAdminList(),
    });
    const assignableCategoryOptions = useMemo(() => {
        const pool = (categories ?? []).filter((c: any) => isAdmin || c.is_active !== false);
        return listAssignableCategoryOptions(pool, { includeInactive: isAdmin });
    }, [categories, isAdmin]);

    const { data: merchants } = useQuery({
        queryKey: ["admin-merchants-list"],
        enabled: isAdmin,
        queryFn: () => apiClient.getActiveMerchants(),
    });

    const { data: product } = useQuery({
        queryKey: ["admin-product-edit", id],
        queryFn: async () => {
            if (!id) return null;
            return apiClient.getProductById(id, {
                merchant_id: scope.kind === "merchant" ? scope.merchantId : undefined,
            });
        },
        enabled: isEdit && hasValidScope,
    });

    useEffect(() => {
        if (product) {
            setForm({
                name: product.name,
                slug: product.slug,
                description: product.description || "",
                short_description: product.short_description || "",
                price: formatThousandsInput(product.price?.toString()),
                discount_price: formatThousandsInput(product.discount_price?.toString() || ""),
                category_id: product.category_id || "",
                stock: product.stock?.toString() || "0",
                purchase_price: formatThousandsInput((product as any).purchase_price?.toString() || "0"),
                low_stock_threshold: (product as any).low_stock_threshold?.toString() || "5",
                is_active: (product as any).is_active ?? true,
                is_featured: (product as any).is_featured ?? false,
                is_new: (product as any).is_new ?? false,
                is_best_seller: (product as any).is_best_seller ?? false,
                is_mobile_promo: (product as any).is_mobile_promo ?? false,
                mobile_promo_image_url: (product as any).mobile_promo_image_url ?? "",
                offer_ends_at: toLocalDateInput((product as any).offer_ends_at),
                loyalty_points_enabled: (product as any).loyalty_points_enabled ?? true,
                merchant_id: (product as any).merchant_id ?? "",
                brand: (product as any).brand ?? "",
                colors: Array.isArray((product as any).colors) ? ((product as any).colors as string[]).join(", ") : "",
                sizes: Array.isArray((product as any).sizes) ? ((product as any).sizes as string[]).join(", ") : "",
                dimensions: (product as any).dimensions ?? "",
                weight_grams: (product as any).weight_grams != null ? String((product as any).weight_grams) : "",
                // B2B Segmentation Fields (M26)
                target_audience: Array.isArray((product as any).target_audience)
                    ? ((product as any).target_audience as string[]).join(", ")
                    : (product as any).target_audience ?? "all",
                business_type_tags: Array.isArray((product as any).business_type_tags)
                    ? ((product as any).business_type_tags as string[]).join(", ")
                    : (product as any).business_type_tags ?? "all",
                product_use_cases: Array.isArray((product as any).product_use_cases)
                    ? ((product as any).product_use_cases as string[]).join(", ")
                    : "",
                visible_in: Array.isArray((product as any).visible_in)
                    ? ((product as any).visible_in as string[]).join(", ")
                    : (product as any).visible_in ?? "web_store",
                purchase_mode: Array.isArray((product as any).purchase_mode)
                    ? ((product as any).purchase_mode as string[]).join(", ")
                    : (product as any).purchase_mode ?? "retail",
                is_b2b_offer: (product as any).is_b2b_offer ?? false,
                requires_verified_salon: (product as any).requires_verified_salon ?? false,
                min_order_qty: (product as any).min_order_qty != null ? String((product as any).min_order_qty) : "",
                max_order_qty: (product as any).max_order_qty != null ? String((product as any).max_order_qty) : "",
            });
            setImages(product.images || []);
        }
    }, [product]);

    useEffect(() => {
        if (!form.brand) {
            setBrandMode("known");
            return;
        }
        setBrandMode(KNOWN_BRANDS.includes(form.brand) ? "known" : "custom");
    }, [form.brand]);

    useEffect(() => {
        if (brandMode === "known" && !form.brand) {
            setForm((prev) => ({ ...prev, brand: KNOWN_BRANDS[0] }));
        }
    }, [brandMode, form.brand]);

    useEffect(() => {
        if (isEdit) return;
        if (isMerchantUser && merchantIdFromMembership && form.merchant_id !== merchantIdFromMembership) {
            setForm((prev) => ({ ...prev, merchant_id: merchantIdFromMembership }));
            return;
        }
        if (isAdmin && preselectedMerchantId && form.merchant_id !== preselectedMerchantId) {
            setForm((prev) => ({ ...prev, merchant_id: preselectedMerchantId }));
            return;
        }
        if (isAdmin && !form.merchant_id && merchants && merchants.length > 0) {
            setForm((prev) => ({ ...prev, merchant_id: merchants[0].id }));
        }
    }, [form.merchant_id, isAdmin, isEdit, isMerchantUser, merchantIdFromMembership, merchants, preselectedMerchantId]);

    const generateSlug = (name: string) => {
        return name
            .toLowerCase()
            .replace(/[^\w\s\u0600-\u06FF]/g, "")
            .replace(/\s+/g, "-");
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setForm(prev => ({
            ...prev,
            name: val,
            slug: isEdit ? prev.slug : generateSlug(val)
        }));
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        try {
            const base64Data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result;
                    if (typeof result !== "string") {
                        reject(new Error("Failed to read file"));
                        return;
                    }
                    const payload = result.split(",")[1];
                    if (!payload) {
                        reject(new Error("Invalid file payload"));
                        return;
                    }
                    resolve(payload);
                };
                reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
                reader.readAsDataURL(file);
            });

            const uploaded = await apiClient.uploadProductImage({
                file_name: file.name,
                content_type: file.type || "image/jpeg",
                base64_data: base64Data,
                ...(id ? { product_id: id } : { merchant_id: form.merchant_id || merchantIdFromMembership }),
            });

            setImages(prev => [...prev, uploaded.public_url]);
            toast.success("تم رفع الصورة بنجاح");
        } catch (error: any) {
            toast.error(error.message || "خطأ أثناء الرفع");
        } finally {
            setLoading(false);
        }
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handlePromoImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        try {
            const base64Data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result;
                    if (typeof result !== "string") {
                        reject(new Error("Failed to read file"));
                        return;
                    }
                    const payload = result.split(",")[1];
                    if (!payload) {
                        reject(new Error("Invalid file payload"));
                        return;
                    }
                    resolve(payload);
                };
                reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
                reader.readAsDataURL(file);
            });

            const uploaded = await apiClient.uploadProductImage({
                file_name: file.name,
                content_type: file.type || "image/jpeg",
                base64_data: base64Data,
                ...(id ? { product_id: id } : { merchant_id: form.merchant_id || merchantIdFromMembership }),
            });

            setForm((prev) => ({ ...prev, mobile_promo_image_url: uploaded.public_url }));
            toast.success("تم رفع صورة بلوك الموبايل بنجاح");
        } catch (error: any) {
            toast.error(error.message || "خطأ أثناء الرفع");
        } finally {
            setLoading(false);
        }
    };
    const colorChips = useMemo(() => parseCommaValues(form.colors), [form.colors]);
    const sizeChips = useMemo(() => parseCommaValues(form.sizes), [form.sizes]);

    const addChipValue = (field: "colors" | "sizes", rawValue: string) => {
        const cleaned = rawValue.trim();
        if (!cleaned) return;
        const current = parseCommaValues(form[field]);
        const next = Array.from(new Set([...current, cleaned]));
        setForm((prev) => ({ ...prev, [field]: next.join(", ") }));
    };

    const removeChipValue = (field: "colors" | "sizes", value: string) => {
        const next = parseCommaValues(form[field]).filter((item) => item !== value);
        setForm((prev) => ({ ...prev, [field]: next.join(", ") }));
    };

    const moveImage = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= images.length) return;
        setImages((prev) => {
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return next;
        });
    };

    const setPrimaryImage = (index: number) => {
        if (index <= 0) return;
        setImages((prev) => {
            const next = [...prev];
            const [selected] = next.splice(index, 1);
            next.unshift(selected);
            return next;
        });
    };

    const productReadiness = (() => {
        const basePrice = parseThousandsInput(form.price);
        const parsedDiscountValue = parseThousandsInput(form.discount_price);
        const parsedDiscountPercent = parsePercentInput(form.discount_price);
        const resolvedDiscountedPrice =
            discountMode === "final_price"
                ? parsedDiscountValue
                : discountMode === "amount_off"
                    ? Math.round(Math.max(basePrice - parsedDiscountValue, 0))
                    : Math.round(Math.max(basePrice - basePrice * (parsedDiscountPercent / 100), 0));
        const hasDiscountInput = Boolean(form.discount_price.trim());
        const isDiscountValid = !hasDiscountInput || (basePrice > 0 && resolvedDiscountedPrice > 0 && resolvedDiscountedPrice < basePrice);
        const checks = [
            { key: "name_completed", label: "اسم المنتج", passed: Boolean(form.name.trim()) },
            { key: "slug_completed", label: "الرابط (slug)", passed: Boolean(form.slug.trim()) },
            { key: "price_valid", label: "سعر البيع", passed: parseThousandsInput(form.price) > 0 },
            { key: "category_linked", label: "ربط القسم", passed: Boolean(form.category_id) },
            { key: "image_present", label: "صورة واحدة على الأقل", passed: images.length > 0 },
            { key: "stock_valid", label: "المخزون", passed: Number(form.stock || 0) >= 0 },
            {
                key: "discount_valid",
                label: "صلاحية الخصم",
                passed: isDiscountValid,
            },
            { key: "description_present", label: "وصف المنتج", passed: Boolean(form.description.trim()) },
            { key: "is_active", label: "المنتج مفعل", passed: Boolean(form.is_active) },
        ];
        const passedChecks = checks.filter((c) => c.passed).length;
        const totalChecks = checks.length;
        return {
            checks,
            score: Math.round((passedChecks / totalChecks) * 100),
            isReady: checks.every((c) => c.passed),
            passedChecks,
            totalChecks,
        };
    })();
    const policyMerchantId = form.merchant_id || merchantIdFromMembership || null;
    const { data: activePolicyData } = useQuery({
        queryKey: ["commercial-policy-assignment-product-form", policyMerchantId],
        queryFn: () => resolveMerchantCommercialPolicyProfile(policyMerchantId),
        enabled: Boolean(policyMerchantId),
    });
    const activePolicy = activePolicyData ?? getCommercialPolicyProfile("balanced");
    const discountPreview = useMemo(() => {
        const basePrice = parseThousandsInput(form.price);
        const hasDiscountInput = Boolean(form.discount_price.trim());
        if (!hasDiscountInput || basePrice <= 0) {
            return {
                hasDiscountInput,
                isValid: true,
                discountedPrice: null as number | null,
                discountAmount: 0,
                discountPercent: 0,
            };
        }

        const discountValue = parseThousandsInput(form.discount_price);
        const discountPercentInput = parsePercentInput(form.discount_price);
        let discountedPrice = 0;
        if (discountMode === "final_price") {
            discountedPrice = discountValue;
        } else if (discountMode === "amount_off") {
            discountedPrice = Math.round(basePrice - discountValue);
        } else {
            discountedPrice = Math.round(basePrice - basePrice * (discountPercentInput / 100));
        }
        const isValid = discountedPrice > 0 && discountedPrice < basePrice;
        const discountAmount = Math.max(basePrice - discountedPrice, 0);
        const discountPercent = basePrice > 0 ? (discountAmount / basePrice) * 100 : 0;
        return {
            hasDiscountInput,
            isValid,
            discountedPrice,
            discountAmount,
            discountPercent,
        };
    }, [discountMode, form.discount_price, form.price]);
    const pricingPreview = useMemo(() => {
        const basePrice = parseThousandsInput(form.price);
        const purchasePrice = parseThousandsInput(form.purchase_price);
        const finalPrice = discountPreview.hasDiscountInput && discountPreview.isValid && discountPreview.discountedPrice
            ? discountPreview.discountedPrice
            : basePrice;
        const grossProfit = Math.max(finalPrice - purchasePrice, 0);
        const grossMarginPercent = finalPrice > 0 ? (grossProfit / finalPrice) * 100 : 0;
        return {
            basePrice,
            purchasePrice,
            finalPrice,
            grossProfit,
            grossMarginPercent,
        };
    }, [discountPreview, form.price, form.purchase_price]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.merchant_id) {
            toast.error("يرجى اختيار التاجر قبل حفظ المنتج");
            return;
        }
        if (form.is_active && !productReadiness.isReady) {
            toast.error("لا يمكن حفظ منتج نشط قبل استكمال الجاهزية. احفظه كمسودة أولاً أو أكمل الحقول الناقصة.");
            return;
        }
        if (discountPreview.hasDiscountInput && !discountPreview.isValid) {
            toast.error("قيمة الخصم غير صالحة. تحقق من السعر النهائي أو مبلغ/نسبة الخصم.");
            return;
        }
        if (discountPreview.hasDiscountInput && discountPreview.discountPercent > activePolicy.maxDiscountPercent) {
            toast.error(`سياسة ${activePolicy.label}: الخصم الأقصى المسموح ${activePolicy.maxDiscountPercent}%`);
            return;
        }
        setLoading(true);

        const shortTrimmed = form.short_description.trim();
        const shortLen = codePointLength(shortTrimmed);
        if (!isEdit) {
            if (shortLen < 40 || shortLen > 280) {
                toast.error("الوصف المختصر مطلوب للمنتجات الجديدة (40–280 حرفاً).");
                setLoading(false);
                return;
            }
        } else if (shortLen > 0 && (shortLen < 40 || shortLen > 280)) {
            toast.error("الوصف المختصر يجب أن يكون بين 40 و280 حرفاً، أو اتركه فارغاً للمنتجات القديمة.");
            setLoading(false);
            return;
        }

        const payload = {
            name: form.name,
            slug: form.slug,
            description: form.description,
            short_description: shortTrimmed || null,
            price: parseThousandsInput(form.price),
            discount_price: discountPreview.hasDiscountInput ? discountPreview.discountedPrice : null,
            category_id: form.category_id || null,
            stock: parseInt(form.stock),
            purchase_price: parseThousandsInput(form.purchase_price),
            low_stock_threshold: parseInt(form.low_stock_threshold),
            is_active: form.is_active,
            is_featured: form.is_featured,
            is_new: form.is_new,
            is_best_seller: form.is_best_seller,
            is_mobile_promo: form.is_mobile_promo,
            mobile_promo_image_url: form.mobile_promo_image_url || null,
            offer_ends_at: form.offer_ends_at ? `${form.offer_ends_at}T23:59:59` : null,
            images,
            loyalty_points_enabled: form.loyalty_points_enabled,
            merchant_id: form.merchant_id || null,
            brand: form.brand.trim() || null,
            colors: form.colors.split(",").map((x) => x.trim()).filter(Boolean),
            sizes: form.sizes.split(",").map((x) => x.trim()).filter(Boolean),
            dimensions: form.dimensions.trim() || null,
            weight_grams: form.weight_grams.trim() ? Number(form.weight_grams) : null,
            // B2B Segmentation Fields (M26)
            target_audience: parseCommaValues(form.target_audience).length ? parseCommaValues(form.target_audience) : ["all"],
            business_type_tags: parseCommaValues(form.business_type_tags).length ? parseCommaValues(form.business_type_tags) : ["all"],
            product_use_cases: parseCommaValues(form.product_use_cases),
            visible_in: parseCommaValues(form.visible_in).length ? parseCommaValues(form.visible_in) : ["web_store"],
            purchase_mode: parseCommaValues(form.purchase_mode).length ? parseCommaValues(form.purchase_mode) : ["retail"],
            is_b2b_offer: form.is_b2b_offer,
            requires_verified_salon: form.requires_verified_salon,
            min_order_qty: form.min_order_qty.trim() ? parseInt(form.min_order_qty) : null,
            max_order_qty: form.max_order_qty.trim() ? parseInt(form.max_order_qty) : null,
        };

        try {
            const scopedPayload = attachScopeToPayload(payload, scope);
            if (isEdit) {
                if (!id) throw new Error("Missing product id");
                await apiClient.updateProduct(id, scopedPayload as Record<string, unknown>, {
                    merchant_id: scope.kind === "merchant" ? scope.merchantId : undefined,
                });
            } else {
                await apiClient.createProduct(scopedPayload as Record<string, unknown>);
            }

            toast.success(isEdit ? "تم تحديث المنتج" : "تمت إضافة المنتج");
            queryClient.invalidateQueries({ queryKey: ["admin-products"] });
            queryClient.invalidateQueries({ queryKey: ["scoped-products"] });
            if (returnTo) {
                navigate(returnTo);
            } else if (isMerchantUser) {
                navigate("/merchant/products");
            } else if (form.merchant_id) {
                navigate(`/admin/products?merchant_id=${encodeURIComponent(form.merchant_id)}`);
            } else {
                navigate("/admin/products");
            }
        } catch (error: any) {
            const message = String(error?.message ?? "");
            if (message.includes("PRODUCT_NOT_READY")) {
                toast.error("لا يمكن حفظ المنتج كمنتج نشط قبل استكمال الجاهزية.");
            } else if (message.includes("PRODUCT_SLUG_EXISTS")) {
                toast.error("الرابط (slug) مستخدم مسبقًا لهذا التاجر.");
            } else if (message.includes("Discount price must be positive and lower than base price")) {
                toast.error("سعر الخصم يجب أن يكون أقل من سعر البيع وأكبر من صفر.");
            } else if (message.includes("Offer end date requires a valid discount price")) {
                toast.error("لا يمكن تحديد نهاية عرض بدون سعر خصم صالح.");
            } else if (message.includes("Offer end date must be in the future")) {
                toast.error("تاريخ انتهاء العرض يجب أن يكون في المستقبل.");
            } else if (message.includes("Merchandising flags require product to be active")) {
                toast.error("لا يمكن تفعيل التمييز/الجديد/الأكثر مبيعاً إلا لمنتج نشط.");
            } else if (message.includes("Featured/best-seller products must have stock above zero")) {
                toast.error("لا يمكن جعل المنتج مميزًا أو الأكثر مبيعًا إذا كان المخزون صفر.");
            } else {
                toast.error(error.message || "حدث خطأ");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        !hasValidScope ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-muted-foreground">
                لا يمكن تحديد نطاق التاجر لهذا المستخدم حالياً.
            </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() => {
                        if (returnTo) {
                            navigate(returnTo);
                            return;
                        }
                        if (isMerchantUser) {
                            navigate("/merchant/products");
                            return;
                        }
                        if (preselectedMerchantId) {
                            navigate(`/admin/products?merchant_id=${encodeURIComponent(preselectedMerchantId)}`);
                            return;
                        }
                        navigate("/admin/products");
                    }}
                >
                    <ArrowRight size={20} />
                </Button>
                <h2 className="text-2xl font-bold">{isEdit ? "تعديل المنتج" : "منتج جديد"}</h2>
                <Button className="mr-auto gap-2" disabled={loading} type="submit">
                    <Save size={18} />
                    {isEdit ? "حفظ التغييرات" : "إضافة المنتج"}
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>المعلومات الأساسية</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">اسم المنتج *</Label>
                                <Input id="name" value={form.name} onChange={handleNameChange} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="slug">الرابط (Slug) *</Label>
                                <Input id="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required dir="ltr" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="short_description">وصف مختصر{!isEdit ? " *" : ""}</Label>
                                <p className="text-[11px] text-muted-foreground">
                                    يظهر في بطاقة المنتج وأعلى صفحة التفاصيل. اكتب وصفاً واضحاً بين 90 و180 حرفاً دون ادعاءات غير موثقة.
                                </p>
                                <Textarea
                                    id="short_description"
                                    value={form.short_description}
                                    onChange={(e) => setForm({ ...form, short_description: e.target.value })}
                                    rows={3}
                                />
                                <div className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className="text-muted-foreground">{codePointLength(form.short_description.trim())} / 280</span>
                                    {form.short_description.trim().length > 0 &&
                                    (codePointLength(form.short_description.trim()) < 40 || codePointLength(form.short_description.trim()) > 280) ? (
                                        <span className="text-destructive">الطول يجب أن يكون بين 40 و280 حرفاً</span>
                                    ) : null}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">وصف تفصيلي</Label>
                                <p className="text-[11px] text-muted-foreground">
                                    اختياري. أضف النوتات أو الاستخدام أو التفاصيل فقط عند توفر مصدر موثوق.
                                </p>
                                <Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={5} />
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>العلامة التجارية</Label>
                                    <Select
                                        value={brandMode}
                                        onValueChange={(v: "known" | "custom") => {
                                            setBrandMode(v);
                                            if (v === "known" && form.brand && !KNOWN_BRANDS.includes(form.brand)) {
                                                setForm((prev) => ({ ...prev, brand: KNOWN_BRANDS[0] }));
                                            }
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="known">اختيار من العلامات المعروفة</SelectItem>
                                            <SelectItem value="custom">كتابة علامة جديدة</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {brandMode === "known" ? (
                                        <Select value={form.brand || KNOWN_BRANDS[0]} onValueChange={(v) => setForm((prev) => ({ ...prev, brand: v }))}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="اختر العلامة التجارية" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {KNOWN_BRANDS.map((brand) => (
                                                    <SelectItem key={brand} value={brand}>
                                                        {brand}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input
                                            value={form.brand}
                                            onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))}
                                            placeholder="اكتب العلامة التجارية"
                                        />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="dimensions">القياسات/الأبعاد</Label>
                                    <Input
                                        id="dimensions"
                                        value={form.dimensions}
                                        onChange={(e) => setForm((prev) => ({ ...prev, dimensions: e.target.value }))}
                                        placeholder="مثال: 20x10x5 سم"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="colors">الألوان (مفصولة بفاصلة)</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="colors"
                                            value={colorInput}
                                            onChange={(e) => setColorInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === ",") {
                                                    e.preventDefault();
                                                    addChipValue("colors", colorInput.replace(/,/g, ""));
                                                    setColorInput("");
                                                }
                                            }}
                                            placeholder="اكتب اللون ثم Enter"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                addChipValue("colors", colorInput);
                                                setColorInput("");
                                            }}
                                        >
                                            إضافة
                                        </Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {colorChips.map((color) => (
                                            <button
                                                key={color}
                                                type="button"
                                                className="rounded-full border px-3 py-1 text-xs hover:bg-muted/40"
                                                onClick={() => removeChipValue("colors", color)}
                                                title="حذف"
                                            >
                                                {color} ×
                                            </button>
                                        ))}
                                    </div>
                                    <Input
                                        id="colors_raw"
                                        value={form.colors}
                                        onChange={(e) => setForm((prev) => ({ ...prev, colors: e.target.value }))}
                                        placeholder="أسود، فضي، ذهبي"
                                        className="hidden"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="sizes">الأحجام/المقاسات (مفصولة بفاصلة)</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="sizes"
                                            value={sizeInput}
                                            onChange={(e) => setSizeInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === ",") {
                                                    e.preventDefault();
                                                    addChipValue("sizes", sizeInput.replace(/,/g, ""));
                                                    setSizeInput("");
                                                }
                                            }}
                                            placeholder="اكتب المقاس ثم Enter"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                addChipValue("sizes", sizeInput);
                                                setSizeInput("");
                                            }}
                                        >
                                            إضافة
                                        </Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {sizeChips.map((size) => (
                                            <button
                                                key={size}
                                                type="button"
                                                className="rounded-full border px-3 py-1 text-xs hover:bg-muted/40"
                                                onClick={() => removeChipValue("sizes", size)}
                                                title="حذف"
                                            >
                                                {size} ×
                                            </button>
                                        ))}
                                    </div>
                                    <Input
                                        id="sizes_raw"
                                        value={form.sizes}
                                        onChange={(e) => setForm((prev) => ({ ...prev, sizes: e.target.value }))}
                                        placeholder="صغير، متوسط، كبير"
                                        className="hidden"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="weight_grams">الوزن بالجرام</Label>
                                    <Input
                                        id="weight_grams"
                                        type="number"
                                        min="0"
                                        dir="ltr"
                                        value={form.weight_grams}
                                        onChange={(e) => setForm((prev) => ({ ...prev, weight_grams: e.target.value }))}
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>الصور</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                                {images.map((img, idx) => (
                                    <div key={idx} className="relative aspect-square rounded border overflow-hidden group">
                                        <img src={img} className="w-full h-full object-cover" />
                                        {idx === 0 ? (
                                            <span className="absolute left-1 top-1 rounded bg-DilMart-store-gold/90 px-2 py-0.5 text-[10px] font-semibold text-black">
                                                رئيسية
                                            </span>
                                        ) : null}
                                        <div className="absolute bottom-1 left-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                            <Button type="button" variant="secondary" size="sm" className="h-7 px-2 text-[10px]" onClick={() => moveImage(idx, idx - 1)}>
                                                ↑
                                            </Button>
                                            <Button type="button" variant="secondary" size="sm" className="h-7 px-2 text-[10px]" onClick={() => moveImage(idx, idx + 1)}>
                                                ↓
                                            </Button>
                                            {idx !== 0 ? (
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    className="h-7 px-2 text-[10px]"
                                                    onClick={() => setPrimaryImage(idx)}
                                                >
                                                    اجعلها رئيسية
                                                </Button>
                                            ) : null}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeImage(idx)}
                                            className="absolute top-1 right-1 bg-destructive text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                <label className="aspect-square border-2 border-dashed rounded flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors">
                                    <Upload className="text-muted-foreground" size={24} />
                                    <span className="text-xs text-muted-foreground">رفع صورة</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleUpload} disabled={loading} />
                                </label>
                            </div>
                            <p className="text-xs text-muted-foreground">ملاحظة: الصورة الأولى ستكون الصورة الرئيسية للمنتج</p>
                        </CardContent>
                    </Card>

                    {/* B2B Segmentation Card (M26) — Admin only */}
                    {isAdmin && (
                    <Card className="border-blue-500/30 bg-blue-500/5">
                        <CardHeader>
                            <CardTitle className="text-blue-700 dark:text-blue-400">
                                🏪 إعدادات التقسيم B2B (Barber App)
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">
                                تحكم في ظهور المنتج في متجر الويب وتطبيق الحلاق (DilMart Barber App).
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* visible_in */}
                            <div className="space-y-1">
                                <Label htmlFor="visible_in">يظهر في (visible_in)</Label>
                                <p className="text-xs text-muted-foreground">القيم المتاحة: web_store، barber_app، all — مفصولة بفاصلة</p>
                                <Input
                                    id="visible_in"
                                    dir="ltr"
                                    value={form.visible_in}
                                    onChange={(e) => setForm((p) => ({ ...p, visible_in: e.target.value }))}
                                    placeholder="web_store, barber_app"
                                />
                            </div>
                            {/* target_audience */}
                            <div className="space-y-1">
                                <Label htmlFor="target_audience">الجمهور المستهدف (target_audience)</Label>
                                <p className="text-xs text-muted-foreground">القيم: all، salon_owner، barber_staff، professional_buyer، customer</p>
                                <Input
                                    id="target_audience"
                                    dir="ltr"
                                    value={form.target_audience}
                                    onChange={(e) => setForm((p) => ({ ...p, target_audience: e.target.value }))}
                                    placeholder="all"
                                />
                            </div>
                            {/* business_type_tags */}
                            <div className="space-y-1">
                                <Label htmlFor="business_type_tags">نوع النشاط التجاري (business_type_tags)</Label>
                                <p className="text-xs text-muted-foreground">القيم: all، men_barbershop، women_salon، nail_studio، mixed_salon</p>
                                <Input
                                    id="business_type_tags"
                                    dir="ltr"
                                    value={form.business_type_tags}
                                    onChange={(e) => setForm((p) => ({ ...p, business_type_tags: e.target.value }))}
                                    placeholder="all"
                                />
                            </div>
                            {/* product_use_cases */}
                            <div className="space-y-1">
                                <Label htmlFor="product_use_cases">حالات الاستخدام (product_use_cases)</Label>
                                <p className="text-xs text-muted-foreground">مثال: barber_tool، salon_equipment، furniture، consumable</p>
                                <Input
                                    id="product_use_cases"
                                    dir="ltr"
                                    value={form.product_use_cases}
                                    onChange={(e) => setForm((p) => ({ ...p, product_use_cases: e.target.value }))}
                                    placeholder="barber_tool, consumable"
                                />
                            </div>
                            {/* purchase_mode */}
                            <div className="space-y-1">
                                <Label htmlFor="purchase_mode">طريقة الشراء (purchase_mode)</Label>
                                <p className="text-xs text-muted-foreground">القيم: retail، b2b، wholesale</p>
                                <Input
                                    id="purchase_mode"
                                    dir="ltr"
                                    value={form.purchase_mode}
                                    onChange={(e) => setForm((p) => ({ ...p, purchase_mode: e.target.value }))}
                                    placeholder="retail"
                                />
                            </div>
                            {/* min/max_order_qty */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label htmlFor="min_order_qty">الحد الأدنى للطلب</Label>
                                    <Input
                                        id="min_order_qty"
                                        type="number"
                                        min="1"
                                        dir="ltr"
                                        value={form.min_order_qty}
                                        onChange={(e) => setForm((p) => ({ ...p, min_order_qty: e.target.value }))}
                                        placeholder="1"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="max_order_qty">الحد الأقصى للطلب</Label>
                                    <Input
                                        id="max_order_qty"
                                        type="number"
                                        min="1"
                                        dir="ltr"
                                        value={form.max_order_qty}
                                        onChange={(e) => setForm((p) => ({ ...p, max_order_qty: e.target.value }))}
                                        placeholder="100"
                                    />
                                </div>
                            </div>
                            {/* is_b2b_offer + requires_verified_salon */}
                            <div className="space-y-3 pt-1">
                                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                                    <div>
                                        <p className="text-sm font-medium">عرض B2B</p>
                                        <p className="text-xs text-muted-foreground">يظهر في قسم "عروض B2B" في تطبيق الحلاق</p>
                                    </div>
                                    <Switch
                                        id="is_b2b_offer"
                                        checked={form.is_b2b_offer}
                                        onCheckedChange={(v) => setForm((p) => ({ ...p, is_b2b_offer: v }))}
                                    />
                                </div>
                                <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                                    <div>
                                        <p className="text-sm font-medium">يتطلب صالون موثّق</p>
                                        <p className="text-xs text-muted-foreground">يُخفى عن المستخدمين غير الموثّقين من Barber App</p>
                                    </div>
                                    <Switch
                                        id="requires_verified_salon"
                                        checked={form.requires_verified_salon}
                                        onCheckedChange={(v) => setForm((p) => ({ ...p, requires_verified_salon: v }))}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    )}
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>جاهزية المنتج</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className={productReadiness.isReady ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                                    {productReadiness.isReady ? "جاهز للنشر" : "غير مكتمل"}
                                </span>
                                <span className="text-muted-foreground">
                                    {productReadiness.score}% ({productReadiness.passedChecks}/{productReadiness.totalChecks})
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <div className="h-full bg-primary transition-all" style={{ width: `${productReadiness.score}%` }} />
                            </div>
                            <div className="space-y-1 text-xs">
                                {productReadiness.checks.map((item) => (
                                    <div key={item.key} className="flex items-center justify-between">
                                        <span>{item.label}</span>
                                        <span className={item.passed ? "text-emerald-600" : "text-amber-600"}>
                                            {item.passed ? "مكتمل" : "ناقص"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Commercial Policy</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-xs text-muted-foreground">
                            <p>البروفايل: <span className="font-semibold text-foreground">{activePolicy.label}</span></p>
                            <p>{activePolicy.description}</p>
                            <p>أقصى خصم مسموح: {activePolicy.maxDiscountPercent}%</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>التسعير والمخزون</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-md border border-DilMart-store-gold/30 bg-DilMart-store-gold/10 p-3 text-xs space-y-1">
                                <p>
                                    سعر البيع: <span className="font-semibold">{formatThousandsInput(String(pricingPreview.basePrice))} د.ع</span>
                                </p>
                                <p>
                                    السعر النهائي المعروض: <span className="font-semibold">{formatThousandsInput(String(pricingPreview.finalPrice))} د.ع</span>
                                </p>
                                <p>
                                    الربح الإجمالي التقريبي: <span className="font-semibold">{formatThousandsInput(String(pricingPreview.grossProfit))} د.ع</span>
                                </p>
                                <p>
                                    هامش الربح: <span className="font-semibold">{pricingPreview.grossMarginPercent.toFixed(2)}%</span>
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="price">السعر الأساسي (للبيع) * - دينار عراقي (د.ع)</Label>
                                <Input
                                    id="price"
                                    type="text"
                                    inputMode="numeric"
                                    value={form.price}
                                    onChange={(e) => setForm({ ...form, price: formatThousandsInput(e.target.value) })}
                                    required
                                    dir="ltr"
                                />
                                <p className="text-[10px] text-muted-foreground italic">مثال: 1,250,000 د.ع</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="purchase_price">سعر الشراء (التكلفة) * - دينار عراقي (د.ع)</Label>
                                <Input
                                    id="purchase_price"
                                    type="text"
                                    inputMode="numeric"
                                    value={form.purchase_price}
                                    onChange={(e) => setForm({ ...form, purchase_price: formatThousandsInput(e.target.value) })}
                                    required
                                    dir="ltr"
                                />
                                <p className="text-[10px] text-muted-foreground italic">يُستخدم لحساب صافي الأرباح في التقارير</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="discount_price">سعر الخصم (اختياري) - دينار عراقي (د.ع)</Label>
                                <Select
                                    value={discountMode}
                                    onValueChange={(v: "final_price" | "amount_off" | "percent_off") => {
                                        setDiscountMode(v);
                                        setForm((prev) => ({ ...prev, discount_price: "" }));
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="final_price">السعر النهائي بعد الخصم</SelectItem>
                                        <SelectItem value="amount_off">مبلغ خصم ثابت</SelectItem>
                                        <SelectItem value="percent_off">نسبة خصم %</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                    id="discount_price"
                                    type="text"
                                    inputMode="numeric"
                                    value={form.discount_price}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            discount_price:
                                                discountMode === "percent_off"
                                                    ? e.target.value.replace(/[^\d.]/g, "")
                                                    : formatThousandsInput(e.target.value),
                                        })
                                    }
                                    placeholder={
                                        discountMode === "final_price"
                                            ? "أدخل السعر الذي سيظهر للزبون"
                                            : discountMode === "amount_off"
                                                ? "أدخل مبلغ الخصم الثابت"
                                                : "أدخل نسبة الخصم (مثال: 15)"
                                    }
                                    dir="ltr"
                                />
                                {discountPreview.hasDiscountInput ? (
                                    discountPreview.isValid ? (
                                        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs space-y-1">
                                            <p>
                                                السعر النهائي المعروض:{" "}
                                                <span className="font-semibold">{formatThousandsInput(String(discountPreview.discountedPrice))} د.ع</span>
                                            </p>
                                            <p>
                                                قيمة الخصم:{" "}
                                                <span className="font-semibold">{formatThousandsInput(String(discountPreview.discountAmount))} د.ع</span>
                                            </p>
                                            <p>
                                                نسبة الخصم: <span className="font-semibold">{discountPreview.discountPercent.toFixed(2)}%</span>
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-destructive">
                                            قيمة الخصم غير منطقية. يجب أن يكون السعر النهائي أقل من سعر البيع وأكبر من صفر.
                                        </p>
                                    )
                                ) : (
                                    <p className="text-[10px] text-muted-foreground italic">
                                        بعد الإدخال سيظهر لك تلقائياً السعر النهائي ونسبة الخصم الفعلية.
                                    </p>
                                )}
                            </div>
                            <div className="space-y-4 pt-2 border-t border-border mt-2">
                                <div className="space-y-2">
                                    <Label htmlFor="stock">الكمية المتوفرة</Label>
                                    <Input id="stock" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} dir="ltr" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="low_stock_threshold">حد التنبيه (Low Stock) *</Label>
                                    <Input id="low_stock_threshold" type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} required dir="ltr" />
                                </div>
                            </div>
                            <div className="space-y-2 border-t border-border pt-2">
                                <Label htmlFor="offer_ends_at">تاريخ انتهاء العرض (اختياري)</Label>
                                <div className="flex items-center gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                id="offer_ends_at"
                                                type="button"
                                                variant="outline"
                                                className="w-full justify-between text-right"
                                            >
                                                <span>
                                                    {form.offer_ends_at
                                                        ? format(new Date(`${form.offer_ends_at}T00:00:00`), "PPP", { locale: ar })
                                                        : "اختر تاريخ انتهاء العرض"}
                                                </span>
                                                <CalendarDays size={16} className="text-muted-foreground" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={form.offer_ends_at ? new Date(`${form.offer_ends_at}T00:00:00`) : undefined}
                                                onSelect={(date) => {
                                                    if (!date) return;
                                                    const year = date.getFullYear();
                                                    const month = String(date.getMonth() + 1).padStart(2, "0");
                                                    const day = String(date.getDate()).padStart(2, "0");
                                                    setForm((prev) => ({ ...prev, offer_ends_at: `${year}-${month}-${day}` }));
                                                }}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    {form.offer_ends_at ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setForm((prev) => ({ ...prev, offer_ends_at: "" }))}
                                            title="مسح التاريخ"
                                        >
                                            <X size={16} />
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>التصنيف والحالة</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {isAdmin ? (
                                <div className="space-y-2">
                                    <Label>التاجر *</Label>
                                    <Select value={form.merchant_id} onValueChange={(v) => setForm({ ...form, merchant_id: v })}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="اختر التاجر" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {merchants?.map((merchant: any) => (
                                                <SelectItem key={merchant.id} value={merchant.id}>
                                                    {merchant.display_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Label>التاجر</Label>
                                    <Input value={(membership?.merchants as any)?.display_name ?? "متجري"} disabled />
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label>القسم</Label>
                                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="اختر القسم" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {assignableCategoryOptions.map((opt) => (
                                            <SelectItem key={opt.id} value={opt.id} className={opt.parentName ? "text-sm" : "font-semibold"}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-muted-foreground">
                                    الأقسام التي لها أقسام فرعية نشطة غير قابلة للاختيار مباشرة.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="is_active">المنتج نشط؟</Label>
                                    <Switch id="is_active" checked={form.is_active} onCheckedChange={(val) => setForm({ ...form, is_active: val })} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="is_featured">منتج مميز؟</Label>
                                    <Switch id="is_featured" checked={form.is_featured} onCheckedChange={(val) => setForm({ ...form, is_featured: val })} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="is_best_seller">الأكثر مبيعاً؟</Label>
                                    <Switch id="is_best_seller" checked={form.is_best_seller} onCheckedChange={(val) => setForm({ ...form, is_best_seller: val })} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="is_new">وصل حديثاً؟</Label>
                                    <Switch id="is_new" checked={form.is_new} onCheckedChange={(val) => setForm({ ...form, is_new: val })} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="is_mobile_promo">إظهار في بلوك عروض الموبايل؟</Label>
                                        <p className="text-[10px] text-muted-foreground">
                                            عند التفعيل يظهر المنتج في بلوك العروض بين الأقسام السريعة والأكثر تداولًا.
                                        </p>
                                    </div>
                                    <Switch
                                        id="is_mobile_promo"
                                        checked={form.is_mobile_promo}
                                        onCheckedChange={(val) => setForm({ ...form, is_mobile_promo: val })}
                                    />
                                </div>
                                {form.is_mobile_promo && (
                                    <div className="space-y-2 rounded-lg border border-dashed border-DilMart-store-gold/25 p-3">
                                        <Label htmlFor="mobile_promo_image_url">صورة خاصة لبلوك عروض الموبايل</Label>
                                        <Input
                                            id="mobile_promo_image_url"
                                            value={form.mobile_promo_image_url}
                                            onChange={(e) => setForm({ ...form, mobile_promo_image_url: e.target.value })}
                                            placeholder="https://..."
                                            dir="ltr"
                                        />
                                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-muted/40">
                                            <Upload size={14} />
                                            رفع صورة خاصة
                                            <input type="file" className="hidden" accept="image/*" onChange={handlePromoImageUpload} disabled={loading} />
                                        </label>
                                        <p className="text-[10px] text-muted-foreground">
                                            ملاحظة التصميم: استخدم صورة بنسبة تقريبية 7:3 — المقاس الموصى به 1400x600 بكسل.
                                        </p>
                                        {form.mobile_promo_image_url ? (
                                            <div className="overflow-hidden rounded-md border">
                                                <img src={form.mobile_promo_image_url} alt="Mobile promo preview" className="h-24 w-full object-cover" />
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                                <div className="flex items-center justify-between pt-4 border-t border-dashed">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="loyalty_points_enabled">تفعيل نقاط الولاء</Label>
                                        <p className="text-[10px] text-muted-foreground">منح الزبون نقاط عند شراء هذا المنتج</p>
                                    </div>
                                    <Switch id="loyalty_points_enabled" checked={form.loyalty_points_enabled} onCheckedChange={(val) => setForm({ ...form, loyalty_points_enabled: val })} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </form>
        )
    );
}
