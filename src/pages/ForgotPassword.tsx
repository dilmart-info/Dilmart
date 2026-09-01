import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthPageShell from "@/components/auth/AuthPageShell";
import OtpCodeInput from "@/components/auth/OtpCodeInput";
import { useOtpFlow, type OtpChannel } from "@/components/auth/useOtpFlow";
import { isValidEmail, toIraqiE164 } from "@/lib/auth/identifier";
import { emailOtpEnabled, phoneOtpEnabled } from "@/lib/auth/auth-feature-flags";
import type { SignInResult } from "@/lib/auth/auth-actions";
import { CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail, Phone, ArrowRight, ShoppingBag } from "lucide-react";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const {
    requestEmailPasswordRecovery,
    verifyEmailRecoveryOtp,
    requestPhoneOtp,
    verifyPhoneOtp,
    updatePasswordInSession,
  } = useAuth();

  useEffect(() => {
    document.title = "استعادة كلمة المرور | DILMART";
  }, []);

  const [verified, setVerified] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const availableChannels = useMemo<OtpChannel[]>(() => {
    const channels: OtpChannel[] = [];
    if (phoneOtpEnabled) channels.push("phone");
    if (emailOtpEnabled) channels.push("email");
    return channels;
  }, []);

  const requestCode = useCallback(
    async (identifier: string, channel: OtpChannel) => {
      if (channel === "email") {
        if (!isValidEmail(identifier)) throw new Error("البريد الإلكتروني غير صالح.");
        await requestEmailPasswordRecovery(identifier.trim());
      } else {
        // Never create an account from a password-reset screen
        await requestPhoneOtp(toIraqiE164(identifier), { createUser: false });
      }
    },
    [requestEmailPasswordRecovery, requestPhoneOtp]
  );

  const verifyCode = useCallback(
    async (identifier: string, channel: OtpChannel, code: string): Promise<SignInResult> => {
      return channel === "email"
        ? verifyEmailRecoveryOtp(identifier.trim(), code)
        : verifyPhoneOtp(toIraqiE164(identifier), code);
    },
    [verifyEmailRecoveryOtp, verifyPhoneOtp]
  );

  const otp = useOtpFlow({
    requestCode,
    verifyCode,
    onVerified: () => setVerified(true),
    allowedChannels: availableChannels,
  });

  const handleIdentifierSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await otp.submitIdentifier();
      toast.success(
        otp.channel === "phone"
          ? "أرسلنا رمز التحقق إلى واتساب"
          : "أرسلنا رمز التحقق إلى بريدك الإلكتروني"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال رمز التحقق");
    }
  };

  const handleCodeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await otp.submitCode();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "رمز التحقق غير صحيح");
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (newPassword.length < 6) {
      toast.error("كلمة المرور يجب أن لا تقل عن 6 خانات");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }

    setSaving(true);
    try {
      await updatePasswordInSession(newPassword);
      setDone(true);
      toast.success("تم تحديث كلمة المرور بنجاح");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث كلمة المرور");
    } finally {
      setSaving(false);
    }
  };

  // State 1: Password Update Complete (Authenticated state acknowledged)
  if (done) {
    return (
      <AuthPageShell>
        <div data-testid="reset-done" className="text-center space-y-4 py-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold text-foreground">
              تم تعيين كلمة المرور بنجاح
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              تم تحديث كلمة المرور لحسابك، ويمكنك الآن متابعة التسوق أو إدارة حسابك مباشرة.
            </p>
          </div>
          <div className="pt-4 space-y-2">
            <Button
              className="w-full h-11 rounded-xl font-bold gap-2"
              onClick={() => navigate("/profile")}
            >
              <span>الانتقال إلى حسابي</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl font-medium gap-2"
              onClick={() => navigate("/")}
            >
              <ShoppingBag className="h-4 w-4" />
              <span>متابعة التسوق</span>
            </Button>
          </div>
        </div>
      </AuthPageShell>
    );
  }

  // State 2: Set New Password after verification
  if (verified) {
    return (
      <AuthPageShell>
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <KeyRound className="h-6 w-6" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              تعيين كلمة مرور جديدة
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              تم تأكيد هويتك. أدخل كلمة المرور الجديدة لحسابك.
            </p>
          </div>

          <form
            data-testid="reset-password-form"
            onSubmit={handlePasswordSubmit}
            className="space-y-4"
          >
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
              disabled={saving}
            >
              {saving ? "جارٍ حفظ كلمة المرور..." : "حفظ كلمة المرور والدخول"}
            </Button>
          </form>
        </div>
      </AuthPageShell>
    );
  }

  // State 3: Enter Identifier or OTP Code
  return (
    <AuthPageShell>
      <div className="space-y-6">
        <div className="text-center space-y-1">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            استعادة كلمة المرور
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            أدخل بريدك الإلكتروني أو رقم هاتفك المسجل لاستلام رمز التحقق.
          </p>
        </div>

        {availableChannels.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              خدمة استعادة كلمة المرور غير متاحة حالياً.
            </p>
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/auth">العودة لتسجيل الدخول</Link>
            </Button>
          </div>
        ) : otp.step === "identifier" ? (
          <form
            data-testid="reset-identifier-form"
            onSubmit={handleIdentifierSubmit}
            className="space-y-4"
          >
            {availableChannels.length > 1 ? (
              <div className="space-y-2">
                <Label>طريقة الاستعادة</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    data-testid="reset-channel-phone"
                    variant={otp.channel === "phone" ? "default" : "outline"}
                    size="sm"
                    onClick={() => otp.setChannel("phone")}
                    className="rounded-xl gap-1.5 text-xs font-bold"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    <span>عبر واتساب</span>
                  </Button>
                  <Button
                    type="button"
                    data-testid="reset-channel-email"
                    variant={otp.channel === "email" ? "default" : "outline"}
                    size="sm"
                    onClick={() => otp.setChannel("email")}
                    className="rounded-xl gap-1.5 text-xs font-bold"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>عبر البريد</span>
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="forgotIdentifier">
                {otp.channel === "phone" ? "رقم الهاتف (واتساب)" : "البريد الإلكتروني"}
              </Label>
              <div className="relative">
                <Input
                  id="forgotIdentifier"
                  data-testid="reset-identifier"
                  type={otp.channel === "phone" ? "tel" : "email"}
                  inputMode={otp.channel === "phone" ? "tel" : "email"}
                  autoComplete={otp.channel === "phone" ? "tel" : "email"}
                  dir="ltr"
                  placeholder={otp.channel === "phone" ? "07XXXXXXXXX" : "name@example.com"}
                  value={otp.identifier}
                  onChange={(e) => otp.setIdentifier(e.target.value)}
                  className="pr-10 rounded-xl text-left"
                  required
                />
                {otp.channel === "phone" ? (
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                ) : (
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                )}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-bold"
              disabled={otp.pending || !otp.identifier.trim()}
            >
              {otp.pending ? "جارٍ إرسال الرمز..." : "إرسال رمز التحقق"}
            </Button>

            <div className="text-center pt-2">
              <Link
                to="/auth"
                className="text-xs text-muted-foreground hover:text-foreground font-medium"
              >
                تذكرت كلمة المرور؟ تسجيل الدخول
              </Link>
            </div>
          </form>
        ) : (
          <form
            data-testid="reset-code-form"
            onSubmit={handleCodeSubmit}
            className="space-y-4"
          >
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">أدخل رمز التحقق المرسل إلى:</p>
              <p className="font-mono font-bold text-sm text-foreground" dir="ltr">
                {otp.identifier}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="forgotOtpCode" className="sr-only">
                رمز التحقق
              </Label>
              <OtpCodeInput
                value={otp.code}
                onChange={otp.setCode}
                disabled={otp.pending}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-bold"
              disabled={otp.pending || otp.code.length < 6}
            >
              {otp.pending ? "جارٍ التحقق..." : "تأكيد الرمز والمتابعة"}
            </Button>

            <div className="flex items-center justify-between pt-2 text-xs">
              <button
                type="button"
                onClick={otp.changeIdentifier}
                disabled={otp.pending}
                className="text-muted-foreground hover:text-foreground font-medium"
              >
                تغيير الرقم / البريد
              </button>
              <button
                type="button"
                onClick={() => void otp.resend()}
                disabled={otp.resendIn > 0 || otp.pending}
                className="text-primary font-bold hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                {otp.resendIn > 0 ? `إعادة الإرسال بعد ${otp.resendIn} ثانية` : "إعادة إرسال الرمز"}
              </button>
            </div>
          </form>
        )}
      </div>
    </AuthPageShell>
  );
}
