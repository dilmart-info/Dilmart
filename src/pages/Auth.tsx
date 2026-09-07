import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
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
import AuthStorageErrorScreen from "@/components/auth/AuthStorageErrorScreen";
import OtpCodeInput from "@/components/auth/OtpCodeInput";
import { useOtpFlow, type OtpChannel, type OtpVerificationCompletion } from "@/components/auth/useOtpFlow";
import {
  isValidEmail,
  looksLikeEmail,
  toIraqiE164,
  maskIraqiPhoneForDisplay,
  maskIdentifierForLogs,
} from "@/lib/auth/identifier";
import {
  emailOtpEnabled,
  phoneOtpEnabled,
  phoneRegistrationEnabled,
} from "@/lib/auth/auth-feature-flags";
import { sanitizeCustomerDestination } from "@/lib/auth/safe-redirect";
import { apiClient } from "@/lib/api-client";
import type { PasswordCredentials, SignInResult } from "@/lib/auth/auth-actions";
import { Eye, EyeOff, Lock, Mail, Phone, User, ShieldCheck, KeyRound, RefreshCw, AlertCircle } from "lucide-react";

type Mode = "login" | "register";
type Method = "otp" | "password";

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    appSession,
    authStatus,
    retryStorageBootstrap,
    signInWithPassword,
    signUpWithPassword,
    requestEmailOtp,
    verifyEmailOtp,
    requestPhoneOtp,
    verifyPhoneOtp,
  } = useAuth();

  const rawFrom = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  const from = rawFrom
    ? `${rawFrom.pathname ?? "/profile"}${rawFrom.search ?? ""}${rawFrom.hash ?? ""}`
    : "/profile";

  const [mode, setMode] = useState<Mode>("login");
  const registering = mode === "register";

  // Unified phone continuation is active when phone registration is enabled alongside phone OTP
  const unifiedPhoneActive = phoneOtpEnabled && phoneRegistrationEnabled;

  // Phone channel is allowed if phone OTP is on, but registration is gated
  const phoneChannelAllowed = registering
    ? phoneOtpEnabled && phoneRegistrationEnabled
    : phoneOtpEnabled;

  const availableChannels = useMemo<OtpChannel[]>(() => {
    const channels: OtpChannel[] = [];
    if (phoneChannelAllowed) channels.push("phone");
    if (emailOtpEnabled) channels.push("email");
    return channels;
  }, [phoneChannelAllowed]);

  const otpAvailable = availableChannels.length > 0;
  const [method, setMethod] = useState<Method>(otpAvailable ? "otp" : "password");

  // Synchronously compute the effective method
  const effectiveMethod: Method = otpAvailable && method === "otp" ? "otp" : "password";

  // Document Title
  useEffect(() => {
    if (unifiedPhoneActive) {
      document.title = "تسجيل الدخول أو إنشاء حساب | DILMART";
    } else {
      document.title = registering ? "إنشاء حساب | DILMART" : "تسجيل الدخول | DILMART";
    }
  }, [registering, unifiedPhoneActive]);

  // Form State
  const [passwordIdentifier, setPasswordIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [noAccountHint, setNoAccountHint] = useState(false);

  const [fullName, setFullName] = useState("");
  const [onboardingSession, setOnboardingSession] = useState<SignInResult | null>(null);
  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  // OTP flow configuration
  const requestCode = useCallback(
    async (identifier: string, channel: OtpChannel) => {
      // In unified phone mode, createUser is true for phone so both existing and new accounts continue.
      // For email or when phone registration is disabled, createUser follows registering state.
      const shouldCreateUser = (channel === "phone" && unifiedPhoneActive) ? true : registering;
      const options = {
        createUser: shouldCreateUser,
        metadata:
          registering && !unifiedPhoneActive && fullName.trim()
            ? { full_name: fullName.trim() }
            : undefined,
      };

      if (channel === "email") {
        if (!isValidEmail(identifier)) throw new Error("البريد الإلكتروني غير صالح.");
        await requestEmailOtp(identifier.trim(), options);
      } else {
        await requestPhoneOtp(toIraqiE164(identifier), options);
      }
    },
    [fullName, registering, requestEmailOtp, requestPhoneOtp, unifiedPhoneActive]
  );

  const verifyCode = useCallback(
    async (identifier: string, channel: OtpChannel, code: string): Promise<SignInResult> => {
      return channel === "email"
        ? verifyEmailOtp(identifier.trim(), code)
        : verifyPhoneOtp(toIraqiE164(identifier), code);
    },
    [verifyEmailOtp, verifyPhoneOtp]
  );

  const onVerified = useCallback(
    async (completion: OtpVerificationCompletion) => {
      const profileFullName = completion.authContext.profile?.full_name?.trim();

      // If user profile is missing or full_name is blank, transition to lightweight onboarding
      if (!profileFullName) {
        setOnboardingSession(completion.signInResult);
        setOnboardingName("");
        return;
      }

      toast.success(registering ? "تم إنشاء حسابك بنجاح" : "تم تسجيل الدخول بنجاح");
      navigate(sanitizeCustomerDestination(from), { replace: true });
    },
    [from, navigate, registering]
  );

  const otp = useOtpFlow({
    requestCode,
    verifyCode,
    onVerified,
    allowedChannels: availableChannels,
  });

  // Handle OTP Identifier Submit
  const handleOtpIdentifierSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNoAccountHint(false);
    try {
      const sent = await otp.submitIdentifier();
      if (sent) {
        toast.success(
          otp.channel === "phone"
            ? "أرسلنا رمز التحقق إلى واتساب"
            : "أرسلنا رمز التحقق إلى بريدك الإلكتروني"
        );
      }
    } catch (error) {
      // Generic error message without exposing account existence
      const message =
        error instanceof Error
          ? error.message
          : "تعذر إرسال رمز التحقق. يرجى التأكد من صحة الرقم والمحاولة لاحقاً.";
      if (!unifiedPhoneActive && !registering) {
        setNoAccountHint(true);
      }
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

  // Handle Onboarding Name Submit
  const handleOnboardingSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = onboardingName.trim();
    if (!trimmed || onboardingBusy || !onboardingSession) return;

    setOnboardingBusy(true);
    setOnboardingError(null);
    try {
      // 1. Save customer profile name through backend API
      await apiClient.updateCustomerProfile({ full_name: trimmed });

      // 2. Fetch canonical auth context exactly once to verify
      queryClient.removeQueries({ queryKey: ["auth-context"] });
      let updatedContext: AuthContextResponse;
      try {
        updatedContext = await queryClient.fetchQuery({
          queryKey: ["auth-context", onboardingSession.session.user.id],
          queryFn: () => apiClient.getAuthContext(onboardingSession.session.access_token),
          staleTime: 0,
        });
        await queryClient.invalidateQueries({ queryKey: ["auth-context"] });
      } catch {
        setOnboardingError("تم حفظ الاسم بنجاح، لكن تعذر تحديث الجلسة. يرجى الضغط على زر المتابعة للمحاولة مجدداً.");
        return;
      }

      // 3. Verify returned profile contains non-blank name
      if (!updatedContext.profile?.full_name?.trim()) {
        setOnboardingError("تعذر تأكيد حفظ البيانات الشخصية، يرجى إعادة المحاولة.");
        return;
      }

      toast.success("تم إعداد حسابك بنجاح");
      navigate(sanitizeCustomerDestination(from), { replace: true });
    } catch (error: any) {
      const msg = error?.message || "حدث خطأ أثناء حفظ الاسم";
      setOnboardingError(msg);
      toast.error(msg);
    } finally {
      setOnboardingBusy(false);
    }
  };

  // Handle Password Submit (Login / Register)
  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordBusy) return;

    if (registering) {
      if (!confirmPassword) {
        toast.error("يرجى تأكيد كلمة المرور");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("كلمتا المرور غير متطابقتين");
        return;
      }
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
      navigate(sanitizeCustomerDestination(from), { replace: true });
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

  // 1. Storage Error State -> canonical error recovery screen, never render login form
  if (authStatus === "storage_error") {
    return <AuthStorageErrorScreen onRetry={retryStorageBootstrap || (() => {})} />;
  }

  // 2. Bootstrapping / Context Loading State -> render skeleton, never render login form
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

  // 3. Authenticated Ready or Authenticated Offline with existing session -> Synchronously redirect
  if ((authStatus === "authenticated_ready" || authStatus === "authenticated_offline") && appSession) {
    return <Navigate to={sanitizeCustomerDestination(from)} replace />;
  }

  // 4. Lightweight Customer Onboarding Screen (After OTP verification when full_name is missing)
  if (onboardingSession) {
    return (
      <AuthPageShell>
        <div className="space-y-6" data-testid="onboarding-screen">
          <div className="text-center space-y-1">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <User className="h-6 w-6" />
            </div>
            <h1 className="font-display text-2xl font-black tracking-tight text-foreground">
              إكمال بيانات الحساب
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              يرجى كتابة اسمك لتخصيص حسابك في ديلمارت واستكمال الطلبات
            </p>
          </div>

          <form onSubmit={handleOnboardingSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="onboardingName">الاسم الكامل</Label>
              <div className="relative">
                <Input
                  id="onboardingName"
                  data-testid="onboarding-full-name"
                  type="text"
                  autoComplete="name"
                  placeholder="الاسم الكامل"
                  value={onboardingName}
                  onChange={(e) => setOnboardingName(e.target.value)}
                  className="pr-10 rounded-xl"
                  required
                  autoFocus
                />
                <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {onboardingError && (
              <p data-testid="onboarding-error" className="text-xs text-destructive text-center">
                {onboardingError}
              </p>
            )}

            <Button
              type="submit"
              data-testid="onboarding-submit"
              className="w-full h-11 rounded-xl font-bold"
              disabled={onboardingBusy || !onboardingName.trim()}
            >
              {onboardingBusy ? "جارٍ الحفظ..." : "إكمال ومتابعة"}
            </Button>
          </form>
        </div>
      </AuthPageShell>
    );
  }

  // 5. Auth Context Loading Error Recovery (Session is valid, but context loading failed)
  if (otp.contextError) {
    return (
      <AuthPageShell>
        <div className="space-y-6 text-center" data-testid="context-error-screen">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-foreground">
              تم التحقق من رقمك بنجاح
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              تعذر تحميل بيانات حسابك في الوقت الحالي. يرجى الضغط أدناه لإعادة المحاولة دون الحاجة لطلب رمز جديد.
            </p>
          </div>

          <div className="pt-2 space-y-3">
            <Button
              type="button"
              data-testid="retry-context-fetch"
              onClick={otp.retryContextFetch}
              disabled={otp.pending}
              className="w-full h-11 rounded-xl font-bold gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${otp.pending ? "animate-spin" : ""}`} />
              <span>{otp.pending ? "جارٍ المحاولة..." : "إعادة المحاولة"}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="change-number-after-error"
              onClick={otp.changeIdentifier}
              className="w-full h-11 rounded-xl font-medium text-xs"
            >
              استخدام رقم آخر
            </Button>
          </div>
        </div>
      </AuthPageShell>
    );
  }

  // 6. Persistent Unconfirmed Email State
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
            {unifiedPhoneActive && effectiveMethod === "otp"
              ? "أهلاً بك في ديلمارت"
              : registering
              ? "إنشاء حساب جديد"
              : "تسجيل الدخول"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {unifiedPhoneActive && effectiveMethod === "otp"
              ? "أدخل رقم هاتفك للمتابعة عبر واتساب"
              : registering
              ? "انضم إلى ديلمارت واستمتع بتجربة تسوق متكاملة"
              : "مرحباً بك مجدداً في ديلمارت"}
          </p>
        </div>

        {/* Mode Switcher (Login vs Register) only when unified phone mode is NOT active */}
        {!unifiedPhoneActive && (
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
        )}

        {/* Method Selector (OTP vs Password) when both are available and not in unified phone mode */}
        {otpAvailable && !unifiedPhoneActive ? (
          <div className="flex rounded-xl bg-muted/40 p-1 border border-border">
            <button
              type="button"
              data-testid="method-otp"
              onClick={() => {
                setMethod("otp");
                setNoAccountHint(false);
              }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
                effectiveMethod === "otp"
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
                effectiveMethod === "password"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              كلمة المرور
            </button>
          </div>
        ) : null}

        {/* ── Method: OTP Flow ────────────────────────────────────────────── */}
        {effectiveMethod === "otp" && otpAvailable && (
          <div className="space-y-4">
            {otp.step === "identifier" ? (
              <form
                data-testid="otp-identifier-form"
                onSubmit={handleOtpIdentifierSubmit}
                className="space-y-4"
              >
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

                {/* Full name when registering via OTP and not in unified phone mode */}
                {registering && !unifiedPhoneActive ? (
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
                  data-testid="submit-otp-identifier"
                  className="w-full h-11 rounded-xl font-bold"
                  disabled={otp.pending || !otp.identifier.trim()}
                >
                  {otp.pending
                    ? "جارٍ إرسال الرمز..."
                    : otp.channel === "phone"
                    ? "المتابعة عبر واتساب"
                    : "إرسال رمز التحقق"}
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
                  <p className="text-xs text-muted-foreground">
                    {otp.channel === "phone"
                      ? "أدخل رمز التحقق المرسل عبر واتساب إلى:"
                      : "أدخل رمز التحقق المرسل إلى:"}
                  </p>
                  <p className="font-mono font-bold text-sm text-foreground" dir="ltr" data-testid="masked-identifier">
                    {otp.channel === "phone"
                      ? maskIraqiPhoneForDisplay(otp.identifier)
                      : maskIdentifierForLogs(otp.identifier)}
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
                  data-testid="submit-otp-code"
                  className="w-full h-11 rounded-xl font-bold"
                  disabled={otp.pending || otp.code.length < 6}
                >
                  {otp.pending ? "جارٍ التحقق..." : "تأكيد الرمز والدخول"}
                </Button>

                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    type="button"
                    data-testid="change-identifier"
                    onClick={otp.changeIdentifier}
                    disabled={otp.pending}
                    className="text-muted-foreground hover:text-foreground font-medium"
                  >
                    تغيير الرقم
                  </button>
                  <button
                    type="button"
                    data-testid="resend"
                    onClick={async () => {
                      try {
                        const sent = await otp.resend();
                        if (sent) {
                          toast.success(
                            otp.channel === "phone"
                              ? "أعدنا إرسال رمز التحقق إلى واتساب"
                              : "أعدنا إرسال رمز التحقق إلى بريدك الإلكتروني"
                          );
                        }
                      } catch (error) {
                        toast.error("تعذر إعادة إرسال الرمز");
                      }
                    }}
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
        {effectiveMethod === "password" && (
          <form
            data-testid="password-form"
            onSubmit={handlePasswordSubmit}
            className="space-y-4"
          >
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
                    required
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
        {otpAvailable && (
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
              {effectiveMethod === "otp" ? "الدخول بكلمة المرور" : "الدخول عبر واتساب"}
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
