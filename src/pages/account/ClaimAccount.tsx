import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ShieldCheck, Phone, Lock, CheckCircle2, ArrowRight, RefreshCw, Package, Eye, EyeOff, LogIn } from "lucide-react";
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
import OtpCodeInput from "@/components/auth/OtpCodeInput";

type Step = "phone" | "otp" | "password" | "done";
type Outcome = "upgraded" | "merged";

export default function ClaimAccount() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialOrderNumber = searchParams.get("orderNumber") || "";
  const initialPhone = searchParams.get("phone") || "";
  const { authStatus, profile, refetch, logoutCurrentDevice } = useAuth();

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

    if (newPassword.length < 6) {
      toast.error("كلمة المرور يجب أن لا تقل عن 6 خانات");
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
          // Account was merged into an existing permanent customer account.
          // Safely terminate the provisional session.
          try {
            await logoutCurrentDevice();
          } catch {
            // ignore logout error
          }
          setOutcome("merged");
          toast.success("تم دمج حسابك بنجاح. يرجى تسجيل الدخول");
        } else {
          // Account was upgraded in-place. Refresh authoritative auth context.
          try {
            await refetch();
          } catch {
            // ignore refetch error
          }
          setOutcome("upgraded");
          toast.success(res.message || "تم استلام حسابك وتعيين كلمة المرور بنجاح");
        }
        setStep("done");
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

  // Render Loading State while auth bootstraps
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
                ? "تم دمج حسابك بنجاح"
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
                ? "تم ربط طلباتك بحسابك المسجل. يرجى تسجيل الدخول للمتابعة."
                : "أصبح حسابك مؤكداً وجاهزاً للاستخدام.")}
          </p>
        </div>

        {/* Step 1: Identifier Entry (Order Number + Phone) */}
        {step === "phone" && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            {/* Always show Order Number for guest / unauthenticated users */}
            {!isProvisional || orderNumber ? (
              <div className="space-y-2">
                <Label htmlFor="orderNumber">
                  رقم الطلب {!isProvisional ? <span className="text-destructive">*</span> : null}
                </Label>
                <div className="relative">
                  <Input
                    id="orderNumber"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="DUK-XXXXXX"
                    dir="ltr"
                    className="pr-10 text-left rounded-xl"
                    required={!isProvisional}
                  />
                  <Package className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="claimPhone">
                رقم الهاتف (واتساب) <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="claimPhone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XXXXXXXXX"
                  dir="ltr"
                  className="pr-10 text-left rounded-xl"
                  required
                />
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-bold"
              disabled={loading || !phone.trim() || (!isProvisional && !orderNumber.trim())}
            >
              {loading ? "جارٍ إرسال الرمز..." : "إرسال رمز التوثيق"}
            </Button>

            <div className="text-center pt-2">
              <Link
                to="/auth"
                className="text-xs text-muted-foreground hover:text-foreground font-medium"
              >
                العودة إلى تسجيل الدخول
              </Link>
            </div>
          </form>
        )}

        {/* Step 2: OTP Verification */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">أدخل رمز التوثيق المرسل إلى الرقم:</p>
              <p className="font-mono font-bold text-sm text-foreground" dir="ltr">
                {phone}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="claimOtp" className="sr-only">
                رمز التوثيق
              </Label>
              <OtpCodeInput value={otp} onChange={setOtp} disabled={loading} />
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-bold"
              disabled={loading || otp.trim().length < 6}
            >
              {loading ? "جارٍ التحقق..." : "تأكيد الرمز والمتابعة"}
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
                تغيير الرقم
              </button>
              <button
                type="button"
                onClick={() => void handleRequestOtp()}
                disabled={resendTimer > 0 || loading}
                className="text-primary font-bold hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                {resendTimer > 0
                  ? `إعادة الإرسال بعد ${resendTimer} ثانية`
                  : "إعادة إرسال الرمز"}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Set Password */}
        {step === "password" && (
          <form onSubmit={handleCompleteClaim} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newClaimPassword">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input
                  id="newClaimPassword"
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmClaimPassword">تأكيد كلمة المرور</Label>
              <div className="relative">
                <Input
                  id="confirmClaimPassword"
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
              disabled={loading}
            >
              {loading ? "جارٍ حفظ الحساب..." : "حفظ الحساب وتأكيده"}
            </Button>
          </form>
        )}

        {/* Step 4: Done Step (Upgraded vs Merged) */}
        {step === "done" && (
          <div className="text-center space-y-4 py-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            {outcome === "merged" ? (
              <>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  تم ربط طلباتك السابقة بحسابك المسجل لدينا بنجاح. يرجى تسجيل الدخول باستخدام رقم هاتفك أو بريدك وكلمة المرور الجديدة للوصول إلى حسابك.
                </p>
                <div className="pt-4">
                  <Button
                    onClick={() => navigate("/auth", { replace: true })}
                    className="w-full h-11 rounded-xl font-bold gap-2"
                  >
                    <LogIn className="h-4 w-4" />
                    <span>تسجيل الدخول إلى حسابك</span>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  تم استلام حسابك وتأكيد هويتك بنجاح. أصبح حسابك الآن حساباً دائماً يمكنك من خلاله متابعة جميع طلباتك والاستفادة من خدمات المتجر.
                </p>
                <div className="pt-4">
                  <Button
                    onClick={() => navigate("/profile", { replace: true })}
                    className="w-full h-11 rounded-xl font-bold gap-2"
                  >
                    <span>الانتقال إلى حسابي</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AuthPageShell>
  );
}
