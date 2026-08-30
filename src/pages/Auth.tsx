import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import OtpCodeInput from "@/components/auth/OtpCodeInput";
import { useOtpFlow, type OtpChannel } from "@/components/auth/useOtpFlow";
import { isValidEmail, looksLikeEmail, toIraqiE164 } from "@/lib/auth/identifier";
import {
  emailOtpEnabled,
  phoneOtpEnabled,
  phoneRegistrationEnabled,
} from "@/lib/auth/auth-feature-flags";
import type { SignInResult } from "@/lib/auth/auth-actions";

type Mode = "login" | "register";
type Method = "otp" | "password";

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    signInWithPassword,
    signUpWithPassword,
    requestEmailOtp,
    verifyEmailOtp,
    requestPhoneOtp,
    verifyPhoneOtp,
  } = useAuth();

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";

  const otpAvailable = emailOtpEnabled || phoneOtpEnabled;
  const [mode, setMode] = useState<Mode>("login");
  // Password stays the default method until an OTP channel is actually switched on.
  const [method, setMethod] = useState<Method>(otpAvailable ? "otp" : "password");
  const [fullName, setFullName] = useState("");
  const [noAccountHint, setNoAccountHint] = useState(false);

  const registering = mode === "register";

  /** Phone registration is gated separately from phone login — see the identity audit. */
  const phoneChannelAllowed = registering ? phoneOtpEnabled && phoneRegistrationEnabled : phoneOtpEnabled;

  const availableChannels = useMemo<OtpChannel[]>(() => {
    const channels: OtpChannel[] = [];
    if (phoneChannelAllowed) channels.push("phone");
    if (emailOtpEnabled) channels.push("email");
    return channels;
  }, [phoneChannelAllowed]);

  const requestCode = useCallback(
    async (identifier: string, channel: OtpChannel) => {
      const options = {
        createUser: registering,
        metadata: registering ? { full_name: fullName } : undefined,
      };
      if (channel === "email") {
        if (!isValidEmail(identifier)) throw new Error("البريد الإلكتروني غير صالح.");
        await requestEmailOtp(identifier.trim(), options);
      } else {
        await requestPhoneOtp(toIraqiE164(identifier), options);
      }
    },
    [fullName, registering, requestEmailOtp, requestPhoneOtp],
  );

  const verifyCode = useCallback(
    async (identifier: string, channel: OtpChannel, code: string): Promise<SignInResult> => {
      return channel === "email"
        ? verifyEmailOtp(identifier.trim(), code)
        : verifyPhoneOtp(toIraqiE164(identifier), code);
    },
    [verifyEmailOtp, verifyPhoneOtp],
  );

  const onVerified = useCallback(async () => {
    toast.success(registering ? "تم إنشاء حسابك بنجاح" : "تم تسجيل الدخول بنجاح");
    navigate(from, { replace: true });
  }, [from, navigate, registering]);

  const otp = useOtpFlow({ requestCode, verifyCode, onVerified });

  // Keep the channel on something the current tab actually allows.
  const activeChannel: OtpChannel = availableChannels.includes(otp.channel)
    ? otp.channel
    : (availableChannels[0] ?? "email");

  const handleIdentifierSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNoAccountHint(false);
    try {
      await otp.submitIdentifier();
      toast.success(
        activeChannel === "phone"
          ? "أرسلنا رمز التحقق إلى واتساب"
          : "أرسلنا رمز التحقق إلى بريدك الإلكتروني",
      );
    } catch (error) {
      // Never claim a code was sent when the request failed. Supabase keeps its
      // anti-enumeration wording for a login against an unknown identifier, so the hint
      // below offers the register path without confirming whether the account exists.
      const message = error instanceof Error ? error.message : "تعذر إرسال رمز التحقق";
      if (!registering) setNoAccountHint(true);
      toast.error(message);
    }
  };

  const handleCodeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await otp.submitCode();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "رمز التحقق غير صحيح أو منتهي الصلاحية");
    }
  };

  const [passwordIdentifier, setPasswordIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordPending) return;
    setPasswordPending(true);
    let passwordSecurityWarning: PasswordSecurityWarning | null = null;
    try {
      const isEmail = looksLikeEmail(passwordIdentifier);
      const credentials = isEmail
        ? { email: passwordIdentifier.trim(), password }
        : { phone: toIraqiE164(passwordIdentifier), password };

      if (registering) {
        if (!isEmail) throw new Error("إنشاء حساب بكلمة مرور متاح عبر البريد الإلكتروني فقط.");
        const { session } = await signUpWithPassword(credentials as never);
        if (!session) {
          toast.success("تم إنشاء الحساب. تحقق من بريدك لتفعيل الحساب.");
          return;
        }
      } else {
        const result = await signInWithPassword(credentials as never);
        // Advisory only. The session is already established, so this must never gate the flow.
        passwordSecurityWarning = result.passwordSecurityWarning ?? null;
      }

      queryClient.removeQueries({ queryKey: ["auth-context"] });
      await queryClient.invalidateQueries({ queryKey: ["auth-context"] });
      toast.success(registering ? "تم إنشاء حسابك بنجاح" : "تم تسجيل الدخول بنجاح");
      if (passwordSecurityWarning) toast.warning(WEAK_PASSWORD_SIGN_IN_WARNING_AR);
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حدث خطأ أثناء العملية");
    } finally {
      setPasswordPending(false);
    }
  };

  const identifierLabel = activeChannel === "phone" ? "رقم الهاتف" : "البريد الإلكتروني";
  const identifierHint =
    activeChannel === "phone"
      ? "سنرسل رمز تحقق إلى رقمك عبر واتساب"
      : "سنرسل رمز تحقق إلى بريدك الإلكتروني";

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <Header />
      <main className="flex flex-1 items-center justify-center p-4 py-12">
        <Card className="w-full max-w-md border-2 border-primary/10 shadow-lg">
          <CardHeader className="pb-2 text-center">
            <CardTitle className="text-2xl font-bold">مرحباً بك</CardTitle>
            <CardDescription>سجّل دخولك أو أنشئ حساباً جديداً للمتابعة</CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs
              value={mode}
              onValueChange={(value) => {
                setMode(value as Mode);
                setNoAccountHint(false);
                otp.changeIdentifier();
              }}
            >
              <TabsList className="mb-6 grid w-full grid-cols-2">
                <TabsTrigger value="login" data-testid="tab-login">
                  تسجيل الدخول
                </TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">
                  إنشاء حساب
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {method === "otp" && availableChannels.length > 0 ? (
              otp.step === "identifier" ? (
                <form onSubmit={handleIdentifierSubmit} className="space-y-4" data-testid="otp-identifier-form">
                  {availableChannels.length > 1 && (
                    <div className="grid grid-cols-2 gap-2" role="group" aria-label="طريقة استلام الرمز">
                      {availableChannels.map((channel) => (
                        <Button
                          key={channel}
                          type="button"
                          variant={activeChannel === channel ? "default" : "outline"}
                          onClick={() => otp.setChannel(channel)}
                          data-testid={`channel-${channel}`}
                        >
                          {channel === "phone" ? "رقم الهاتف" : "البريد الإلكتروني"}
                        </Button>
                      ))}
                    </div>
                  )}

                  {registering && (
                    <div className="space-y-2">
                      <Label htmlFor="full-name">الاسم الكامل</Label>
                      <Input
                        id="full-name"
                        data-testid="full-name"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        required
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="identifier">{identifierLabel}</Label>
                    <Input
                      id="identifier"
                      data-testid="identifier"
                      dir="ltr"
                      inputMode={activeChannel === "phone" ? "tel" : "email"}
                      placeholder={activeChannel === "phone" ? "07XXXXXXXXX" : "name@example.com"}
                      value={otp.identifier}
                      onChange={(event) => otp.setIdentifier(event.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">{identifierHint}</p>
                  </div>

                  <Button type="submit" className="h-12 w-full text-lg font-bold" disabled={otp.pending}>
                    {otp.pending ? "جارٍ الإرسال..." : "إرسال رمز التحقق"}
                  </Button>

                  {noAccountHint && !registering && (
                    <p className="text-center text-xs text-muted-foreground" data-testid="no-account-hint">
                      لا يوجد حساب بهذه البيانات؟{" "}
                      <button
                        type="button"
                        className="font-semibold text-primary hover:underline"
                        onClick={() => setMode("register")}
                      >
                        أنشئ حساباً جديداً
                      </button>
                    </p>
                  )}
                </form>
              ) : (
                <form onSubmit={handleCodeSubmit} className="space-y-4" data-testid="otp-code-form">
                  <p className="text-center text-sm text-muted-foreground">{identifierHint}</p>
                  <OtpCodeInput value={otp.code} onChange={otp.setCode} disabled={otp.pending} />

                  <Button
                    type="submit"
                    className="h-12 w-full text-lg font-bold"
                    disabled={otp.pending || otp.code.length < 6}
                  >
                    {otp.pending ? "جارٍ التحقق..." : "تأكيد الرمز"}
                  </Button>

                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      data-testid="resend"
                      className="text-primary disabled:text-muted-foreground"
                      disabled={otp.resendIn > 0 || otp.pending}
                      onClick={async () => {
                        try {
                          const sent = await otp.resend();
                          if (sent) toast.success("أعدنا إرسال الرمز");
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "تعذر إعادة إرسال الرمز");
                        }
                      }}
                    >
                      {otp.resendIn > 0 ? `إعادة الإرسال بعد ${otp.resendIn} ثانية` : "إعادة إرسال الرمز"}
                    </button>
                    <button
                      type="button"
                      data-testid="change-identifier"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={otp.changeIdentifier}
                    >
                      تغيير {identifierLabel}
                    </button>
                  </div>
                </form>
              )
            ) : (
              <form onSubmit={handlePasswordSubmit} className="space-y-4" data-testid="password-form">
                <div className="space-y-2">
                  <Label htmlFor="password-identifier">
                    {registering ? "البريد الإلكتروني" : "البريد الإلكتروني أو رقم الهاتف"}
                  </Label>
                  <Input
                    id="password-identifier"
                    data-testid="password-identifier"
                    dir="ltr"
                    value={passwordIdentifier}
                    onChange={(event) => setPasswordIdentifier(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <Input
                    id="password"
                    data-testid="password"
                    type="password"
                    dir="ltr"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="h-12 w-full text-lg font-bold" disabled={passwordPending}>
                  {passwordPending ? "جارٍ التحقق..." : registering ? "إنشاء الحساب" : "تسجيل الدخول"}
                </Button>
              </form>
            )}

            <div className="mt-6 space-y-2 text-center text-xs text-muted-foreground">
              {availableChannels.length > 0 && (
                <button
                  type="button"
                  data-testid="toggle-method"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => setMethod((current) => (current === "otp" ? "password" : "otp"))}
                >
                  {method === "otp" ? "الدخول بكلمة المرور" : "الدخول برمز التحقق"}
                </button>
              )}

              {!registering && (
                <div>
                  <button
                    type="button"
                    data-testid="forgot-password"
                    className="hover:text-foreground hover:underline"
                    onClick={() => navigate("/forgot-password")}
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>
              )}

              <div>
                <button
                  type="button"
                  data-testid="claim-account"
                  className="hover:text-foreground hover:underline"
                  onClick={() => navigate("/claim-account")}
                >
                  لدي طلب سابق وأريد استلام حسابي
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
