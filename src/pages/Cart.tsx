import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useCartStore, type CartItem } from "@/lib/cart-store";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ArrowLeft,
  Ticket,
  X,
  Store,
  ShieldCheck,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import type { MarketplacePublicProduct } from "@/lib/marketplace-product-detail.types";

function isMarketplaceProduct(p: CartItem["product"]): p is MarketplacePublicProduct {
  return "merchants" in p && !!p.merchants;
}

const Cart = () => {
  const {
    items,
    getTotal,
    getSubtotal,
    getDiscountAmount,
    coupon,
    applyCoupon,
    removeCoupon,
    removeItem,
    updateQuantity,
    ensureIntegrity,
    getItemCount,
  } = useCartStore();
  const [couponInput, setCouponInput] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const result = ensureIntegrity(false);
    if (!result.valid) {
      toast.error("تمت مراجعة السلة وإزالة العناصر غير المتسقة أو منتهية المخزون.");
    }
  }, [ensureIntegrity]);

  const subtotal = getSubtotal();
  const discount = getDiscountAmount();
  const total = getTotal();
  const itemCount = getItemCount();

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
          value: data.value,
        });
        toast.success("تم تطبيق كود الخصم بنجاح");
        setCouponInput("");
      } else {
        toast.error(data.message || "كود الخصم غير صالح أو منتهي الصلاحية");
      }
    } catch (error) {
      console.error(error);
      toast.error("حدث خطأ أثناء التحقق من كود الخصم");
    } finally {
      setIsValidating(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F5F7FA] font-tajawal text-slate-900" dir="rtl">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-20 flex flex-col items-center justify-center text-center">
          <div className="w-24 h-24 bg-white border border-slate-200/80 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
            <ShoppingBag size={44} className="text-slate-400" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-[#071A3D] mb-2">سلة التسوق فارغة</h1>
          <p className="text-slate-500 max-w-sm mb-8 text-sm md:text-base leading-relaxed">
            لم تقم بإضافة أي منتجات إلى سلتك بعد. استكشف آلاف المنتجات والعروض المميزة في ديل مارت.
          </p>
          <Link to="/products">
            <Button
              size="lg"
              className="rounded-full px-8 py-6 text-base font-bold bg-[#1261D8] hover:bg-[#0E4EB0] text-white shadow-md shadow-[#1261D8]/20 transition-all hover:scale-[1.02]"
            >
              تصفح المنتجات الآن
            </Button>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F7FA] font-tajawal text-slate-900 pb-24 md:pb-12" dir="rtl">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-6 md:py-8 max-w-6xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs md:text-sm text-slate-500 mb-6" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-[#1261D8] transition-colors">
            الرئيسية
          </Link>
          <ChevronLeft size={14} className="text-slate-400" />
          <span className="font-bold text-slate-800">سلة التسوق</span>
        </nav>

        {/* Page Title */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-black text-[#071A3D]">سلة التسوق</h1>
            <Badge
              variant="secondary"
              className="bg-[#1261D8]/10 text-[#1261D8] font-bold text-xs px-2.5 py-0.5 rounded-full"
            >
              {itemCount} {itemCount === 1 ? "منتج" : "منتجات"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 items-start">
          {/* Cart Products List */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => {
              const product = item.product;
              const hasDiscount = product.discount_price != null && product.discount_price < product.price;
              const currentUnitPrice = product.discount_price ?? product.price;
              const lineTotal = currentUnitPrice * item.quantity;
              const knownStock = typeof product.stock === "number" && product.stock >= 0 ? product.stock : null;
              const isMaxStockReached = knownStock !== null && item.quantity >= knownStock;
              const merchantName = isMarketplaceProduct(product) ? product.merchants?.display_name : null;

              return (
                <div
                  key={product.id}
                  className="bg-white border border-slate-200/80 rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row gap-4 shadow-sm hover:shadow-md transition-shadow relative"
                >
                  {/* Thumbnail */}
                  <Link
                    to={`/product/${product.slug}`}
                    className="w-20 h-20 md:w-24 md:h-24 flex-shrink-0 bg-slate-100 rounded-xl overflow-hidden border border-slate-200/60 block self-start"
                  >
                    <img
                      src={product.images?.[0] || "/placeholder.svg"}
                      alt={product.name}
                      className="w-full h-full object-cover object-center hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/placeholder.svg";
                      }}
                    />
                  </Link>

                  {/* Product Details */}
                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <Link
                          to={`/product/${product.slug}`}
                          className="font-bold text-slate-900 text-sm md:text-base hover:text-[#1261D8] transition-colors line-clamp-2"
                        >
                          {product.name}
                        </Link>
                        <button
                          onClick={() => removeItem(product.id)}
                          className="text-slate-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50 -ml-1 -mt-1"
                          aria-label={`إزالة ${product.name} من السلة`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      {merchantName && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                          <Store size={13} className="text-slate-400" />
                          <span>يُباع بواسطة:</span>
                          <span className="font-semibold text-slate-700">{merchantName}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[#1261D8] font-black text-base md:text-lg">
                          {formatPrice(currentUnitPrice)}
                        </span>
                        {hasDiscount && (
                          <span className="text-xs text-slate-400 line-through">
                            {formatPrice(product.price)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantity controls & Line total */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-slate-100 rounded-full p-1 border border-slate-200/80">
                          <button
                            type="button"
                            onClick={() => updateQuantity(product.id, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="w-7 h-7 rounded-full flex items-center justify-center bg-white text-slate-700 shadow-sm hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="تقليل الكمية"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="font-black text-sm w-7 text-center text-slate-900">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(product.id, item.quantity + 1)}
                            disabled={isMaxStockReached}
                            className="w-7 h-7 rounded-full flex items-center justify-center bg-white text-slate-700 shadow-sm hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="زيادة الكمية"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        {isMaxStockReached && (
                          <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                            الحد الأقصى المتاح
                          </span>
                        )}
                      </div>

                      <div className="text-left">
                        <span className="text-xs text-slate-400 block">الإجمالي</span>
                        <span className="text-sm md:text-base font-black text-[#071A3D]">
                          {formatPrice(lineTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 md:p-6 shadow-sm sticky top-24 space-y-6">
              <h2 className="text-lg md:text-xl font-black text-[#071A3D] pb-3 border-b border-slate-100">
                ملخص الطلب
              </h2>

              {/* Coupon Code Section */}
              <div className="space-y-2">
                <label htmlFor="cart-coupon-input" className="text-xs font-bold text-slate-700 block">
                  كود الخصم / الكوبون
                </label>
                {coupon ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-800">
                      <Ticket size={16} />
                      <div>
                        <p className="font-black text-sm">{coupon.code}</p>
                        <p className="text-[11px] text-emerald-700">
                          خصم {coupon.type === "percentage" ? `%${coupon.value}` : formatPrice(coupon.value)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeCoupon}
                      className="text-emerald-700 hover:text-emerald-900 p-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
                      aria-label="إزالة كود الخصم"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      id="cart-coupon-input"
                      placeholder="أدخل كود الخصم"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      className="uppercase text-xs font-bold border-slate-200 focus-visible:ring-[#1261D8]"
                      maxLength={20}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleApplyCoupon}
                      disabled={isValidating || !couponInput.trim()}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-4 text-xs h-10 shrink-0"
                    >
                      {isValidating ? <Loader2 size={14} className="animate-spin" /> : "تطبيق"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Totals Breakdown */}
              <div className="space-y-3 pt-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>المجموع الفرعي</span>
                  <span className="font-bold text-slate-800">{formatPrice(subtotal)}</span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>
                      الخصم ({coupon?.type === "percentage" ? `%${coupon?.value}` : "كوبون"})
                    </span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-600">
                  <span>التوصيل</span>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    يُحسب عند إتمام الطلب
                  </span>
                </div>

                <div className="border-t border-slate-100 pt-4 flex justify-between items-baseline">
                  <div>
                    <span className="font-black text-base text-[#071A3D] block">الإجمالي الحالي</span>
                    <span className="text-[10px] text-slate-400 font-normal block">قبل احتساب التوصيل</span>
                  </div>
                  <span className="font-black text-2xl text-[#1261D8]">{formatPrice(total)}</span>
                </div>
              </div>

              {/* Checkout CTA */}
              <Link to="/checkout" className="block pt-2">
                <Button
                  size="lg"
                  className="w-full h-14 rounded-xl text-base font-black gap-2 bg-[#1261D8] hover:bg-[#0E4EB0] text-white shadow-lg shadow-[#1261D8]/20 transition-all hover:scale-[1.01]"
                >
                  <span>إتمام الطلب</span>
                  <ArrowLeft size={18} />
                </Button>
              </Link>

              {/* Trust Badge */}
              <div className="pt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
                <ShieldCheck size={16} className="text-[#1261D8]" />
                <span>تفاصيل التوصيل والتكلفة تظهر أثناء إتمام الطلب</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Cart;
