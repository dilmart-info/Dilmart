import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCartStore } from "@/lib/cart-store";
import { formatPrice } from "@/lib/format";
import { useState, useEffect, useRef } from "react";
import { isStalePrincipalOperationError, usePrincipalContinuity } from "@/lib/auth/use-customer-principal";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Trash2,
  Ticket,
  X,
  Loader2,
  MapPin,
  CheckCircle2,
  Coins,
  Home,
  Building2,
  PlusCircle,
  ShieldCheck,
  ChevronLeft,
  ShoppingBag,
  MessageCircle,
  Truck,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { trackGrowthHookEvent } from "@/lib/growth-hooks";
import { startTrackedWhatsAppIntent } from "@/lib/whatsapp-assisted";
import type { CartLineProduct } from "@/lib/cart-store";
import type { MarketplacePublicProduct } from "@/lib/marketplace-product-detail.types";

/** Type guard: is this product a MarketplacePublicProduct (has `merchants` embed)? */
function isMarketplaceProduct(p: CartLineProduct): p is MarketplacePublicProduct {
  return "merchants" in p && !!p.merchants;
}

/** Form inputs styling adhering to DILMART visual identity */
const checkoutFieldClass =
  "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:border-[#1261D8] focus-visible:ring-[#1261D8]/20";

/**
 * §9.3 — the checkout attempt id is identity-owned: the backend binds an attempt to its actor and
 * answers 403 if another user presents it. Persisting it with its owner means a different principal can
 * never reuse it, while the SAME principal keeps the idempotency guarantee on retry. A guest attempt is
 * stored under the guest owner and carried into the provisional actor that the submit creates.
 */
const CHECKOUT_ATTEMPT_KEY = "active_checkout_attempt_id";
const CHECKOUT_ATTEMPT_OWNER_KEY = "active_checkout_attempt_owner";

function readStoredCheckoutAttempt(owner: string | null): string | null {
  try {
    const id = sessionStorage.getItem(CHECKOUT_ATTEMPT_KEY);
    if (!id) return null;
    const storedOwner = sessionStorage.getItem(CHECKOUT_ATTEMPT_OWNER_KEY);
    // A stored attempt with a DIFFERENT owner is never reused.
    if ((storedOwner ?? null) !== (owner ?? null)) return null;
    return id;
  } catch {
    return null;
  }
}

function writeStoredCheckoutAttempt(id: string, owner: string | null): void {
  try {
    sessionStorage.setItem(CHECKOUT_ATTEMPT_KEY, id);
    if (owner === null) sessionStorage.removeItem(CHECKOUT_ATTEMPT_OWNER_KEY);
    else sessionStorage.setItem(CHECKOUT_ATTEMPT_OWNER_KEY, owner);
  } catch {
    /* storage unavailable — the attempt simply is not reused */
  }
}

function clearStoredCheckoutAttempt(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
    sessionStorage.removeItem(CHECKOUT_ATTEMPT_OWNER_KEY);
  } catch {
    /* nothing to clear */
  }
}

const Checkout = () => {
  const {
    items,
    getSubtotal,
    getDiscountAmount,
    coupon,
    applyCoupon,
    removeCoupon,
    clearCart,
    removeItem,
    ensureIntegrity,
  } = useCartStore();
  const { user, profile, establishProvisionalSession, authStatus, authSource } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  /**
   * Which submit currently owns the busy flag.
   */
  const submitTicketRef = useRef(0);
  const [couponInput, setCouponInput] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("new");
  const [saveAddress, setSaveAddress] = useState(false);
  const [addressLabel, setAddressLabel] = useState("home");
  const [autoFilledFromLastOrder, setAutoFilledFromLastOrder] = useState(false);

  const EMPTY_CUSTOMER_FORM = {
    name: "",
    phone: "",
    governorate_id: "",
    area: "",
    landmark: "",
    notes: "",
    latitude: null as number | null,
    longitude: null as number | null,
    map_url: null as string | null,
  };

  const [form, setForm] = useState(EMPTY_CUSTOMER_FORM);

  /**
   * §9.3 — this route is PUBLIC, so nothing unmounts it when the authenticated customer is replaced.
   */
  const { owner: principalOwner, beginOperation } = usePrincipalContinuity(() => {
    setForm(EMPTY_CUSTOMER_FORM);
    setSelectedAddressId("new");
    setSaveAddress(false);
    setAddressLabel("home");
    setAutoFilledFromLastOrder(false);
    setUsePoints(false);
    setLoading(false);
    setGettingLocation(false);
    clearStoredCheckoutAttempt();
  });

  useEffect(() => {
    const result = ensureIntegrity(false);
    if (!result.valid) {
      toast.error("تم اكتشاف سلة غير متسقة وتم تنظيفها قبل المتابعة.");
    }
  }, [ensureIntegrity]);

  useEffect(() => {
    if (profile) {
      setForm((prev) => ({
        ...prev,
        name: profile.full_name || prev.name,
        phone: profile.phone || prev.phone,
        area: profile.address || prev.area,
        latitude: null,
        longitude: null,
        map_url: null,
      }));
    }
  }, [profile]);

  const { data: governorates } = useQuery({
    queryKey: ["governorates"],
    queryFn: () => apiClient.getShippingGovernorates(),
  });

  // Fetch regions for the selected governorate
  const { data: regions } = useQuery({
    queryKey: ["regions", form.governorate_id],
    queryFn: () => apiClient.getRegions(form.governorate_id),
    enabled: !!form.governorate_id,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const {
    data: previewData,
    isLoading: isPreviewLoading,
    isFetching: isPreviewFetching,
    isError: isPreviewError,
    refetch: refetchPreview,
  } = useQuery({
    queryKey: [
      "checkout-preview",
      items.map((i) => `${i.product.id}:${i.quantity}`).join(","),
      ensureIntegrity(false).merchantId,
      coupon?.code ?? null,
      form.governorate_id || null,
    ],
    queryFn: () =>
      apiClient.checkoutPreview({
        items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        merchant_id: ensureIntegrity(false).merchantId ?? undefined,
        coupon_code: coupon?.code,
        governorate_id: form.governorate_id || undefined,
      }),
    enabled: items.length > 0,
    retry: false,
    staleTime: 30_000,
  });

  const selectedGov = governorates?.find((g) => g.id === form.governorate_id);
  const deliveryCost =
    selectedGov?.delivery_price != null && Number.isFinite(Number(selectedGov.delivery_price))
      ? Number(selectedGov.delivery_price)
      : null;
  const subtotal = getSubtotal();
  const discount = getDiscountAmount();

  const authoritativeSubtotal =
    previewData?.subtotal != null && Number.isFinite(Number(previewData.subtotal))
      ? Number(previewData.subtotal)
      : subtotal;
  const authoritativeDiscount =
    previewData?.discount != null && Number.isFinite(Number(previewData.discount))
      ? Number(previewData.discount)
      : discount;
  const authoritativeDeliveryCost =
    previewData?.delivery_cost != null && Number.isFinite(Number(previewData.delivery_cost))
      ? Number(previewData.delivery_cost)
      : deliveryCost;
  const authoritativeBaseTotal =
    previewData?.total != null && Number.isFinite(Number(previewData.total))
      ? Number(previewData.total)
      : Math.max(0, authoritativeSubtotal - authoritativeDiscount) + (authoritativeDeliveryCost ?? 0);

  const { data: savedAddresses } = useQuery({
    queryKey: ["customer-addresses", authSource, user?.id],
    queryFn: () => apiClient.getCustomerAddresses(),
    enabled: !!user,
    retry: false,
  });

  const { data: recentOrders } = useQuery({
    queryKey: ["customer-orders-last", authSource, user?.id],
    queryFn: () => apiClient.getCustomerOrders({ limit: 1 }),
    enabled: !!user,
    retry: false,
  });

  const { data: lastOrderDetail } = useQuery({
    queryKey: ["customer-order-last-detail", authSource, user?.id, recentOrders?.[0]?.id],
    queryFn: () => apiClient.getCustomerOrderDetail(recentOrders![0].id),
    enabled: !!user && !!recentOrders?.[0]?.id,
  });

  useEffect(() => {
    if (!user || !savedAddresses || savedAddresses.length === 0) return;
    const defaultAddress = savedAddresses.find((addr) => addr.is_default) ?? savedAddresses[0];
    if (!defaultAddress) return;
    setSelectedAddressId(defaultAddress.id);
    setForm((prev) => ({
      ...prev,
      name: defaultAddress.recipient_name ?? prev.name,
      phone: defaultAddress.recipient_phone ?? prev.phone,
      governorate_id: defaultAddress.governorate_id ?? prev.governorate_id,
      area: defaultAddress.area ?? prev.area,
      landmark: defaultAddress.nearest_landmark ?? prev.landmark,
      notes: defaultAddress.delivery_notes ?? prev.notes,
      map_url: defaultAddress.map_url ?? prev.map_url,
    }));
  }, [user, savedAddresses]);

  const merchandiseAmount = Math.max(0, authoritativeSubtotal - authoritativeDiscount);

  const { data: loyaltyPreview } = useQuery({
    queryKey: ["loyalty-preview", authSource, user?.id, merchandiseAmount],
    queryFn: () =>
      apiClient.loyaltyPreview({
        subtotal: merchandiseAmount,
      }),
    enabled: !!user && merchandiseAmount > 0,
    retry: false,
    placeholderData: { available_points: 0, redeemable_amount: 0 },
  });

  // Loyalty Points Calculations for Redemption
  const availablePoints = loyaltyPreview?.available_points ?? profile?.points ?? 0;

  const userEmailLower = (user?.email ?? "").toLowerCase();
  const isProvisionalUser =
    userEmailLower.endsWith("@provisional.dilmart.com") ||
    userEmailLower.endsWith("@provisional.dilmart.org");

  // 1 point = 10 IQD discount
  const pointsRedemptionValue =
    usePoints && !isProvisionalUser
      ? Math.min(loyaltyPreview?.redeemable_amount ?? availablePoints * 10, merchandiseAmount)
      : 0;
  const pointsToSpend = usePoints && !isProvisionalUser ? Math.floor(pointsRedemptionValue / 10) : 0;

  // Total = Subtotal - Discount - PointsDiscount + Delivery
  const total = Math.max(0, authoritativeBaseTotal - pointsRedemptionValue);

  const getAddressLabelText = (value?: string | null) => {
    const normalized = (value || "other").toLowerCase();
    if (normalized === "home") return "المنزل";
    if (normalized === "work") return "العمل";
    return "أخرى";
  };

  useEffect(() => {
    if (!user) return;
    if (!lastOrderDetail?.delivery_snapshot) return;
    if (savedAddresses && savedAddresses.length > 0) return;
    if (autoFilledFromLastOrder) return;

    const snapshot = lastOrderDetail.delivery_snapshot;
    setForm((prev) => ({
      ...prev,
      name: snapshot.customer_name ?? prev.name,
      phone: snapshot.customer_phone ?? prev.phone,
      governorate_id: snapshot.governorate_id ?? prev.governorate_id,
      area: snapshot.area ?? prev.area,
      landmark: snapshot.nearest_landmark ?? prev.landmark,
      notes: snapshot.notes ?? prev.notes,
      map_url: snapshot.map_url ?? prev.map_url,
    }));
    setAutoFilledFromLastOrder(true);
  }, [autoFilledFromLastOrder, lastOrderDetail, savedAddresses, user]);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error("المتصفح لا يدعم تحديد الموقع الجغرافي");
      return;
    }

    setGettingLocation(true);

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    };

    const locationOperation = beginOperation();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!locationOperation.isCurrent()) return;
        const { latitude, longitude } = position.coords;
        const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

        setForm((prev) => ({
          ...prev,
          latitude,
          longitude,
          map_url: mapUrl,
        }));

        toast.success("تم تحديد موقعك الحالي بنجاح");
        setGettingLocation(false);
      },
      (error) => {
        if (!locationOperation.isCurrent()) return;
        console.error("Error getting location:", error);
        let message = "فشل تحديد الموقع. يرجى التأكد من تفعيل خدمة الموقع في جهازك.";

        if (error.code === error.TIMEOUT) {
          message = "انتهت مهلة تحديد الموقع. يرجى المحاولة مرة أخرى في مكان تتوفر فيه إشارة أفضل.";
        } else if (error.code === error.PERMISSION_DENIED) {
          message = "تم رفض الإذن للوصول للموقع. يرجى تفعيله من إعدادات المتصفح.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = "معلومات الموقع غير متوفرة حالياً.";
        }

        toast.error(message);
        setGettingLocation(false);
      },
      options,
    );
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    const { merchantId } = ensureIntegrity();
    if (!merchantId) {
      toast.error("لا يمكن تطبيق كوبون قبل تحديد متجر السلة.");
      return;
    }
    setIsValidating(true);
    try {
      const couponData = await apiClient.validateCoupon({
        code: couponInput.trim(),
        total: subtotal,
        merchant_id: merchantId,
      });
      if (couponData.valid) {
        applyCoupon({
          id: couponData.id,
          code: couponData.code,
          type: couponData.discount_type,
          value: couponData.value,
        });
        toast.success(
          `تم تطبيق الكوبون - خصم ${
            couponData.discount_type === "percentage" ? "%" + couponData.value : formatPrice(couponData.value)
          }`,
        );
        setCouponInput("");
      } else {
        toast.error(couponData.message || "كود الخصم غير صالح أو منتهي");
      }
    } catch (error) {
      console.error(error);
      toast.error("حدث خطأ أثناء التحقق من كود الخصم");
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (items.length === 0) {
      toast.error("السلة فارغة");
      return;
    }
    if (!form.name.trim() || !form.phone.trim() || !form.governorate_id || !form.area.trim()) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    if (isPreviewError) {
      toast.error("تعذر تحديث أسعار الطلب. يرجى المحاولة مرة أخرى.");
      return;
    }
    if (authoritativeDeliveryCost == null) {
      toast.error(
        "لا تتوفر خدمة توصيل للمحافظة المختارة حالياً. يرجى اختيار محافظة أخرى أو التواصل مع خدمة العملاء.",
      );
      return;
    }

    const integrity = ensureIntegrity();
    if (!integrity.merchantId) {
      toast.error("تعذر تحديد متجر السلة. يرجى إعادة إضافة المنتجات.");
      return;
    }

    const operation = beginOperation();
    const stillCurrentPrincipal = () => operation.isCurrent();

    let submittingOwner = operation.expected().owner;

    if (principalOwner !== submittingOwner) {
      toast.error("تغيّر الحساب الحالي. يرجى مراجعة بياناتك ثم إعادة المحاولة.");
      return;
    }

    const submitTicket = submitTicketRef.current + 1;
    submitTicketRef.current = submitTicket;
    const releaseLoading = () => {
      if (submitTicketRef.current === submitTicket) setLoading(false);
    };
    setLoading(true);

    const activeUserId = user?.id;

    if (!activeUserId && authStatus !== "unauthenticated") {
      toast.error("جارٍ تجهيز حسابك، يرجى المحاولة بعد لحظات.");
      setLoading(false);
      return;
    }

    // Guest checkout: create a provisional customer session before submit
    if (!activeUserId && authStatus === "unauthenticated") {
      try {
        const { email, password } = await apiClient.createProvisionalUser({
          customer_name: form.name.trim(),
          customer_phone: form.phone.trim(),
        });

        if (!stillCurrentPrincipal()) {
          releaseLoading();
          return;
        }

        const { session: provisionalSession, principalSnapshot } = await establishProvisionalSession(
          email,
          password,
          operation.expected(),
        );

        operation.adopt(principalSnapshot);
        submittingOwner = principalSnapshot.owner;

        await queryClient.fetchQuery({
          queryKey: ["auth-context", "supabase", provisionalSession.user.id],
          queryFn: () => apiClient.getAuthContext(provisionalSession.access_token),
          staleTime: 0,
        });

        if (!stillCurrentPrincipal()) {
          releaseLoading();
          return;
        }
      } catch (err: unknown) {
        console.error("Provisional signup failed.");
        if (isStalePrincipalOperationError(err) || !stillCurrentPrincipal()) {
          releaseLoading();
          return;
        }
        const message = err instanceof Error ? err.message : "";
        toast.error(message || "فشل تسجيل جلسة المتابعة المؤقتة.");
        releaseLoading();
        return;
      }
    }

    if (!stillCurrentPrincipal()) {
      releaseLoading();
      return;
    }

    let checkoutAttemptId = readStoredCheckoutAttempt(submittingOwner);
    if (!checkoutAttemptId) {
      checkoutAttemptId = crypto.randomUUID();
      writeStoredCheckoutAttempt(checkoutAttemptId, submittingOwner);
    }

    try {
      trackGrowthHookEvent("checkout.previewed", {
        merchantId: integrity.merchantId,
        sourceSurface: "checkout_page",
      });
      const orderItems = items.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
      }));

      const result = await apiClient.checkoutSubmit({
        checkout_attempt_id: checkoutAttemptId,
        save_address: saveAddress,
        customer_name: form.name.trim(),
        customer_phone: form.phone.trim(),
        governorate_id: form.governorate_id,
        area: form.area.trim(),
        nearest_landmark: form.landmark.trim() || null,
        notes: form.notes.trim() || null,
        items: orderItems,
        latitude: form.latitude,
        longitude: form.longitude,
        map_url: form.map_url,
        points_spent: pointsToSpend,
        coupon_code: coupon?.code ?? undefined,
      });

      if (!stillCurrentPrincipal()) {
        releaseLoading();
        return;
      }

      clearStoredCheckoutAttempt();
      clearCart();

      trackGrowthHookEvent("checkout.submitted", {
        merchantId: integrity.merchantId,
        sourceSurface: "checkout_page",
      });
      navigate(`/thank-you?order=${result.order_number}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      console.error(err);
      if (!stillCurrentPrincipal()) {
        releaseLoading();
        return;
      }

      // Attempt status check for network disconnects or timeouts
      if (checkoutAttemptId) {
        try {
          const attemptStatus = await apiClient.getCheckoutAttempt(checkoutAttemptId);
          if (!stillCurrentPrincipal()) {
            releaseLoading();
            return;
          }
          if (attemptStatus.status === "completed" && attemptStatus.order_number) {
            clearStoredCheckoutAttempt();
            clearCart();
            toast.success("تم استلام الطلب بنجاح");
            navigate(`/thank-you?order=${attemptStatus.order_number}`);
            return;
          }
        } catch {
          if (!stillCurrentPrincipal()) {
            releaseLoading();
            return;
          }
        }
      }

      if (!stillCurrentPrincipal()) {
        releaseLoading();
        return;
      }
      toast.error(msg && msg.length < 220 ? msg : "حدث خطأ أثناء إرسال الطلب");
    } finally {
      releaseLoading();
    }
  };

  const handleTrackedWhatsAppFromCart = async () => {
    const integrity = ensureIntegrity();
    if (!integrity.merchantId) {
      toast.error("تعذر تحديد متجر السلة لبدء محادثة المساعدة.");
      return;
    }
    const firstProduct = items[0]?.product;
    const merchantName =
      (firstProduct && isMarketplaceProduct(firstProduct) ? firstProduct.merchants?.display_name : null) ||
      "DilMart Merchant";
    try {
      await startTrackedWhatsAppIntent({
        merchantId: integrity.merchantId,
        merchantName,
        sourceSurface: "checkout",
        cart: items.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          price: item.product.discount_price ?? item.product.price,
        })),
        completionLink: `${window.location.origin}/checkout`,
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "تعذر فتح مسار المساعدة عبر واتساب.");
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
          <h1 className="text-2xl md:text-3xl font-black text-[#071A3D] mb-2">السلة فارغة</h1>
          <p className="text-slate-500 max-w-sm mb-8 text-sm md:text-base leading-relaxed">
            يرجى إضافة منتجات إلى سلة التسوق أولاً لمتابعة إتمام الطلب.
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
          <Link to="/cart" className="hover:text-[#1261D8] transition-colors">
            سلة التسوق
          </Link>
          <ChevronLeft size={14} className="text-slate-400" />
          <span className="font-bold text-slate-800">إتمام الطلب</span>
        </nav>

        {/* Page Title */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-black text-[#071A3D] mb-1">إتمام الطلب والدفع</h1>
          <p className="text-xs md:text-sm text-slate-500">
            أكمل بيانات التوصيل لإرسال طلبك واستلامه بكل موثوقية وسرعة.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 items-start">
          {/* Main Delivery & Customer Information Form */}
          <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
            {/* Customer & Address Information Card */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 md:p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#1261D8]/10 text-[#1261D8] flex items-center justify-center">
                    <Truck size={18} />
                  </div>
                  <h2 className="text-lg md:text-xl font-black text-[#071A3D]">معلومات التوصيل والمستلم</h2>
                </div>
                <span className="text-xs text-slate-400">الحقول المعلّمة بـ * مطلوبة</span>
              </div>

              {/* Saved Addresses Section for Authenticated Customers */}
              {user ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <p className="text-xs md:text-sm font-bold text-slate-800">اختر عنوان التوصيل</p>
                  {savedAddresses && savedAddresses.length > 0 ? (
                    <div className="space-y-2">
                      {savedAddresses.map((addr) => (
                        <button
                          type="button"
                          key={addr.id}
                          onClick={() => {
                            setSelectedAddressId(addr.id);
                            setForm((prev) => ({
                              ...prev,
                              name: addr.recipient_name ?? prev.name,
                              phone: addr.recipient_phone ?? prev.phone,
                              governorate_id: addr.governorate_id ?? prev.governorate_id,
                              area: addr.area ?? prev.area,
                              landmark: addr.nearest_landmark ?? "",
                              notes: addr.delivery_notes ?? "",
                              map_url: addr.map_url ?? prev.map_url,
                            }));
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-right transition-all",
                            selectedAddressId === addr.id
                              ? "border-[#1261D8] bg-[#1261D8]/5 ring-1 ring-[#1261D8]"
                              : "border-slate-200 bg-white hover:border-slate-300",
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                              {(addr.label || "").toLowerCase() === "work" ? (
                                <Building2 size={15} />
                              ) : (
                                <Home size={15} />
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-xs md:text-sm text-slate-800">
                                {getAddressLabelText(addr.label)}
                              </span>
                              <span className="text-xs text-slate-500 mr-2">{addr.area}</span>
                            </div>
                            {addr.is_default ? (
                              <Badge variant="secondary" className="bg-[#1261D8]/10 text-[#1261D8] text-[10px] py-0 px-2">
                                افتراضي
                              </Badge>
                            ) : null}
                          </div>
                          {selectedAddressId === addr.id && (
                            <CheckCircle2 size={16} className="text-[#1261D8]" />
                          )}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => setSelectedAddressId("new")}
                        className={cn(
                          "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3.5 py-2.5 text-xs md:text-sm font-bold transition-colors",
                          selectedAddressId === "new"
                            ? "border-[#1261D8] bg-[#1261D8]/5 text-[#1261D8]"
                            : "border-slate-300 text-slate-600 hover:bg-slate-100",
                        )}
                      >
                        <PlusCircle size={15} />
                        إضافة عنوان جديد
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500">
                        لا يوجد لديك عناوين محفوظة بعد. يمكنك حفظ هذا العنوان لتسهيل طلباتك المستقبلية.
                      </p>
                      {autoFilledFromLastOrder ? (
                        <p className="text-xs font-bold text-emerald-600">
                          تم ملء الحقول تلقائيًا من بيانات آخر طلب سابق لديك.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Geolocation Section */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 font-bold text-xs md:text-sm text-slate-800">
                    <MapPin className="text-[#1261D8]" size={16} />
                    <span>موقع التوصيل الدقيق (اختياري)</span>
                  </Label>
                  {form.map_url ? (
                    <Badge
                      variant="secondary"
                      className="gap-1 border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold text-[11px]"
                    >
                      <CheckCircle2 size={12} />
                      تم تحديد الموقع
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  تحديد موقعك الجغرافي يساعد مندوب التوصيل في الوصول إلى عنوانك بدقة وسرعة.
                </p>
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGetLocation}
                    disabled={gettingLocation}
                    className="w-full sm:w-auto gap-2 border-slate-200 bg-white text-slate-800 hover:bg-slate-50 text-xs font-bold h-10 shadow-sm"
                  >
                    {gettingLocation ? (
                      <Loader2 className="animate-spin" size={15} />
                    ) : (
                      <MapPin size={15} className="text-[#1261D8]" />
                    )}
                    {form.map_url ? "تحديث موقعي الحالي" : "تحديد موقعي الحالي"}
                  </Button>
                </div>
                {form.map_url && (
                  <div className="mt-1 truncate text-[11px] text-slate-400 font-mono" dir="ltr">
                    {form.map_url}
                  </div>
                )}
              </div>

              {/* Inputs: Name & Phone */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs md:text-sm font-bold text-slate-700">
                    الاسم الكامل *
                  </Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    maxLength={100}
                    autoComplete="name"
                    placeholder="مثال: أحمد علي"
                    className={checkoutFieldClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs md:text-sm font-bold text-slate-700">
                    رقم الهاتف *
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                    maxLength={15}
                    dir="ltr"
                    autoComplete="tel"
                    inputMode="tel"
                    pattern="[0-9]*"
                    placeholder="07XXXXXXXXX"
                    className={checkoutFieldClass}
                  />
                </div>
              </div>

              {/* Inputs: Governorate & Area */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs md:text-sm font-bold text-slate-700">المحافظة *</Label>
                  <Select
                    value={form.governorate_id}
                    onValueChange={(v) => {
                      setForm({ ...form, governorate_id: v, area: "" });
                    }}
                  >
                    <SelectTrigger className={cn(checkoutFieldClass, "h-10 text-xs md:text-sm")}>
                      <SelectValue placeholder="اختر المحافظة" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {governorates?.map((gov) => (
                        <SelectItem key={gov.id} value={gov.id} className="text-xs md:text-sm font-medium">
                          {gov.name} — توصيل{" "}
                          {gov.delivery_price != null
                            ? gov.delivery_price > 0
                              ? formatPrice(gov.delivery_price)
                              : "مجاني"
                            : "غير متاح حالياً"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="area" className="text-xs md:text-sm font-bold text-slate-700">
                    المنطقة / الحي *
                  </Label>
                  {regions && regions.length > 0 ? (
                    <>
                      <Select value={form.area} onValueChange={(v) => setForm({ ...form, area: v })}>
                        <SelectTrigger className={cn(checkoutFieldClass, "h-10 text-xs md:text-sm")}>
                          <SelectValue placeholder="اختر المنطقة" />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          {regions.map((region) => (
                            <SelectItem key={region.id} value={region.name} className="text-xs md:text-sm font-medium">
                              {region.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        id="area"
                        value={form.area}
                        onChange={(e) => setForm({ ...form, area: e.target.value })}
                        maxLength={100}
                        placeholder="أو اكتب اسم المنطقة يدوياً"
                        className={cn(checkoutFieldClass, "text-xs mt-1")}
                      />
                    </>
                  ) : (
                    <Input
                      id="area"
                      value={form.area}
                      onChange={(e) => setForm({ ...form, area: e.target.value })}
                      required
                      maxLength={100}
                      placeholder="اسم الحي، الشارع أو المنطقة"
                      className={checkoutFieldClass}
                    />
                  )}
                </div>
              </div>

              {/* Inputs: Landmark & Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="landmark" className="text-xs md:text-sm font-bold text-slate-700">
                  أقرب نقطة دالة (اختياري)
                </Label>
                <Input
                  id="landmark"
                  value={form.landmark}
                  onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                  maxLength={200}
                  placeholder="مثال: قرب جامع النور أو مجاور مدرسة..."
                  className={checkoutFieldClass}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs md:text-sm font-bold text-slate-700">
                  ملاحظات إضافية للتوصيل (اختياري)
                </Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  maxLength={500}
                  placeholder="أي تعليمات إضافية للمندوب أو أوقات التوصيل المفضلة..."
                  className={cn(checkoutFieldClass, "min-h-[80px] text-xs md:text-sm")}
                />
              </div>

              {/* Save Address Option for Logged-in Users */}
              {user && selectedAddressId === "new" ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="address_label" className="text-xs md:text-sm font-bold text-slate-700">
                      تصنيف العنوان
                    </Label>
                    <Select value={addressLabel} onValueChange={setAddressLabel}>
                      <SelectTrigger id="address_label" className={cn(checkoutFieldClass, "h-10 text-xs md:text-sm")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        <SelectItem value="home">المنزل</SelectItem>
                        <SelectItem value="work">العمل</SelectItem>
                        <SelectItem value="other">أخرى</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-xs md:text-sm text-slate-700 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={saveAddress}
                      onChange={(e) => setSaveAddress(e.target.checked)}
                      className="rounded border-slate-300 text-[#1261D8] focus:ring-[#1261D8]"
                    />
                    <span>احفظ هذا العنوان في حسابي لتسهيل الطلبات القادمة</span>
                  </label>
                </div>
              ) : null}
            </div>

            {/* Payment Information Card (Neutral Informational) */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 md:p-6 shadow-sm space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-[#FF8A00]/10 text-[#FF8A00] flex items-center justify-center">
                  <CreditCard size={18} />
                </div>
                <h2 className="text-lg md:text-xl font-black text-[#071A3D]">طريقة الدفع</h2>
              </div>
              <p className="text-xs md:text-sm font-semibold text-slate-700 leading-relaxed">
                طريقة الدفع الحالية: الدفع عند الاستلام
              </p>
            </div>

            {/* Guest Provisional Account Notice */}
            {!user && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs md:text-sm leading-relaxed text-blue-900">
                سننشئ لك حساب متابعة تلقائياً باستخدام بيانات الطلب لتتمكن من متابعة طلبك لاحقاً.
              </div>
            )}

            {/* Primary Submit & WhatsApp Actions */}
            <div className="space-y-3 pt-2">
              <Button
                type="submit"
                size="lg"
                className="w-full h-14 rounded-xl text-base md:text-lg font-black bg-[#1261D8] hover:bg-[#0E4EB0] text-white shadow-lg shadow-[#1261D8]/20 transition-all hover:scale-[1.01]"
                disabled={loading || isPreviewLoading || isPreviewError || authoritativeDeliveryCost == null}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={20} className="animate-spin" />
                    <span>جاري تأكيد الطلب...</span>
                  </span>
                ) : isPreviewLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={20} className="animate-spin" />
                    <span>جارٍ تحديث الأسعار...</span>
                  </span>
                ) : (
                  <span>تأكيد الطلب ({formatPrice(total)})</span>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full h-12 rounded-xl text-xs md:text-sm font-bold border-slate-200 bg-white text-slate-700 hover:bg-slate-50 gap-2 shadow-sm"
                onClick={() => void handleTrackedWhatsAppFromCart()}
              >
                <MessageCircle size={17} className="text-emerald-600" />
                <span>مساعدة عبر واتساب</span>
              </Button>
            </div>
          </form>

          {/* Sticky Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 md:p-6 shadow-sm sticky top-24 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-lg md:text-xl font-black text-[#071A3D]">
                  ملخص الطلب ({items.length} منتجات)
                </h2>
                {isPreviewFetching && !isPreviewLoading && (
                  <div className="flex items-center gap-1.5 text-xs text-[#1261D8] bg-blue-50 px-2 py-0.5 rounded-md">
                    <Loader2 size={12} className="animate-spin" />
                    <span>جارٍ التحديث...</span>
                  </div>
                )}
              </div>

              {isPreviewError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between gap-2">
                  <span>تعذر تحديث أسعار الطلب</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void refetchPreview()}
                    className="text-xs h-7 border-red-300 text-red-700 hover:bg-red-100 shrink-0"
                  >
                    حاول مرة أخرى
                  </Button>
                </div>
              )}

              {/* Order Items List */}
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {items.map((item) => {
                  const product = item.product;
                  const itemPrice = product.discount_price ?? product.price;
                  return (
                    <div
                      key={product.id}
                      className="flex items-start justify-between border-b border-slate-100 pb-3 text-xs md:text-sm last:border-0 last:pb-0 gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800 line-clamp-1">{product.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">الكمية: {item.quantity}</p>
                      </div>
                      <div className="shrink-0 text-left">
                        <p className="font-black text-slate-900">{formatPrice(itemPrice * item.quantity)}</p>
                        <button
                          type="button"
                          onClick={() => removeItem(product.id)}
                          className="mt-1 text-[11px] text-red-600 hover:underline"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Coupon Section */}
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <label htmlFor="checkout-coupon-input" className="text-xs font-bold text-slate-700 block">
                  كود الخصم
                </label>
                {coupon ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3">
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
                      className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      aria-label="إزالة الكوبون"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      id="checkout-coupon-input"
                      placeholder="أدخل كود الخصم"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      maxLength={20}
                      className={cn(checkoutFieldClass, "h-10 uppercase text-xs font-bold")}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleApplyCoupon}
                      disabled={isValidating || !couponInput.trim()}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 text-xs h-10 shrink-0"
                    >
                      {isValidating ? <Loader2 size={14} className="animate-spin" /> : "تطبيق"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Loyalty Points Redemption Section */}
              {user && !isProvisionalUser && availablePoints > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <div
                    className={cn(
                      "rounded-xl border p-3.5 transition-colors space-y-2",
                      usePoints ? "border-[#FF8A00]/40 bg-[#FF8A00]/5" : "border-slate-200 bg-slate-50/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center",
                            usePoints ? "bg-[#FF8A00]/20 text-[#FF8A00]" : "bg-slate-200 text-slate-600",
                          )}
                        >
                          <Coins size={15} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">نقاط المكافآت</p>
                          <p className="text-[11px] text-slate-500">
                            رصيدك: {availablePoints} نقطة ({formatPrice(availablePoints * 10)})
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant={usePoints ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUsePoints(!usePoints)}
                        className={cn(
                          "h-8 text-xs font-bold px-2.5",
                          usePoints ? "bg-[#FF8A00] hover:bg-[#E67C00] text-white" : "border-slate-300 text-slate-700",
                        )}
                      >
                        {usePoints ? "إلغاء الخصم" : "استخدام النقاط"}
                      </Button>
                    </div>
                    {usePoints && (
                      <div className="text-[11px] font-bold text-[#E67C00] pt-1 border-t border-[#FF8A00]/20">
                        سيتم خصم {formatPrice(pointsRedemptionValue)} مقابل {pointsToSpend} نقطة.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Totals Breakdown */}
              <div className="space-y-2.5 border-t border-slate-100 pt-4 text-xs md:text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>المجموع الفرعي</span>
                  <span className="font-bold text-slate-800">{formatPrice(authoritativeSubtotal)}</span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>التوصيل</span>
                  <span className="font-bold text-slate-800">
                    {authoritativeDeliveryCost != null
                      ? authoritativeDeliveryCost > 0
                        ? formatPrice(authoritativeDeliveryCost)
                        : "مجاني"
                      : "غير متاح حالياً"}
                  </span>
                </div>

                {authoritativeDiscount > 0 && (
                  <div className="flex justify-between font-bold text-emerald-600">
                    <span>خصم الكوبون</span>
                    <span>-{formatPrice(authoritativeDiscount)}</span>
                  </div>
                )}

                {pointsRedemptionValue > 0 && (
                  <div className="flex justify-between font-bold text-[#FF8A00]">
                    <span>خصم النقاط</span>
                    <span>-{formatPrice(pointsRedemptionValue)}</span>
                  </div>
                )}

                <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-base md:text-lg font-black">
                  <span className="text-[#071A3D]">المجموع الكلي</span>
                  <span className="text-[#1261D8] text-xl md:text-2xl">{formatPrice(total)}</span>
                </div>
              </div>

              {/* Trust Badge */}
              <div className="pt-2 flex items-center justify-center gap-2 text-xs text-slate-500 border-t border-slate-100">
                <ShieldCheck size={16} className="text-[#1261D8]" />
                <span>تسوق بثقة عبر ديل مارت</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
      <WhatsAppButton />
    </div>
  );
};

export default Checkout;
