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
import { Trash2, Ticket, X, Loader2, MapPin, CheckCircle, Coins, Home, Building2, PlusCircle } from "lucide-react";
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
  return "merchants" in p;
}

/** حقول نماذج واضحة على خلفية فاتحة (لا تعتمد على bg-background الداكن للثيم العام) */
const checkoutFieldClass =
  "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 shadow-sm focus-visible:border-DilMart-store-gold/50 focus-visible:ring-DilMart-store-gold/25";

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
   *
   * `setLoading(false)` on its own is wrong here: an old customer A request finishing after customer B
   * has started their own submit would re-enable the button under B and let them order twice. Equally,
   * simply returning without clearing wedges the page — the guest path has no owner change to trigger a
   * reset, so the button stays disabled until a reload. Ownership answers both: only the submit that
   * still holds the flag may clear it.
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
   * §9.3 — this route is PUBLIC, so nothing unmounts it when the authenticated customer is replaced
   * (another tab redeeming a handoff swaps the shared web cookie). Every field below is customer
   * IDENTITY_SCOPED — name, phone, governorate, area, landmark, notes, map coordinates, the selected
   * saved address, and the loyalty-points intent.
   *
   * Clearing React Query alone does not reach them, and the hydration effects deliberately fall back to
   * `prev` (`profile.full_name || prev.name`, `defaultAddress.area ?? prev.area`) while the saved-address
   * effect returns early when the new customer has none — so a customer with empty profile fields and no
   * saved addresses would silently inherit the previous customer's details and submit them.
   *
   * The reset is keyed on the PRINCIPAL, not the identity epoch: a token rotation or a new session family
   * for the same person is still their checkout. Guest-entered values also survive a guest → provisional
   * upgrade, which the existing checkout flow depends on. Cart contents are not customer-private and are
   * deliberately untouched.
   */
  const { owner: principalOwner, beginOperation } = usePrincipalContinuity(() => {
    setForm(EMPTY_CUSTOMER_FORM);
    setSelectedAddressId("new");
    setSaveAddress(false);
    setAddressLabel("home");
    setAutoFilledFromLastOrder(false);
    setUsePoints(false);
    // Busy flags belong to the PREVIOUS owner's operation. The new owner must be able to act, and
    // the stale operation is separately prevented from clearing these again when it finishes.
    setLoading(false);
    setGettingLocation(false);
    // The checkout attempt id is owned by the actor that created it — the backend rejects another
    // user presenting it (403). Leaving it behind would wedge the new customer on a foreign attempt.
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
      setForm(prev => ({
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

  const selectedGov = governorates?.find((g) => g.id === form.governorate_id);
  const deliveryCost =
    selectedGov?.delivery_price != null && Number.isFinite(Number(selectedGov.delivery_price))
      ? Number(selectedGov.delivery_price)
      : null;
  const subtotal = getSubtotal();
  const discount = getDiscountAmount();

  const { data: customerProfile } = useQuery({
    queryKey: ["customer-profile", authSource, user?.id],
    queryFn: () => apiClient.getCustomerProfile(),
    enabled: !!user,
    retry: false,
    staleTime: 60_000,
  });

  const { data: savedAddresses, refetch: refetchAddresses } = useQuery({
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

  const { data: loyaltyPreview } = useQuery({
    queryKey: ["loyalty-preview", authSource, user?.id, subtotal, discount],
    queryFn: () =>
      apiClient.loyaltyPreview({
        subtotal: Math.max(0, subtotal - discount),
      }),
    enabled: !!user,
    retry: false,
    placeholderData: { available_points: 0, redeemable_amount: 0 },
  });

  // Loyalty Points Calculations
  const availablePoints = loyaltyPreview?.available_points ?? profile?.points ?? 0;
  // Calculate points only for products that have loyalty points enabled
  const earnedPoints = items.reduce((sum, item) => {
    if (!isMarketplaceProduct(item.product) || item.product.loyalty_points_enabled !== false) {
      const price = item.product.discount_price ?? item.product.price;
      return sum + Math.floor((price * item.quantity) / 100);
    }
    return sum;
  }, 0);

  // 1 point = 10 IQD discount
  const userEmailLower = (user?.email ?? "").toLowerCase();
  const isProvisionalUser =
    userEmailLower.endsWith("@provisional.dilmart.com") ||
    userEmailLower.endsWith("@provisional.dilmart.org");
  const pointsRedemptionValue = usePoints && !isProvisionalUser
    ? Math.min(loyaltyPreview?.redeemable_amount ?? availablePoints * 10, Math.max(0, subtotal - discount))
    : 0;
  const pointsToSpend = usePoints && !isProvisionalUser ? Math.floor(pointsRedemptionValue / 10) : 0;

  // Total = Subtotal - Discount - PointsDiscount + Delivery
  const total = Math.max(0, subtotal - discount - pointsRedemptionValue) + (deliveryCost ?? 0);

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
      timeout: 10000, // 10 seconds timeout
      maximumAge: 60000 // 1 minute cached location acceptable
    };

    // §9.3 — geolocation resolves long after it starts. Captured here so a position requested by the
    // previous customer cannot write their coordinates into the current customer's form.
    const locationOperation = beginOperation();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!locationOperation.isCurrent()) return; // requester is no longer the owner — drop silently
        const { latitude, longitude } = position.coords;
        const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

        setForm(prev => ({
          ...prev,
          latitude,
          longitude,
          map_url: mapUrl
        }));

        toast.success("تم تحديد موقعك بنجاح");
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
      options
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
          value: couponData.value
        });
        toast.success(`تم تطبيق الكوبون - خصم ${couponData.discount_type === 'percentage' ? '%' + couponData.value : formatPrice(couponData.value)}`);
        setCouponInput("");
      } else {
        toast.error(couponData.message || "الكوبون غير صالح");
      }
    } catch (error) {
      console.error(error);
      toast.error("حدث خطأ أثناء التحقق من الكوبون");
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
    if (deliveryCost == null) {
      toast.error("لا يتوفر سعر توصيل Jenni للمحافظة المختارة حالياً. جرّب محافظة أخرى أو تواصل مع الإدارة.");
      return;
    }

    const integrity = ensureIntegrity();
    if (!integrity.merchantId) {
      toast.error("تعذر تحديد متجر السلة. يرجى إعادة إضافة المنتجات.");
      return;
    }

    // §9.3 — captured BEFORE the FIRST await of the submit, including the provisional-signup block.
    // Capturing it after that block left createProvisionalUser / establishProvisionalSession / the
    // context fetch entirely unguarded, and establishProvisionalSession logs out the active federated
    // identity — so a stale guest submit could destroy an unrelated customer's session.
    const operation = beginOperation();
    const stillCurrentPrincipal = () => operation.isCurrent();

    // The owner comes from the AUTHORITATIVE snapshot, not from the rendered value. The two disagree in
    // exactly the window this whole guard exists for: the lifecycle installs an identity before React
    // commits it. Trusting the rendered owner there would persist the checkout attempt under the wrong
    // principal, and a retry — arriving as the real one — would find no attempt it owned and mint a
    // second one, which the backend can turn into a second order for one purchase.
    let submittingOwner = operation.expected().owner;

    // If the screen is showing one customer while the lifecycle already holds another, the form on it
    // belongs to neither. Refuse rather than send what A typed under B's API identity.
    if (principalOwner !== submittingOwner) {
      toast.error("تغيّر الحساب الحالي. يرجى مراجعة بياناتك ثم إعادة المحاولة.");
      return;
    }

    const submitTicket = submitTicketRef.current + 1;
    submitTicketRef.current = submitTicket;
    /** Release the busy flag only if a newer submit has not taken ownership of it. */
    const releaseLoading = () => {
      if (submitTicketRef.current === submitTicket) setLoading(false);
    };
    setLoading(true);

    let activeUserId = user?.id;
    let activeUserEmail = user?.email;
    let isNewProvisional = false;

    // STORE-PR5 §Phase L — provisional signup is for TRUE guests ONLY. A federated (or Supabase) customer is
    // already authenticated, so this block never runs for them. Gate on the settled `unauthenticated` status
    // so a submit fired mid-bootstrap can NEVER race a federated identity into a provisional Supabase account.
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

        // A principal that appeared while provisioning was in flight is NOT this operation's own
        // upgrade. This is an early exit only — the binding check happens inside the session lifecycle
        // owner, which is the sole place that can verify it atomically with the mutation it protects.
        if (!stillCurrentPrincipal()) {
          releaseLoading();
          return;
        }

        const { session: provisionalSession, principalSnapshot } = await establishProvisionalSession(
          email,
          password,
          operation.expected(),
        );

        // This operation CREATED this principal, so it rebinds to the AUTHORITATIVE snapshot the
        // lifecycle owner returned for that establishment and keeps going as that customer.
        operation.adopt(principalSnapshot);
        submittingOwner = principalSnapshot.owner;

        activeUserId = provisionalSession.user.id;
        activeUserEmail = provisionalSession.user.email;
        isNewProvisional = true;

        // Wait for the authenticated context to be ready before submitting the order.
        await queryClient.fetchQuery({
          queryKey: ["auth-context", "supabase", provisionalSession.user.id],
          queryFn: () => apiClient.getAuthContext(provisionalSession.access_token),
          staleTime: 0,
        });

        // The context fetch is an await like any other: the provisional customer can be replaced or
        // signed out while it runs. Without this the operation would fall through and submit the
        // guest's delivery details using whoever the API layer now authenticates as.
        if (!stillCurrentPrincipal()) {
          releaseLoading();
          return;
        }
      } catch (err: unknown) {
        console.error("Provisional signup failed.");
        // A stale-principal rejection is this guard working, not a failure the customer caused. Neither
        // it nor any other stale failure may surface to whoever is using the tab now. The transaction can
        // also be refused without the principal changing at all — a handoff that starts and then fails —
        // so the busy flag has to be released on this path too, or the page is stuck.
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

    // The attempt belongs to whoever will actually send it. For a guest submit that just created a
    // provisional customer, that is the PROVISIONAL principal — not the `null` this closure captured
    // before the upgrade. Persisting it as guest-owned broke both the backend ownership model and
    // idempotent retry, since the retry would arrive as supabase:<id> and see no attempt it owned.
    // Re-confirm before touching attempt storage: everything above may have awaited, and an attempt
    // minted for a principal that is no longer current would be sent under somebody else.
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

      // The order belongs to the principal that submitted it. If the customer changed while this was
      // in flight, clearing the cart and navigating would apply ANOTHER customer's completion to the
      // one now using this tab — including showing them a foreign order number.
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
        return; // do not surface A's failure to B
      }

      // Attempt status check for network disconnects or timeouts
      if (checkoutAttemptId) {
        try {
          const attemptStatus = await apiClient.getCheckoutAttempt(checkoutAttemptId);
          if (!stillCurrentPrincipal()) {
            releaseLoading();
            return; // recovery for a foreign attempt must not commit
          }
          if (attemptStatus.status === "completed" && attemptStatus.order_number) {
            clearStoredCheckoutAttempt();
            clearCart();
            toast.success("تم استلام الطلب بنجاح");
            navigate(`/thank-you?order=${attemptStatus.order_number}`);
            return;
          }
        } catch {
          // The recovery lookup itself failed. It was awaited, so the principal may have changed
          // while it ran — re-check before falling through to the toast below.
          if (!stillCurrentPrincipal()) {
            releaseLoading();
            return;
          }
        }
      }

      if (!stillCurrentPrincipal()) {
        releaseLoading();
        return; // never surface one principal's failure to another
      }
      toast.error(msg && msg.length < 220 ? msg : "حدث خطأ أثناء إرسال الطلب");
    } finally {
      // Ownership rather than principal identity: B may have started their OWN submit, and a stale
      // finally must not clear the busy flag of a request that is still running. Conversely a stale
      // operation that nobody superseded still has to hand the page back.
      releaseLoading();
    }
  };

  const handleTrackedWhatsAppFromCart = async () => {
    const integrity = ensureIntegrity();
    if (!integrity.merchantId) {
      toast.error("تعذر تحديد متجر السلة لبدء محادثة متتبعة.");
      return;
    }
    const firstProduct = items[0]?.product;
    const merchantName =
      (firstProduct && isMarketplaceProduct(firstProduct) ? firstProduct.merchants?.display_name : null) ||
      "Merchant";
    try {
      await startTrackedWhatsAppIntent({
        merchantId: integrity.merchantId,
        merchantName,
        sourceSurface: "cart",
        cart: items.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          price: item.product.discount_price ?? item.product.price,
        })),
        completionLink: `${window.location.origin}/checkout`,
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "تعذر فتح مسار واتساب المتتبع.");
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-luxury-ivory text-luxury-ivory-fg">
        <Header />
        <main className="container flex-1 py-20 text-center">
          <h1 className="font-display text-2xl font-semibold text-zinc-900 md:text-3xl">السلة فارغة</h1>
          <p className="mt-3 text-zinc-600">أضف منتجات للسلة أولاً</p>
          <Link to="/products" className="mt-6 inline-block">
            <Button className="rounded-full">تصفح المنتجات</Button>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-luxury-ivory text-zinc-900">
      <Header />
      <main className="container flex-1 py-8 md:py-12">
        <h1 className="font-display mb-2 text-3xl font-semibold tracking-tight text-zinc-950 md:text-4xl">إتمام الطلب</h1>
        <p className="mb-8 text-sm text-zinc-600">أكمل بيانات التوصيل لإرسال طلبك بأمان.</p>

        <div className="grid gap-8 md:grid-cols-3">
          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 md:col-span-2">
            <div className="space-y-4 rounded-2xl border border-DilMart-store-gold/15 bg-white/95 p-6 shadow-sm">
              <h2 className="mb-1 font-display text-xl font-semibold text-zinc-900">معلومات التوصيل</h2>
              <p className="mb-4 text-sm text-zinc-500">الحقول المعلّمة بـ * مطلوبة.</p>

              {user ? (
                <div className="rounded-xl border border-zinc-200 p-4">
                  <p className="mb-3 text-sm font-semibold text-zinc-900">اختر عنوان التوصيل</p>
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
                            "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-right",
                            selectedAddressId === addr.id ? "border-DilMart-store-gold bg-DilMart-store-gold/10" : "border-zinc-200",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {(addr.label || "").toLowerCase() === "work" ? <Building2 size={16} /> : <Home size={16} />}
                            <span className="font-medium">{getAddressLabelText(addr.label)}</span>
                            {addr.is_default ? <Badge variant="secondary">افتراضي</Badge> : null}
                          </div>
                          <span className="text-xs text-zinc-600">{addr.area}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSelectedAddressId("new")}
                        className={cn(
                          "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm",
                          selectedAddressId === "new" ? "border-DilMart-store-gold bg-DilMart-store-gold/10" : "border-zinc-300",
                        )}
                      >
                        <PlusCircle size={16} />
                        إضافة عنوان جديد
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-zinc-600">لا يوجد لديك عناوين محفوظة. أضف عنوانك لتسهيل الطلبات القادمة.</p>
                      {autoFilledFromLastOrder ? (
                        <p className="text-xs text-emerald-700">تم ملء الحقول تلقائيًا من آخر طلب سابق لديك.</p>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="rounded-xl border border-DilMart-store-gold/15 bg-DilMart-store-gold/[0.06] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="flex items-center gap-2 font-semibold text-zinc-800">
                    <MapPin className="text-DilMart-store-gold" size={18} />
                    موقع التوصيل
                  </Label>
                  {form.map_url ? (
                    <Badge variant="secondary" className="gap-1 border border-emerald-200/80 bg-emerald-50 text-emerald-800 hover:bg-emerald-100">
                      <CheckCircle size={12} />
                      تم تحديد الموقع
                    </Badge>
                  ) : null}
                </div>
                <p className="mb-4 text-xs leading-relaxed text-zinc-600">
                  قم بتحديد موقعك الحالي لتسهيل عملية التوصيل وسرعة الوصول إليك.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGetLocation}
                    disabled={gettingLocation}
                    className="w-full gap-2 border-zinc-300 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white"
                  >
                    {gettingLocation ? <Loader2 className="animate-spin" size={16} /> : <MapPin size={16} />}
                    {form.map_url ? "تحديث موقعي الحالي" : "تحديد موقعي الحالي"}
                  </Button>
                </div>
                {form.map_url && (
                  <div className="mt-2 truncate text-xs text-zinc-500" dir="ltr">
                    {form.map_url}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-zinc-800">
                    الاسم الكامل *
                  </Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    maxLength={100}
                    autoComplete="name"
                    className={checkoutFieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-zinc-800">
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
                    placeholder="07XXXXXXXX"
                    className={checkoutFieldClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-zinc-800">المحافظة *</Label>
                  <Select value={form.governorate_id} onValueChange={(v) => {
                    setForm({ ...form, governorate_id: v, area: "" }); // Reset area/region when gov changes
                  }}>
                    <SelectTrigger className={cn(checkoutFieldClass, "h-10")}>
                      <SelectValue placeholder="اختر المحافظة" />
                    </SelectTrigger>
                    <SelectContent>
                      {governorates?.map((gov) => (
                        <SelectItem key={gov.id} value={gov.id}>
                          {gov.name} - توصيل {gov.delivery_price != null ? formatPrice(gov.delivery_price) : "غير متاح"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="area" className="text-zinc-800">
                    المنطقة / الحي *
                  </Label>
                  {regions && regions.length > 0 ? (
                    <>
                      <Select value={form.area} onValueChange={(v) => setForm({ ...form, area: v })}>
                        <SelectTrigger className={cn(checkoutFieldClass, "h-10")}>
                          <SelectValue placeholder="اختر المنطقة" />
                        </SelectTrigger>
                        <SelectContent>
                          {regions.map((region) => (
                            <SelectItem key={region.id} value={region.name}>
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
                        className={cn(checkoutFieldClass, "text-xs")}
                      />
                    </>
                  ) : (
                    <Input
                      id="area"
                      value={form.area}
                      onChange={(e) => setForm({ ...form, area: e.target.value })}
                      required
                      maxLength={100}
                      placeholder="اسم المنطقة أو الحي"
                      className={checkoutFieldClass}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="landmark" className="text-zinc-800">
                  أقرب نقطة دالة
                </Label>
                <Input
                  id="landmark"
                  value={form.landmark}
                  onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                  maxLength={200}
                  className={checkoutFieldClass}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-zinc-800">
                  ملاحظات
                </Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  maxLength={500}
                  className={cn(checkoutFieldClass, "min-h-[100px]")}
                />
              </div>

              {user && selectedAddressId === "new" ? (
                <div className="space-y-3 rounded-xl border border-zinc-200 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="address_label">تصنيف العنوان</Label>
                    <Select value={addressLabel} onValueChange={setAddressLabel}>
                      <SelectTrigger id="address_label" className={cn(checkoutFieldClass, "h-10")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="home">المنزل</SelectItem>
                        <SelectItem value="work">العمل</SelectItem>
                        <SelectItem value="other">أخرى</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={saveAddress}
                      onChange={(e) => setSaveAddress(e.target.checked)}
                    />
                    احفظ هذا العنوان للطلبات القادمة
                  </label>
                </div>
              ) : null}
            </div>

            <Button type="submit" size="lg" className="h-14 w-full rounded-full text-lg font-semibold shadow-lg shadow-black/10" disabled={loading}>
              {loading ? "جاري إرسال الطلب..." : `تأكيد الطلب (${formatPrice(total)})`}
            </Button>
            <Button type="button" variant="outline" size="lg" className="h-12 w-full rounded-full" onClick={() => void handleTrackedWhatsAppFromCart()}>
              تواصل عبر واتساب المتجر (Tracked)
            </Button>
          </form>

          {/* Order Summary */}
          <div className="sticky top-24 h-fit space-y-4">
            <div className="rounded-2xl border border-DilMart-store-gold/15 bg-white/95 p-6 shadow-sm">
              <h2 className="font-display mb-4 text-xl font-semibold text-zinc-900">ملخص الطلب</h2>
              <div className="mb-4 space-y-4">
                {items.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-start justify-between border-b border-dashed border-zinc-200 pb-4 text-sm last:border-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1 pl-2">
                      <p className="font-medium text-zinc-900">{item.product.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">الكمية: {item.quantity}</p>
                    </div>
                    <div className="shrink-0 text-left">
                      <p className="font-semibold text-zinc-900">{formatPrice((item.product.discount_price ?? item.product.price) * item.quantity)}</p>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        className="mt-1 text-xs text-red-600 underline-offset-2 hover:underline"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon Section */}
              <div className="mb-4 border-t border-zinc-200 pt-4">
                {coupon ? (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex items-center gap-2 text-emerald-800">
                      <Ticket size={16} />
                      <div>
                        <p className="font-bold text-sm">{coupon.code}</p>
                        <p className="text-[10px]">خصم {coupon.type === 'percentage' ? `%${coupon.value}` : formatPrice(coupon.value)}</p>
                      </div>
                    </div>
                    <button type="button" onClick={removeCoupon} className="rounded-full bg-emerald-100 p-1 text-emerald-800 hover:bg-emerald-200">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="كود الخصم"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      maxLength={20}
                      className={cn(checkoutFieldClass, "h-10 uppercase")}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyCoupon}
                      disabled={isValidating || !couponInput}
                      size="sm"
                      className="shrink-0 border-DilMart-store-gold/40 bg-DilMart-store-gold/15 font-semibold text-zinc-900 hover:bg-DilMart-store-gold/25"
                    >
                      {isValidating ? <Loader2 size={14} className="animate-spin" /> : "تطبيق"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Loyalty Points Section */}
              {user && !isProvisionalUser && availablePoints > 0 && (
                <div className="mb-4 border-t border-zinc-200 pt-4">
                  <div
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      usePoints ? "border-amber-200 bg-amber-50/90" : "border-zinc-200 bg-zinc-50/80",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "rounded-full p-1.5",
                            usePoints ? "bg-amber-100 text-amber-700" : "bg-zinc-200 text-zinc-600",
                          )}
                        >
                          <Coins size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-900">نقاط الولاء</p>
                          <p className="text-[10px] text-zinc-600">
                            لديك {availablePoints} نقطة ({formatPrice(availablePoints * 10)})
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant={usePoints ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUsePoints(!usePoints)}
                        className={cn(
                          "h-8",
                          usePoints ? "border-0 bg-amber-600 hover:bg-amber-700" : "border-zinc-300 text-zinc-800",
                        )}
                      >
                        {usePoints ? "إلغاء الاستخدام" : "استخدام الآن"}
                      </Button>
                    </div>
                    {usePoints && (
                      <div className="mt-2 animate-in fade-in slide-in-from-top-1 text-[10px] font-medium text-amber-900">
                        سيتم خصم {formatPrice(pointsRedemptionValue)} من الإجمالي مقابل {pointsToSpend} نقطة.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Guest provisional-account notice — always visible when not logged in */}
              {!user && (
                <div className="mb-4">
                  <p className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-[11px] leading-relaxed text-amber-800">
                    سيتم إنشاء حساب متابعة تلقائي من بيانات التوصيل حتى تتمكن من متابعة طلبك لاحقاً.
                  </p>
                </div>
              )}

              {/* Points to Earn Info */}
              {earnedPoints > 0 && (
                <div className="mb-4 space-y-2 px-0.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="rounded-md border border-DilMart-store-gold/25 bg-DilMart-store-gold/10 py-0.5 text-[10px] font-bold text-zinc-800">
                      <Coins size={10} className="ml-1 text-DilMart-store-gold" />
                      مكافأة الطلب: {earnedPoints} نقطة
                    </Badge>
                  </div>
                </div>
              )}

              <div className="space-y-2 border-t border-zinc-200 pt-4 text-sm">
                <div className="flex justify-between text-zinc-600">
                  <span>المجموع الفرعي</span>
                  <span className="font-medium text-zinc-900">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>التوصيل</span>
                  <span className="font-medium text-zinc-900">
                    {deliveryCost != null ? (deliveryCost > 0 ? formatPrice(deliveryCost) : "مجاني") : "غير متاح — Jenni"}
                  </span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between font-semibold text-emerald-700">
                    <span>قيمة الكوبون</span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}
                {pointsRedemptionValue > 0 && (
                  <div className="flex justify-between font-semibold text-amber-800">
                    <span>خصم النقاط</span>
                    <span>-{formatPrice(pointsRedemptionValue)}</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between border-t border-zinc-200 pt-4 text-lg font-bold">
                  <span className="text-zinc-900">الإجمالي</span>
                  <span className="text-DilMart-store-gold">{formatPrice(total)}</span>
                </div>
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
