import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  WEAK_PASSWORD_SIGN_IN_WARNING_AR,
  type PasswordSecurityWarning,
} from "@/lib/auth/password-errors";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AuthPageShell from "@/components/auth/AuthPageShell";
import OtpCodeInput from "@/components/auth/OtpCodeInput";
import { useOtpFlow, type OtpChannel } from "@/components/auth/useOtpFlow";
import { isValidEmail, looksLikeEmail, toIraqiE164 } from "@/lib/auth/identifier";
import {
  emailOtpEnabled,
  phoneOtpEnabled,
  phoneRegistrationEnabled,
} from "@/lib/auth/auth-feature-flags";
import type { PasswordCredentials, SignInResult } from "@/lib/auth/auth-actions";
import { Eye, EyeOff, Lock, Mail, Phone, User, ShieldCheck, KeyRound } from "lucide-react";

type Mode = "login" | "register";
type Method = "otp" | "password";

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    user,
    authStatus,
    signInWithPassword,
    signUpWithPassword,
    requestEmailOtp,
    verifyEmailOtp,
    requestPhoneOtp,
    verifyPhoneOtp,
  } = useAuth();

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/profile";

  const [mode, setMode] = useState<Mode>("login");
  const registering = mode === "register";

  // Phone registration is gated separately from phone login
  const phoneChannelAllowed = registering ? phoneOtpEnabled && phoneRegistrationEnabled : phoneOtpEnabled;

  const availableChannels = useMemo<OtpChannel[]>(() => {
    const channels: OtpChannel[] = [];
    if (phoneChannelAllowed) channels.push("phone");
    if (emailOtpEnabled) channels.push("email");
    return channels;
  }, [phoneChannelAllowed]);

  const otpAvailable = availableChannels.length > 0;
  const [method, setMethod] = useState<Method>(otpAvailable ? "otp" : "password");

  // Document Title
  useEffect(() => {
    document.title = registering ? "إنشاء حساب | DILMART" : "تسجيل الدخول | DILMART";
  }, [registering]);

  // Form State
  const [fullName, setFullName] = useState("");
  const [passwordIdentifier, setPasswordIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [noAccountHint, setNoAccountHint] = useState(false);

  // OTP flow configuration
  const requestCode = useCallback(
    async (identifier: string, channel: OtpChannel) => {
      const options = {
        createUser: registering,
        metadata: registering ? { full_name: fullName.trim() } : undefined,
      };
      if (channel === "email") {
        if (!isValidEmail(identifier)) throw new Error("البريد الإلكتروني غير صالح.");
        await requestEmailOtp(identifier.trim(), options);
      } else {
        await requestPhoneOtp(toIraqiE164(identifier), options);
      }
    },
    [fullName, registering, requestEmailOtp, requestPhoneOtp]
  );

  const verifyCode = useCallback(
    async (identifier: string, channel: OtpChannel, code: string): Promise<SignInResult> => {
      return channel === "email"
        ? verifyEmailOtp(identifier.trim(), code)
        : verifyPhoneOtp(toIraqiE164(identifier), code);
    },
    [verifyEmailOtp, verifyPhoneOtp]
  );

  const onVerified = useCallback(async () => {
    toast.success(registering ? "تم إنشاء حسابك بنجاح" : "تم تسجيل الدخول بنجاح");
    navigate(from, { replace: true });
  }, [from, navigate, registering]);

  const otp = useOtpFlow({
    requestCode,
    verifyCode,
    onVerified,
    allowedChannels: availableChannels,
  });

  // Redirect if already authenticated
  useEffect(() => {
    if (authStatus === "authenticated_ready" && user) {
      navigate(from, { replace: true });
    }
  }, [authStatus, from, navigate, user]);

  // Handle OTP Identifier Submit
  const handleOtpIdentifierSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNoAccountHint(false);
    try {
      await otp.submitIdentifier();
      toast.success(
        otp.channel === "phone"
          ? "أرسلنا رمز التحقق إلى واتساب"
          : "أرسلنا رمز التحقق إلى بريدك الإلكتروني"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إرسال رمز التحقق";
      if (!registering) setNoAccountHint(true);
      toast.error(message);
    }
  };

  // Handle OTP Code Submit
  const handleOtpCodeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await otp.submitCode();
    } catch (error) {
      const message = error instanceof Error ? error.message : "رمز التحقق غير صحيح";
      toast.error(message);
    }
  };

  // Handle Password Submit (Login / Register)
  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordBusy) return;

    if (registering && confirmPassword && password !== confirmPassword) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }

    setPasswordBusy(true);
    let passwordSecurityWarning: PasswordSecurityWarning | null = null;
    try {
      const isEmail = looksLikeEmail(passwordIdentifier);
      const credentials: PasswordCredentials = isEmail
        ? { email: passwordIdentifier.trim(), password }
        : { phone: toIraqiE164(passwordIdentifier), password };

      if (registering) {
        if (!isEmail) throw new Error("إنشاء حساب بكلمة مرور متاح عبر البريد الإلكتروني فقط.");
        const result = await signUpWithPassword(credentials as never);
        if (!result.session) {
          setUnconfirmedEmail(passwordIdentifier.trim());
          return;
        }
      } else {
        const result = await signInWithPassword(credentials as never);
        passwordSecurityWarning = result.passwordSecurityWarning ?? null;
      }

      queryClient?.removeQueries?.({ queryKey: ["auth-context"] });
      await queryClient?.invalidateQueries?.({ queryKey: ["auth-context"] });
      toast.success(registering ? "تم إنشاء حسابك بنجاح" : "تم تسجيل الدخول بنجاح");
      if (passwordSecurityWarning) toast.warning(WEAK_PASSWORD_SIGN_IN_WARNING_AR);
      navigate(from, { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "حدث خطأ أثناء العملية";
      toast.error(message);
    } finally {
      setPasswordBusy(false);
    }
  };

  // Switch between Login and Register tabs
  const handleTabChange = (nextMode: string) => {
    const m = nextMode as Mode;
    setMode(m);
    setNoAccountHint(false);
    setUnconfirmedEmail(null);
    otp.changeIdentifier();
  };

  // Render Loading State during initial bootstrap to prevent form flashing
  if (authStatus === "bootstrapping" || authStatus === "authenticated_loading_context") {
    return (
      <AuthPageShell>
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm font-medium">جاري التحقق من الجلسة...</p>
        </div>
      </AuthPageShell>
    );
  }

  // Render Persistent Unconfirmed Email State
  if (unconfirmedEmail) {
    return (
      <AuthPageShell>
        <div className="text-center space-y-4 py-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Mail className="h-8 w-8" />
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground">تم إنشاء الحساب بنجاح</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            أرسلنا رابط تأكيد الحساب إلى البريد الإلكتروني:
            <br />
            <span className="font-bold text-foreground font-mono" dir="ltr">
              {unconfirmedEmail}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            يرجى فتح بريدك الإلكتروني والضغط على الرابط لتفعيل حسابك، ثم تسجيل الدخول.
          </p>
          <div className="pt-4 space-y-2">
            <Button
              className="w-full rounded-xl"
              onClick={() => {
                setUnconfirmedEmail(null);
                setMode("login");
                setMethod("password");
              }}
            >
              الانتقال إلى تسجيل الدخول
            </Button>
          </div>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <div className="space-y-6">
        {/* Header Title */}
        <div className="text-center space-y-1">
          <h1 className="font-display text-2xl font-black tracking-tight text-foreground md:text-3xl">
            {registering ? "إنشاء حساب جديد" : "تسجيل الدخول"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {registering
              ? "انضم إلى ديلمارت واستمتع بتجربة تسوق متكاملة"
              : "مرحباً بك مجدداً في ديلمارت"}
          </p>
        </div>

        {/* Mode Switcher (Login vs Register) */}
        <Tabs value={mode} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/60 p-1">
            <TabsTrigger
              value="login"
              data-testid="tab-login"
              className="rounded-lg font-bold"
            >
              تسجيل الدخول
            </TabsTrigger>
            <TabsTrigger
              value="register"
              data-testid="tab-register"
              className="rounded-lg font-bold"
            >
              إنشاء حساب
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Method Selector (OTP vs Password) when OTP is available */}
        {otpAvailable ? (
          <div className="flex rounded-xl bg-muted/40 p-1 border border-border">
            <button
              type="button"
              data-testid="method-otp"
              onClick={() => {
                setMethod("otp");
                setNoAccountHint(false);
              }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
                method === "otp"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              رمز التحقق السريع (OTP)
            </button>
            <button
              type="button"
              data-testid="method-password"
              onClick={() => {
                setMethod("password");
                setNoAccountHint(false);
              }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
                method === "password"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              كلمة المرور
            </button>
          </div>
        ) : null}

        {/* ── Method: OTP Flow ────────────────────────────────────────────── */}
        {method === "otp" && otpAvailable && (
          <div className="space-y-4">
            {otp.step === "identifier" ? (
              <form
                data-testid="otp-identifier-form"
                onSubmit={handleOtpIdentifierSubmit}
                className="space-y-4"
              >
                {/* Full name when registering */}
                {registering ? (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">الاسم الكامل</Label>
                    <div className="relative">
                      <Input
                        id="fullName"
                        data-testid="full-name"
                        type="text"
                        autoComplete="name"
                        placeholder="الاسم الثلاثي"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="pr-10 rounded-xl"
                        required
                      />
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                ) : null}

                {/* Channel Selector if both phone and email allowed */}
                {availableChannels.length > 1 ? (
                  <div className="space-y-2">
                    <Label>طريقة استلام الرمز</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        data-testid="channel-phone"
                        variant={otp.channel === "phone" ? "default" : "outline"}
                        size="sm"
                        onClick={() => otp.setChannel("phone")}
                        className="rounded-xl gap-1.5 text-xs font-bold"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        <span>واتساب</span>
                      </Button>
                      <Button
                        type="button"
                        data-testid="channel-email"
                        variant={otp.channel === "email" ? "default" : "outline"}
                        size="sm"
                        onClick={() => otp.setChannel("email")}
                        className="rounded-xl gap-1.5 text-xs font-bold"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        <span>البريد الإلكتروني</span>
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Identifier Input (Phone or Email) */}
                <div className="space-y-2">
                  <Label htmlFor="otpIdentifier">
                    {otp.channel === "phone" ? "رقم الهاتف (واتساب)" : "البريد الإلكتروني"}
                  </Label>
                  <div className="relative">
                    <Input
                      id="otpIdentifier"
                      data-testid="identifier"
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
                  {otp.pending
                    ? "جارٍ إرسال الرمز..."
                    : registering
                    ? "متابعة وإنشاء الحساب"
                    : "إرسال رمز الدخول"}
                </Button>

                {noAccountHint ? (
                  <div
                    data-testid="no-account-hint"
                    className="rounded-xl border border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground space-y-1"
                  >
                    <p>إذا لم يكن لديك حساب بعد، يمكنك إنشاء حساب بسهولة.</p>
                    <button
                      type="button"
                      onClick={() => handleTabChange("register")}
                      className="text-primary font-bold hover:underline"
                    >
                      إنشاء حساب الآن
                    </button>
                  </div>
                ) : null}
              </form>
            ) : (
              /* Step: Code Entry */
              <form
                data-testid="otp-code-form"
                onSubmit={handleOtpCodeSubmit}
                className="space-y-4"
              >
                <div className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground">أدخل رمز التحقق المرسل إلى:</p>
                  <p className="font-mono font-bold text-sm text-foreground" dir="ltr">
                    {otp.identifier}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="otpCode" className="sr-only">
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
                  {otp.pending ? "جارٍ التحقق..." : "تأكيد الدخول"}
                </Button>

                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    type="button"
                    data-testid="change-identifier"
                    onClick={otp.changeIdentifier}
                    disabled={otp.pending}
                    className="text-muted-foreground hover:text-foreground font-medium"
                  >
                    تغيير الرقم / البريد
                  </button>
                  <button
                    type="button"
                    data-testid="resend"
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
        )}

        {/* ── Method: Password Flow ───────────────────────────────────────── */}
        {method === "password" && (
          <form
            data-testid="password-form"
            onSubmit={handlePasswordSubmit}
            className="space-y-4"
          >
            {registering ? (
              <div className="space-y-2">
                <Label htmlFor="regFullName">الاسم الكامل</Label>
                <div className="relative">
                  <Input
                    id="regFullName"
                    type="text"
                    autoComplete="name"
                    placeholder="الاسم الثلاثي"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pr-10 rounded-xl"
                  />
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="password-identifier">
                {registering ? "البريد الإلكتروني" : "البريد الإلكتروني أو رقم الهاتف"}
              </Label>
              <div className="relative">
                <Input
                  id="password-identifier"
                  data-testid="password-identifier"
                  type={registering ? "email" : "text"}
                  inputMode={registering ? "email" : "text"}
                  autoComplete={registering ? "email" : "username"}
                  dir="ltr"
                  placeholder={registering ? "name@example.com" : "البريد أو 07XXXXXXXXX"}
                  value={passwordIdentifier}
                  onChange={(e) => setPasswordIdentifier(e.target.value)}
                  className="pr-10 rounded-xl text-left"
                  required
                />
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">كلمة المرور</Label>
                {!registering ? (
                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    نسيت كلمة المرور؟
                  </button>
                ) : null}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  data-testid="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={registering ? "new-password" : "current-password"}
                  dir="ltr"
                  placeholder="******"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            {registering ? (
              <div className="space-y-2">
                <Label htmlFor="confirmPasswordField">تأكيد كلمة المرور</Label>
                <div className="relative">
                  <Input
                    id="confirmPasswordField"
                    data-testid="confirm-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    dir="ltr"
                    placeholder="******"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-10 rounded-xl text-left"
                  />
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            ) : null}

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-bold"
              disabled={passwordBusy}
            >
              {passwordBusy
                ? registering
                  ? "جارٍ إنشاء الحساب..."
                  : "جارٍ تسجيل الدخول..."
                : registering
                ? "إنشاء الحساب"
                : "تسجيل الدخول"}
            </Button>
          </form>
        )}

        {/* ── Method switch link button ──────────────────────────────────── */}
        {availableChannels.length > 0 && (
          <div className="text-center text-xs">
            <button
              type="button"
              data-testid="toggle-method"
              className="font-semibold text-primary hover:underline"
              onClick={() => {
                setMethod((current) => (current === "otp" ? "password" : "otp"));
                setNoAccountHint(false);
              }}
            >
              {method === "otp" ? "الدخول بكلمة المرور" : "الدخول برمز التحقق"}
            </button>
          </div>
        )}

        {/* ── Footer Navigation Links ────────────────────────────────────── */}
        <div className="pt-4 border-t border-border flex flex-col items-center gap-2 text-center">
          {!registering ? (
            <button
              type="button"
              data-testid="forgot-password"
              onClick={() => navigate("/forgot-password")}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              <KeyRound size={13} />
              <span>نسيت كلمة المرور؟</span>
            </button>
          ) : null}

          <button
            type="button"
            data-testid="claim-account"
            onClick={() => navigate("/claim-account")}
            className="inline-flex items-center gap-1.5 text-xs text-primary font-bold hover:underline"
          >
            <ShieldCheck size={14} />
            <span>لدي طلب سابق وأريد استلام حسابي وتأكيده</span>
          </button>
        </div>
      </div>
    </AuthPageShell>
  );
}
