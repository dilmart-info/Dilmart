import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useCartStore } from "@/lib/cart-store";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, Ticket, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";

const Cart = () => {
    const { items, getTotal, getSubtotal, getDiscountAmount, coupon, applyCoupon, removeCoupon, removeItem, updateQuantity, ensureIntegrity } = useCartStore();
    const [couponInput, setCouponInput] = useState("");
    const [isValidating, setIsValidating] = useState(false);

    useEffect(() => {
        const result = ensureIntegrity(false);
        if (!result.valid) {
            toast.error("تمت مراجعة السلة وإزالة العناصر غير المتسقة بين التجار.");
        }
    }, [ensureIntegrity]);

    const subtotal = getSubtotal();
    const discount = getDiscountAmount();
    const total = getTotal();

    const handleApplyCoupon = async () => {
        if (!couponInput.trim()) return;
        const { merchantId } = ensureIntegrity();
        if (!merchantId) {
            toast.error("لا يمكن تطبيق كوبون قبل تحديد متجر السلة.");
            return;
        }
        setIsValidating(true);
        try {
            const data = await apiClient.validateCoupon({
                code: couponInput.trim(),
                total: subtotal,
                merchant_id: merchantId,
            });

            if (data.valid) {
                applyCoupon({
                    id: data.id,
                    code: data.code,
                    type: data.discount_type,
                    value: data.value
                });
                toast.success("تم تطبيق الكوبون بنجاح");
                setCouponInput("");
            } else {
                toast.error(data.message || "الكوبون غير صالح");
            }
        } catch (error) {
            console.error(error);
            toast.error("حدث خطأ أثناء التحقق من الكوبون");
        } finally {
            setIsValidating(false);
        }
    };

    if (items.length === 0) {
        return (
            <div className="min-h-screen flex flex-col bg-[#fcfcfc]">
                <Header />
                <main className="flex-1 container py-20 flex flex-col items-center justify-center text-center">
                    <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
                        <ShoppingBag size={48} className="text-muted-foreground" />
                    </div>
                    <h1 className="text-2xl font-black mb-2">سلة التسوق فارغة</h1>
                    <p className="text-muted-foreground mb-8">لم تقم بإضافة أي منتجات للسلة بعد.</p>
                    <Link to="/products">
                        <Button size="lg" className="rounded-full px-8">تصفح المنتجات الآن</Button>
                    </Link>
                </main>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-[#fcfcfc] pb-24 md:pb-0">
            <Header />
            <main className="flex-1 container py-8 max-w-4xl">
                <div className="flex items-center gap-2 mb-8">
                    <h1 className="text-3xl font-black">سلة التسوق</h1>
                    <span className="text-muted-foreground font-bold">({items.length} منتجات)</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Items List */}
                    <div className="lg:col-span-2 space-y-4">
                        {items.map((item) => (
                            <div key={item.product.id} className="bg-background border border-border rounded-2xl p-4 flex gap-4 shadow-sm">
                                <Link to={`/product/${item.product.slug}`} className="w-24 h-24 flex-shrink-0">
                                    <img
                                        src={item.product.images?.[0] || "/placeholder.svg"}
                                        alt={item.product.name}
                                        className="w-full h-full object-cover rounded-xl"
                                    />
                                </Link>
                                <div className="flex-1 flex flex-col justify-between">
                                    <div>
                                        <div className="flex justify-between items-start gap-2">
                                            <h3 className="font-bold text-sm md:text-base line-clamp-1">{item.product.name}</h3>
                                            <button
                                                onClick={() => removeItem(item.product.id)}
                                                className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                        <p className="text-primary font-black text-lg mt-1">
                                            {formatPrice(item.product.discount_price ?? item.product.price)}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between mt-4">
                                        <div className="flex items-center gap-3 bg-muted/50 rounded-full p-1 border border-border">
                                            <button
                                                onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                                                className="w-8 h-8 rounded-full flex items-center justify-center bg-background border border-border hover:bg-muted transition-colors"
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className="font-black w-4 text-center">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                                                className="w-8 h-8 rounded-full flex items-center justify-center bg-background border border-border hover:bg-muted transition-colors"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                        <div className="text-sm font-bold opacity-60">
                                            المجموع: {formatPrice((item.product.discount_price ?? item.product.price) * item.quantity)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary */}
                    <div className="lg:col-span-1">
                        <div className="bg-background border border-border rounded-2xl p-6 shadow-md sticky top-24">
                            <h2 className="text-xl font-black mb-6">ملخص الطلب</h2>

                            {/* Coupon Input */}
                            <div className="mb-6 space-y-2">
                                {coupon ? (
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-emerald-700">
                                            <Ticket size={16} />
                                            <span className="font-bold text-sm">{coupon.code}</span>
                                        </div>
                                        <button onClick={removeCoupon} className="text-emerald-700 hover:text-emerald-900">
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="كود الخصم"
                                            value={couponInput}
                                            onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                                            className="uppercase"
                                        />
                                        <Button
                                            variant="secondary"
                                            onClick={handleApplyCoupon}
                                            disabled={isValidating || !couponInput}
                                        >
                                            {isValidating ? <Loader2 size={16} className="animate-spin" /> : "تطبيق"}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4 mb-6">
                                <div className="flex justify-between text-muted-foreground">
                                    <span>المجموع الفرعي</span>
                                    <span>{formatPrice(subtotal)}</span>
                                </div>
                                {discount > 0 && (
                                    <div className="flex justify-between text-emerald-600 font-medium">
                                        <span>خصم ({coupon?.type === 'percentage' ? `%${coupon.value}` : 'ثابت'})</span>
                                        <span>-{formatPrice(discount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-muted-foreground">
                                    <span>التوصيل</span>
                                    <span className="text-emerald-600 font-bold">يحدد عند الدفع</span>
                                </div>
                                <div className="border-t border-border pt-4 flex justify-between items-center">
                                    <span className="font-black text-lg">المجموع الكلي</span>
                                    <span className="font-black text-2xl text-primary">{formatPrice(total)}</span>
                                </div>
                            </div>
                            <Link to="/checkout">
                                <Button className="w-full h-14 rounded-full text-lg font-black gap-2 shadow-xl shadow-primary/20">
                                    إتمام الطلب
                                    <ArrowRight size={20} />
                                </Button>
                            </Link>
                            <p className="text-[10px] text-center text-muted-foreground mt-4">
                                الدفع عند الاستلام متاح لجميع طلباتك
                            </p>
                        </div>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default Cart;
