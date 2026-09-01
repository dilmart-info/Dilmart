import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthPageShell from "@/components/auth/AuthPageShell";
import AuthStorageErrorScreen from "@/components/auth/AuthStorageErrorScreen";
import OtpCodeInput from "@/components/auth/OtpCodeInput";
import { isValidIraqiMobile, toIraqiE164, toIraqiLocalDisplay } from "@/lib/auth/identifier";
import { phoneLinkingEnabled } from "@/lib/auth/auth-feature-flags";
import { apiClient } from "@/lib/api-client";
import { CheckCircle2, Phone, ShieldCheck, ArrowRight, Smartphone, WifiOff } from "lucide-react";

/**
 * Verified phone linking for a signed-in user.
 *
 * Authority Chain:
 *   1. checkPhoneAvailability({ phone })
 *   2. startPhoneChange(e164)
 *   3. verifyPhoneChange(normalized, code)
 *   4. getVerifiedAuthPhone() (ensures Supabase auth confirmed the phone)
 *   5. syncVerifiedPhoneIdentity() (backend mirrors to profiles)
 */
type Step = "phone" | "code" | "done";

export default function PhoneSecurity() {
  const navigate = useNavigate();
  const {
    user,
    authStatus,
    retryStorageBootstrap,
    startPhoneChange,
    verifyPhoneChange,
    getVerifiedAuthPhone,
  } = useAuth();

  useEffect(() => {
    document.title = "توثيق رقم الهاتف | DILMART";
  }, []);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [normalized, setNormalized] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkedMask, setLinkedMask] = useState("");

  const sendCode = useCallback(async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      toast.error("يرجى إدخال رقم الهاتف");
      return;
    }

    if (!isValidIraqiMobile(trimmed)) {
      toast.error("يرجى إدخال رقم هاتف عراقي صحيح");
      return;
    }

    const e164 = toIraqiE164(trimmed);
    if (!e164) {
      toast.error("رقم الهاتف غير صالح");
      return;
    }

    setBusy(true);
    try {
      // Step 1: Check availability before sending
      const availability = await apiClient.checkPhoneAvailability({ phone: e164 });
      if (availability.alreadyMine) {
        toast.info("هذا الرقم مرتبط بحسابك بالفعل");
        return;
      }
      if (!availability.available) {
        toast.error("رقم الهاتف مرتبط بحساب آخر");
        return;
      }

      // Step 2: Request Supabase to send phone verification code
      await startPhoneChange(e164);
      setNormalized(e164);
      setStep("code");
      toast.success("تم إرسال رمز التحقق عبر واتساب");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال رمز التحقق");
    } finally {
      setBusy(false);
    }
  }, [phone, startPhoneChange]);

  const confirmCode = useCallback(async () => {
    if (code.trim().length < 6) {
      toast.error("أدخل رمز التحقق المكوّن من 6 أرقام");
      return;
    }

    setBusy(true);
    try {
      // Step 3: Verify with Supabase
      await verifyPhoneChange(normalized, code.trim());

      // Step 4: Verify that auth phone matches
      const confirmed = await getVerifiedAuthPhone();
      if (!confirmed || toIraqiE164(confirmed) !== normalized) {
        toast.error("لم يتم تأكيد رقم الهاتف. حاول مرة أخرى");
        return;
      }

      // Step 5: Mirror verified identity to backend
      const result = await apiClient.syncVerifiedPhoneIdentity();
      setLinkedMask(result.phoneMasked);
      setStep("done");
      toast.success("تم ربط رقم الهاتف بحسابك بنجاح");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "رمز التحقق غير صحيح أو منتهي");
    } finally {
      setBusy(false);
    }
  }, [code, normalized, verifyPhoneChange, getVerifiedAuthPhone]);

  const restart = useCallback(() => {
    setStep("phone");
    setCode("");
    setNormalized("");
  }, []);

  // 1. Storage Error State
  if (authStatus === "storage_error") {
    return <AuthStorageErrorScreen onRetry={retryStorageBootstrap || (() => {})} />;
  }

  // 2. Loading state during auth bootstrap
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

  // 3. Authenticated Offline State -> Block network operations, show clear message
  if (authStatus === "authenticated_offline") {
    return (
      <AuthPageShell>
        <div className="text-center space-y-4 py-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
            <WifiOff className="h-7 w-7" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">
            يلزم اتصال بالإنترنت لتوثيق رقم الهاتف.
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            توثيق وربط رقم الهاتف يتطلب الاتصال بالخادم والتحقق عبر واتساب. يرجى الاتصال بالإنترنت للمتابعة.
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

  // 4. Feature Disabled State
  if (!phoneLinkingEnabled) {
    return (
      <AuthPageShell>
        <div className="text-center space-y-4 py-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Smartphone className="h-7 w-7" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">توثيق رقم الهاتف غير متاح حالياً.</h2>
          <p className="text-xs text-muted-foreground">
            هذه الخاصية غير مفعّلة في الوقت الحالي. يمكنك إدارة بقية تفاصيل حسابك من صفحة الملف الشخصي.
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

  // 5. Unauthenticated State
  if (!user && authStatus === "unauthenticated") {
    return (
      <AuthPageShell>
        <div className="text-center space-y-4 py-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">يجب تسجيل الدخول أولاً لتوثيق رقم هاتفك.</h2>
          <div className="pt-2">
            <Button className="w-full rounded-xl" onClick={() => navigate("/auth")}>
              تسجيل الدخول
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
            <Smartphone className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {step === "done" ? "تم توثيق رقم الهاتف" : "توثيق رقم الهاتف"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {step === "phone" && "اربط رقم هاتفك بحسابك بعد تأكيده برمز يصلك عبر واتساب."}
            {step === "code" && "أدخل رمز التحقق المرسل إلى رقم هاتفك عبر واتساب."}
            {step === "done" && "أصبح رقم هاتفك موثقاً ومرتبطاً بحسابك بنجاح."}
          </p>
        </div>

        {/* Step 1: Phone input */}
        {step === "phone" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendCode();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="securityPhone">رقم الهاتف (واتساب)</Label>
              <div className="relative">
                <Input
                  id="securityPhone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="07XXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pr-10 text-left rounded-xl"
                  required
                />
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-bold"
              disabled={busy || !phone.trim()}
            >
              {busy ? "جارٍ التحقق..." : "إرسال رمز التحقق"}
            </Button>

            <div className="text-center pt-2">
              <Link
                to="/profile"
                className="text-xs text-muted-foreground hover:text-foreground font-medium"
              >
                العودة إلى حسابي
              </Link>
            </div>
          </form>
        )}

        {/* Step 2: Code input */}
        {step === "code" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void confirmCode();
            }}
            className="space-y-4"
          >
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">أدخل رمز التحقق المرسل إلى:</p>
              <p className="font-mono font-bold text-sm text-foreground" dir="ltr">
                {toIraqiLocalDisplay(normalized)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="securityOtp" className="sr-only">
                رمز التحقق
              </Label>
              <OtpCodeInput value={code} onChange={setCode} disabled={busy} />
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-bold"
              disabled={busy || code.trim().length < 6}
            >
              {busy ? "جارٍ التوثيق..." : "تأكيد الرمز وتوثيق الرقم"}
            </Button>

            <div className="flex items-center justify-between pt-2 text-xs">
              <button
                type="button"
                onClick={restart}
                disabled={busy}
                className="text-muted-foreground hover:text-foreground font-medium"
              >
                تغيير الرقم
              </button>
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={busy}
                className="text-primary font-bold hover:underline"
              >
                إعادة إرسال الرمز
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Done */}
        {step === "done" && (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              تم توثيق رقم هاتفك ({linkedMask || toIraqiLocalDisplay(normalized)}) وربطه بحسابك بنجاح.
            </p>
            <div className="pt-2">
              <Button
                className="w-full h-11 rounded-xl font-bold"
                onClick={() => navigate("/profile")}
              >
                العودة إلى الملف الشخصي
              </Button>
            </div>
          </div>
        )}
      </div>
    </AuthPageShell>
  );
}
