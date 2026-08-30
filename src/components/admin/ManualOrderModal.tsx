import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatPrice } from "@/lib/format";
import { Search, Plus, Trash2, ShoppingCart } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { ScopedContext } from "@/lib/scoped-queries";

interface ManualOrderModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    context?: ScopedContext;
}

export default function ManualOrderModal({ open, onOpenChange, context }: ManualOrderModalProps) {
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(false);
    const [searchProduct, setSearchProduct] = useState("");

    // Order State
    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [governorateId, setGovernorateId] = useState("");
    const [area, setArea] = useState("");
    const [landmark, setLandmark] = useState("");
    const [notes, setNotes] = useState("");
    const [deliveryCost, setDeliveryCost] = useState("5000");
    const [selectedItems, setSelectedItems] = useState<any[]>([]);
    const [intentToken, setIntentToken] = useState("");
    const [intentMeta, setIntentMeta] = useState<null | {
        id: string;
        intent_token: string;
        merchant_id: string;
        merchant_name: string;
        status: "CREATED" | "OPENED" | "EXPIRED" | "CONVERTED";
        source_surface: string;
    }>(null);

    // Fetch Products
    const { data: products } = useQuery({
        queryKey: ["admin-products-search", searchProduct],
        queryFn: async () => {
            if (!searchProduct) return [];
            const response = await apiClient.listScopedProducts({
                search: searchProduct,
                merchant_id: context?.scope === "merchant" ? context.merchantId : intentMeta?.merchant_id,
                limit: 5,
            });
            const rows = Array.isArray(response) ? response : (response?.items ?? []);
            return rows.slice(0, 5);
        },
        enabled: searchProduct.length > 1
    });

    // Fetch Governorates
    const { data: governorates } = useQuery({
        queryKey: ["governorates-list"],
        queryFn: () => apiClient.getShippingGovernorates(),
    });

    const addItem = (product: any) => {
        const targetMerchant = intentMeta?.merchant_id ?? (context?.scope === "merchant" ? context.merchantId : null);
        if (targetMerchant && product.merchant_id && product.merchant_id !== targetMerchant) {
            toast.error("لا يمكن إضافة منتج من تاجر مختلف عن سياق المحادثة.");
            return;
        }
        const existing = selectedItems.find(i => i.product_id === product.id);
        if (existing) {
            setSelectedItems(selectedItems.map(i =>
                i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
            ));
        } else {
            setSelectedItems([...selectedItems, {
                product_id: product.id,
                product_name: product.name,
                price: product.discount_price ?? product.price,
                quantity: 1
            }]);
        }
        setSearchProduct("");
    };

    const removeItem = (productId: string) => {
        setSelectedItems(selectedItems.filter(i => i.product_id !== productId));
    };

    const subtotal = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal + Number(deliveryCost);
    const isIntentLocked = intentMeta?.status === "EXPIRED" || intentMeta?.status === "CONVERTED";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedItems.length === 0) return toast.error("يرجى اختيار منتج واحد على الأقل");
        if (!governorateId) return toast.error("يرجى اختيار المحافظة");
        if (isIntentLocked) {
            return toast.error("هذا الـ Intent غير صالح لإنشاء طلب جديد (منتهي أو محوّل مسبقاً).");
        }

        setLoading(true);
        try {
            const result = await apiClient.createManualOrder({
                customer_name: customerName,
                customer_phone: customerPhone,
                governorate_id: governorateId,
                area,
                nearest_landmark: landmark || null,
                notes: notes || null,
                delivery_cost: Number(deliveryCost),
                items: selectedItems,
                intent_id: intentMeta?.id,
                channel: intentMeta?.id ? "whatsapp_assisted" : "manual_assisted",
            });

            toast.success(`تم إنشاء الطلب بنجاح برقم: ${result.order_number}`);
            onOpenChange(false);
            queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
            // Reset form
            setSelectedItems([]);
            setCustomerName("");
            setCustomerPhone("");
            setGovernorateId("");
            setArea("");
            setLandmark("");
            setNotes("");
            setIntentToken("");
            setIntentMeta(null);
        } catch (error: any) {
            toast.error(error.message || "حدث خطأ أثناء إنشاء الطلب");
        } finally {
            setLoading(false);
        }
    };

    const handleResolveIntent = async () => {
        const token = intentToken.trim();
        if (!token) return;
        try {
            setLoading(true);
            const intent = await apiClient.resolveWhatsAppIntent(token);
            setIntentMeta({
                id: intent.id,
                intent_token: intent.intent_token,
                merchant_id: intent.merchant_id,
                merchant_name: intent.merchant_name,
                status: intent.status,
                source_surface: intent.source_surface,
            });
            if (intent.customer_name) {
                setCustomerName(intent.customer_name);
            }
            if (intent.customer_phone) {
                setCustomerPhone(intent.customer_phone);
            }
            // M10.7: customer_name and customer_phone are no longer returned by the
            // backend. Customer data must be entered manually by admin/ops staff.
            const items = intent.cart_snapshot.length > 0 ? intent.cart_snapshot : intent.fallback_item ? [intent.fallback_item] : [];
            if (items.length > 0) {
                setSelectedItems(items.map((item: any) => ({
                    product_id: item.product_id,
                    product_name: item.product_name,
                    quantity: Number(item.quantity || 1),
                    price: Number(item.price || 0),
                })));
            }
            toast.success("تم تحميل Intent — أدخل بيانات العميل يدوياً");
        } catch (error: any) {
            toast.error(error?.message || "تعذّر قراءة Intent");
        } finally {
            setLoading(false);
        }
    };

    const handleDetachIntent = () => {
        setIntentMeta(null);
        setIntentToken("");
    };

    const intentStatusMeta = (() => {
        switch (intentMeta?.status) {
            case "CONVERTED":
                return { label: "CONVERTED", className: "bg-emerald-100 text-emerald-700 border-emerald-300" };
            case "OPENED":
                return { label: "OPENED", className: "bg-sky-100 text-sky-700 border-sky-300" };
            case "EXPIRED":
                return { label: "EXPIRED", className: "bg-rose-100 text-rose-700 border-rose-300" };
            default:
                return { label: "CREATED", className: "bg-amber-100 text-amber-700 border-amber-300" };
        }
    })();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-right flex items-center gap-2">
                        <Plus size={20} className="text-primary" />
                        إنشاء طلب يدوي — الأدمن / مركز العمليات فقط
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Right: Customer Info */}
                        <div className="space-y-4">
                            <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                                <Label>Incoming WhatsApp Intent</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={intentToken}
                                        onChange={(e) => setIntentToken(e.target.value.toUpperCase())}
                                        placeholder="INT-XXXXXX"
                                        dir="ltr"
                                    />
                                    <Button type="button" variant="outline" onClick={() => void handleResolveIntent()} disabled={loading || !intentToken}>
                                        تحميل
                                    </Button>
                                    {intentMeta && (
                                        <Button type="button" variant="ghost" onClick={handleDetachIntent} disabled={loading}>
                                            إزالة الربط
                                        </Button>
                                    )}
                                </div>
                                {intentMeta ? (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs text-muted-foreground">
                                                {intentMeta.intent_token} — {intentMeta.merchant_name || intentMeta.merchant_id}
                                            </p>
                                            <Badge variant="outline" className={intentStatusMeta.className}>
                                                {intentStatusMeta.label}
                                            </Badge>
                                        </div>
                                        {isIntentLocked && (
                                            <p className="text-xs text-rose-700">
                                                لا يمكن إنشاء طلب من هذا الـ intent لأنه منتهي الصلاحية أو تم تحويله مسبقًا.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">استخدم token القادم من intent لربط الطلب — أدخل بيانات العميل يدوياً.</p>
                                )}
                            </div>
                            <h3 className="font-bold border-b pb-2 text-sm">معلومات الزبون</h3>
                            <div className="space-y-2">
                                <Label>الاسم الكامل</Label>
                                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label>رقم الهاتف</Label>
                                <Input
                                    value={customerPhone}
                                    onChange={e => setCustomerPhone(e.target.value)}
                                    required
                                    dir="ltr"
                                    type="tel"
                                    autoComplete="tel"
                                    inputMode="tel"
                                    placeholder="07XXXXXXXX"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>المحافظة</Label>
                                <Select value={governorateId} onValueChange={setGovernorateId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="اختر المحافظة" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {governorates?.map(gov => (
                                            <SelectItem key={gov.id} value={gov.id}>{gov.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>المنطقة / العنوان</Label>
                                <Input value={area} onChange={e => setArea(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label>أقرب نقطة دالة</Label>
                                <Input value={landmark} onChange={e => setLandmark(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>ملاحظات</Label>
                                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
                            </div>
                        </div>

                        {/* Left: Products Info */}
                        <div className="space-y-4">
                            <h3 className="font-bold border-b pb-2 text-sm">محتويات الطلب</h3>

                            {/* Product Search */}
                            <div className="relative">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                                <Input
                                    placeholder="ابحث عن منتج لإضافته..."
                                    className="pr-9 h-9"
                                    value={searchProduct}
                                    onChange={e => setSearchProduct(e.target.value)}
                                />
                                {products && products.length > 0 && (
                                    <div className="absolute top-full right-0 left-0 bg-background border rounded-md shadow-lg z-50 mt-1 overflow-hidden">
                                        {products.map(p => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => addItem(p)}
                                                className="w-full text-right p-2 hover:bg-muted text-sm flex items-center justify-between border-b last:border-0"
                                            >
                                                <span>{p.name}</span>
                                                <span className="font-bold text-primary">{formatPrice(p.discount_price ?? p.price)}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Selected Items List */}
                            <div className="border rounded-md min-h-[150px] bg-muted/20 p-2 space-y-2">
                                {selectedItems.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground opacity-50">
                                        <ShoppingCart size={32} />
                                        <p className="text-xs mt-2">السلة فارغة</p>
                                    </div>
                                ) : (
                                    selectedItems.map(item => (
                                        <div key={item.product_id} className="bg-background p-2 rounded border flex items-center justify-between text-xs">
                                            <div className="flex-1">
                                                <p className="font-bold">{item.product_name}</p>
                                                <p className="text-muted-foreground">{formatPrice(item.price)}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    className="w-12 h-7 p-1 text-center"
                                                    value={item.quantity}
                                                    onChange={e => {
                                                        const val = parseInt(e.target.value) || 1;
                                                        setSelectedItems(selectedItems.map(i =>
                                                            i.product_id === item.product_id ? { ...i, quantity: val } : i
                                                        ));
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-destructive"
                                                    onClick={() => removeItem(item.product_id)}
                                                >
                                                    <Trash2 size={14} />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Summary */}
                            <div className="space-y-2 pt-2 border-t text-sm">
                                <div className="flex justify-between">
                                    <span>المجموع الفرعي:</span>
                                    <span>{formatPrice(subtotal)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>سعر التوصيل:</span>
                                    <Input
                                        type="number"
                                        className="w-24 h-7 text-left font-mono"
                                        value={deliveryCost}
                                        onChange={e => setDeliveryCost(e.target.value)}
                                    />
                                </div>
                                <div className="flex justify-between font-black text-lg pt-2 border-t text-primary">
                                    <span>الإجمالي الكلي:</span>
                                    <span>{formatPrice(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            إلغاء
                        </Button>
                        <Button type="submit" disabled={loading || isIntentLocked} className="px-8">
                            {loading ? "جاري الإنشاء..." : "إنشاء الطلب"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
