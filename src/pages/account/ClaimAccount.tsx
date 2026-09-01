import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ShieldCheck, Phone, Lock, CheckCircle2, ArrowRight, RefreshCw, Package, Eye, EyeOff, LogIn, AlertCircle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-core";
import { WEAK_PASSWORD_MESSAGE_AR } from "@/lib/auth/password-errors";
import { customerApi } from "@/lib/api/customer";
import { useAuth } from "@/hooks/use-auth";
import { isValidIraqiMobile, toIraqiLocalDisplay } from "@/lib/auth/identifier";
import AuthPageShell from "@/components/auth/AuthPageShell";
import AuthStorageErrorScreen from "@/components/auth/AuthStorageErrorScreen";
import OtpCodeInput from "@/components/auth/OtpCodeInput";

type Step = "phone" | "otp" | "password" | "done";
type Outcome = "upgraded" | "merged";

export default function ClaimAccount() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialOrderNumber = searchParams.get("orderNumber") || "";
  const initialPhone = searchParams.get("phone") || "";
  const { appSession, authStatus, retryStorageBootstrap, profile, refetch, logoutCurrentDevice } = useAuth();

  useEffect(() => {
    document.title = "استلام الحساب | DILMART";
  }, []);

  const isProvisional =
    authStatus === "authenticated_ready" &&
    (profile?.account_type === "provisional_customer" || profile?.claim_required === true);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState(initialPhone || profile?.phone || "");
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [actionToken, setActionToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>("upgraded");

  // Post-claim finalization failure states
  const [postMergeLogoutError, setPostMergeLogoutError] = useState(false);
  const [postUpgradeRefetchError, setPostUpgradeRefetchError] = useState(false);
  const [finalizingAction, setFinalizingAction] = useState(false);

  const timerRef = useRef<number | null>(null);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const startResendTimer = (seconds: number) => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setResendTimer(seconds);
    timerRef.current = window.setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      toast.error("يرجى إدخال رقم الهاتف");
      return;
    }

    if (!isValidIraqiMobile(trimmedPhone)) {
      toast.error("يرجى إدخال رقم هاتف عراقي صحيح");
      return;
    }

    const normalizedPhone = toIraqiLocalDisplay(trimmedPhone);

    // Guest / Unauthenticated flow: Order Number is mandatory
    if (!isProvisional && !orderNumber.trim()) {
      toast.error("يرجى إدخال رقم الطلب المرتبط بحسابك");
      return;
    }

    setLoading(true);
    try {
      if (orderNumber.trim() || !isProvisional) {
        // Guest recovery flow with opaque request_id
        const res = await customerApi.recoverClaimByOrder(orderNumber.trim(), normalizedPhone);
        setChallengeId(res.request_id);
        startResendTimer(60);
        toast.info("إذا كانت البيانات صحيحة، فقد تم إرسال رمز التحقق.");
      } else {
        // Authenticated provisional customer flow
        const res = await customerApi.requestAccountClaim(normalizedPhone);
        setChallengeId(res.challenge_id);
        startResendTimer(res.resend_after || 60);
        toast.success("أرسلنا رمز التوثيق إلى واتساب");
      }
      setStep("otp");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "فشل إرسال رمز التوثيق";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0 || loading) return;
    const trimmedPhone = phone.trim();
    const normalizedPhone = toIraqiLocalDisplay(trimmedPhone);

    setLoading(true);
    try {
      if (orderNumber.trim() || !isProvisional) {
        const res = await customerApi.recoverClaimByOrder(orderNumber.trim(), normalizedPhone);
        setChallengeId(res.request_id);
        startResendTimer(60);
        toast.info("إذا كانت البيانات صحيحة، فقد تم إرسال رمز التحقق.");
      } else {
        const res = await customerApi.requestAccountClaim(normalizedPhone);
        setChallengeId(res.challenge_id);
        startResendTimer(res.resend_after || 60);
        toast.success("أرسلنا رمز التوثيق إلى واتساب");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "تعذر إعادة إرسال الرمز";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (otp.trim().length < 6) {
      toast.error("رمز التوثيق يتكون من 6 أرقام");
      return;
    }

    setLoading(true);
    try {
      const res = await customerApi.verifyAccountClaimOtp(challengeId, otp.trim());
      if (res.success && res.action_token) {
        setActionToken(res.action_token);
        toast.success("تم إثبات ملكية الرقم بنجاح");
        setStep("password");
      } else {
        toast.error("رمز التوثيق غير صحيح");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "رمز التوثيق غير صحيح";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!newPassword || newPassword.length < 6) {
      toast.error("كلمة المرور يجب أن لا تقل عن 6 خانات");
      return;
    }
    if (!confirmPassword) {
      toast.error("يرجى تأكيد كلمة المرور");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }

    setLoading(true);
    try {
      const res = await customerApi.completeAccountClaim({
        action_token: actionToken,
        new_password: newPassword,
      });

      if (res.success) {
        if (res.merged === true) {
          // Account was merged on backend into an existing permanent customer account.
          // Safely terminate provisional session without swallowing secure storage errors.
          setOutcome("merged");
          try {
            await logoutCurrentDevice();
            setPostMergeLogoutError(false);
            setStep("done");
            toast.success("تم دمج حسابك بنجاح. يرجى تسجيل الدخول");
          } catch {
            setPostMergeLogoutError(true);
            setStep("done");
            toast.error("تم دمج الحساب، لكن تعذر إنهاء الجلسة الحالية بأمان.");
          }
        } else {
          // Account was upgraded in-place on backend.
          // Refresh authoritative auth context without swallowing failure.
          setOutcome("upgraded");
          try {
            await refetch();
            setPostUpgradeRefetchError(false);
            setStep("done");
            toast.success(res.message || "تم استلام حسابك وتعيين كلمة المرور بنجاح");
          } catch {
            setPostUpgradeRefetchError(true);
            setStep("done");
            toast.error("تم استلام الحساب، لكن تعذر تحديث بيانات الجلسة.");
          }
        }
      }
    } catch (err: unknown) {
      // Structured weak-password handling preserves action token and keeps user on password step
      if (err instanceof ApiError && err.code === "WEAK_PASSWORD") {
        toast.error(err.message || WEAK_PASSWORD_MESSAGE_AR);
        return;
      }
      toast.error(err instanceof Error && err.message ? err.message : "فشل إكمال استلام الحساب");
    } finally {
      setLoading(false);
    }
  };

  // Retry ONLY logout after merged === true without repeating claim API
  const handleRetryLogout = async () => {
    if (finalizingAction) return;
    setFinalizingAction(true);
    try {
      await logoutCurrentDevice();
      setPostMergeLogoutError(false);
      toast.success("تم إنهاء الجلسة بنجاح، يمكنك الآن تسجيل الدخول.");
    } catch {
      toast.error("تعذر إنهاء الجلسة المحلية، يرجى المحاولة مجدداً.");
    } finally {
      setFinalizingAction(false);
    }
  };

  // Retry ONLY auth context refetch after merged === false without repeating claim API
  const handleRetryRefetch = async () => {
    if (finalizingAction) return;
    setFinalizingAction(true);
    try {
      await refetch();
      setPostUpgradeRefetchError(false);
      toast.success("تم تحديث بيانات الحساب بنجاح.");
    } catch {
      toast.error("تعذر تحديث بيانات الحساب، يرجى المحاولة مجدداً.");
    } finally {
      setFinalizingAction(false);
    }
  };

  // 1. Storage Error State
  if (authStatus === "storage_error") {
    return <AuthStorageErrorScreen onRetry={retryStorageBootstrap || (() => {})} />;
  }

  // 2. Loading State while auth bootstraps
  if (authStatus === "bootstrapping" || authStatus === "authenticated_loading_context") {
    return (
      <AuthPageShell>
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm font-medium">جاري التحقق من بيانات الحساب...</p>
        </div>
      </AuthPageShell>
    );
  }

  // 3. Authenticated Offline State -> Never treat as Guest, show non-destructive offline state
  if (authStatus === "authenticated_offline" && appSession) {
    return (
      <AuthPageShell>
        <div className="text-center space-y-4 py-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
            <WifiOff className="h-7 w-7" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">
            يلزم اتصال بالإنترنت لاستلام الحساب.
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            أنت مسجل الدخول في وضع عدم الاتصال. يرجى الاتصال بالإنترنت للمتابعة.
          </p>
          <div className="pt-2">
            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => navigate("/profile")}
            >
              العودة إلى حسابي
            </Button>
          </div>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <div className="space-y-6">
        <div className="text-center space-y-1">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {step === "done"
              ? outcome === "merged"
                ? postMergeLogoutError
                  ? "تم دمج الحساب"
                  : "تم دمج حسابك بنجاح"
                : postUpgradeRefetchError
                ? "تم استلام الحساب"
                : "تم استلام حسابك بنجاح"
              : "استلام وتأكيد الحساب"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {step === "phone" &&
              (!isProvisional
                ? "أدخل رقم الطلب ورقم الهاتف المرتبط بطلبك لاستلام حسابك"
                : "أدخل رقم هاتفك لتأكيد حسابك وتعيين كلمة مرور دائمية")}
            {step === "otp" && "أدخل رمز التوثيق المرسل إلى واتساب لتأكيد ملكية الحساب"}
            {step === "password" && "أنشئ كلمة مرور جديدة لحماية حسابك والوصول إلى طلباتك"}
            {step === "done" &&
              (outcome === "merged"
                ? postMergeLogoutError
                  ? "تم دمج الحساب، لكن تعذر إنهاء الجلسة الحالية بأمان."
                  : "تم ربط طلباتك بحسابك المسجل. يرجى تسجيل الدخول للمتابعة."
                : postUpgradeRefetchError
                ? "تم استلام الحساب، لكن تعذر تحديث بيانات الجلسة."
                : "أصبح حسابك مؤكداً وجاهزاً للاستخدام.")}
          </p>
        </div>

        {/* Step 1: Identifier Entry (Order Number + Phone) */}
        {step === "phone" && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            {/* Order Number is required for Guest / Unauthenticated flow */}
            {!isProvisional && (
              <div className="space-y-2">
                <Label htmlFor="orderNumber">رقم الطلب</Label>
                <div className="relative">
                  <Input
                    id="orderNumber"
                    data-testid="order-number"
                    type="text"
                    dir="ltr"
                    placeholder="DUK-123456"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    className="pr-10 rounded-xl text-left"
                    required
                  />
                  <Package className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  رقم الطلب الذي تم إرساله إليك عند تأكيد الطلب.
                </p>
              </div>
            )}

            {/* Phone Number Field */}
            <div className="space-y-2">
              <Label htmlFor="phone">رقم الهاتف (واتساب)</Label>
              <div className="relative">
                <Input
                  id="phone"
                  data-testid="claim-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="07XXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pr-10 rounded-xl text-left"
                  required
                />
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                رقم الهاتف العراقي الذي تم استخدامه عند إنشاء الطلب.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-bold"
              disabled={loading || !phone.trim() || (!isProvisional && !orderNumber.trim())}
            >
              {loading ? "جارٍ التحقق..." : "إرسال رمز التوثيق"}
            </Button>
          </form>
        )}

        {/* Step 2: OTP Verification */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">أدخل رمز التوثيق المرسل إلى:</p>
              <p className="font-mono font-bold text-sm text-foreground" dir="ltr">
                {toIraqiLocalDisplay(phone)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="otpInput" className="sr-only">
                رمز التوثيق
              </Label>
              <OtpCodeInput
                value={otp}
                onChange={setOtp}
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-bold"
              disabled={loading || otp.trim().length < 6}
            >
              {loading ? "جارٍ التحقق من الرمز..." : "تأكيد الرمز والمتابعة"}
            </Button>

            <div className="flex items-center justify-between pt-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                }}
                disabled={loading}
                className="text-muted-foreground hover:text-foreground font-medium"
              >
                تعديل الرقم
              </button>
              <button
                type="button"
                data-testid="resend-claim-otp"
                onClick={handleResendOtp}
                disabled={resendTimer > 0 || loading}
                className="text-primary font-bold hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                {resendTimer > 0 ? `إعادة الإرسال بعد ${resendTimer} ثانية` : "إعادة إرسال الرمز"}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Set Password */}
        {step === "password" && (
          <form onSubmit={handleCompleteClaim} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  data-testid="new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  dir="ltr"
                  placeholder="******"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10 pl-10 rounded-xl text-left"
                  required
                />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                يجب أن تتكون من 6 خانات على الأقل.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  data-testid="confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  dir="ltr"
                  placeholder="******"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-10 rounded-xl text-left"
                  required
                />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-bold"
              disabled={loading || !newPassword || !confirmPassword}
            >
              {loading ? "جارٍ الحفظ وتأكيد الحساب..." : "حفظ الحساب وتأكيده"}
            </Button>
          </form>
        )}

        {/* Step 4: Done / Result State */}
        {step === "done" && (
          <div className="space-y-4 text-center py-2">
            {outcome === "merged" ? (
              postMergeLogoutError ? (
                <div className="space-y-4">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                    <AlertCircle className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-foreground font-bold">
                      تم دمج الحساب، لكن تعذر إنهاء الجلسة الحالية بأمان.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      يرجى الضغط أدناه لإعادة محاولة إنهاء الجلسة قبل تسجيل الدخول.
                    </p>
                  </div>
                  <Button
                    onClick={handleRetryLogout}
                    disabled={finalizingAction}
                    className="w-full h-11 rounded-xl font-bold gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${finalizingAction ? "animate-spin" : ""}`} />
                    <span>{finalizingAction ? "جاري إنهاء الجلسة..." : "إعادة محاولة إنهاء الجلسة"}</span>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    تم ربط طلباتك السابقة بحسابك المسجل بنجاح. يمكنك الآن تسجيل الدخول بحسابك الدائم.
                  </p>
                  <Button
                    className="w-full h-11 rounded-xl font-bold gap-2"
                    onClick={() => navigate("/auth", { replace: true })}
                  >
                    <LogIn className="h-4 w-4" />
                    <span>تسجيل الدخول إلى حسابك</span>
                  </Button>
                </div>
              )
            ) : postUpgradeRefetchError ? (
              <div className="space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                  <AlertCircle className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-foreground font-bold">
                    تم استلام الحساب، لكن تعذر تحديث بيانات الجلسة.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    تم حفظ حسابك على الخادم، يرجى الضغط أدناه لتحديث الجلسة قبل الانتقال.
                  </p>
                </div>
                <Button
                  onClick={handleRetryRefetch}
                  disabled={finalizingAction}
                  className="w-full h-11 rounded-xl font-bold gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${finalizingAction ? "animate-spin" : ""}`} />
                  <span>{finalizingAction ? "جاري تحديث الجلسة..." : "إعادة تحديث الحساب"}</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  تم استلام حسابك وتعيين كلمة المرور بنجاح. حسابك جاهز الآن للاستخدام وإدارة طلباتك.
                </p>
                <div className="pt-2 space-y-2">
                  <Button
                    className="w-full h-11 rounded-xl font-bold"
                    onClick={() => navigate("/profile", { replace: true })}
                  >
                    الانتقال إلى حسابي
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Support Link */}
        {step !== "done" && (
          <div className="pt-4 border-t border-border text-center">
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              <ArrowRight size={13} />
              <span>العودة إلى تسجيل الدخول</span>
            </Link>
          </div>
        )}
      </div>
    </AuthPageShell>
  );
}
