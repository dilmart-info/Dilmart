import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import OtpCodeInput from "@/components/auth/OtpCodeInput";
import { useOtpFlow, type OtpChannel } from "@/components/auth/useOtpFlow";
import { isValidEmail, toIraqiE164 } from "@/lib/auth/identifier";
import { emailOtpEnabled, phoneOtpEnabled } from "@/lib/auth/auth-feature-flags";
import type { SignInResult } from "@/lib/auth/auth-actions";

/**
 * Password recovery, entirely on Supabase.
 *
 * Two different mechanisms sit behind one screen, and the distinction matters:
 *
 *  - **Email** uses a real Supabase *recovery token*: resetPasswordForEmail sends it, and
 *    verifyOtp with type "recovery" exchanges it for a session.
 *  - **Phone** has no recovery token. It is a **phone OTP authenticated password reset**:
 *    an ordinary sign-in OTP with shouldCreateUser=false, then updateUser inside the
 *    session that login produced. Calling it a "recovery token flow" would be wrong.
 *
 * Either way the password is only ever changed inside a verified session. The legacy
 * backend /auth/password-reset/* endpoints are deprecated and are deliberately not called
 * from here.
 */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const {
    requestEmailPasswordRecovery,
    verifyEmailRecoveryOtp,
    requestPhoneOtp,
    verifyPhoneOtp,
    updatePasswordInSession,
  } = useAuth();

  const [verified, setVerified] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const availableChannels: OtpChannel[] = [];
  if (phoneOtpEnabled) availableChannels.push("phone");
  if (emailOtpEnabled) availableChannels.push("email");

  const requestCode = useCallback(
    async (identifier: string, channel: OtpChannel) => {
      if (channel === "email") {
        if (!isValidEmail(identifier)) throw new Error("البريد الإلكتروني غير صالح.");
        await requestEmailPasswordRecovery(identifier.trim());
      } else {
        // Never create an account from a password-reset screen.
        await requestPhoneOtp(toIraqiE164(identifier), { createUser: false });
      }
    },
    [requestEmailPasswordRecovery, requestPhoneOtp],
  );

  const verifyCode = useCallback(
    async (identifier: string, channel: OtpChannel, code: string): Promise<SignInResult> => {
      return channel === "email"
        ? verifyEmailRecoveryOtp(identifier.trim(), code)
        : verifyPhoneOtp(toIraqiE164(identifier), code);
    },
    [verifyEmailRecoveryOtp, verifyPhoneOtp],
  );

  const otp = useOtpFlow({
    requestCode,
    verifyCode,
    onVerified: () => setVerified(true),
  });

  const activeChannel: OtpChannel = availableChannels.includes(otp.channel)
    ? otp.channel
    : (availableChannels[0] ?? "email");

  const hint =
    activeChannel === "phone"
      ? "سنرسل رمز تحقق إلى رقمك عبر واتساب"
      : "سنرسل رمز تحقق إلى بريدك الإلكتروني";

  const handleIdentifier = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await otp.submitIdentifier();
      toast.success(activeChannel === "phone" ? "أرسلنا الرمز إلى واتساب" : "أرسلنا الرمز إلى بريدك");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال رمز التحقق");
    }
  };

  const handleCode = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await otp.submitCode();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "رمز التحقق غير صحيح أو منتهي الصلاحية");
    }
  };

  const handlePassword = async (event: React.FormEvent) => {
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

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <Header />
      <main className="flex flex-1 items-center justify-center p-4 py-12">
        <Card className="w-full max-w-md border-2 border-primary/10 shadow-lg">
          <CardHeader className="pb-2 text-center">
            <CardTitle className="text-2xl font-bold">استعادة كلمة المرور</CardTitle>
            <CardDescription>
              {done ? "تم تحديث كلمة المرور" : "تحقق من هويتك ثم اختر كلمة مرور جديدة"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {done ? (
              <div className="space-y-4 text-center" data-testid="reset-done">
                <p className="text-sm text-muted-foreground">يمكنك الآن استخدام كلمة المرور الجديدة.</p>
                <Button className="w-full" onClick={() => navigate("/auth", { replace: true })}>
                  الانتقال إلى تسجيل الدخول
                </Button>
              </div>
            ) : verified ? (
              <form onSubmit={handlePassword} className="space-y-4" data-testid="reset-password-form">
                <div className="space-y-2">
                  <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
                  <Input
                    id="new-password"
                    data-testid="new-password"
                    type="password"
                    dir="ltr"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
                  <Input
                    id="confirm-password"
                    data-testid="confirm-password"
                    type="password"
                    dir="ltr"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="h-12 w-full text-lg font-bold" disabled={saving}>
                  {saving ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
                </Button>
              </form>
            ) : availableChannels.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground" data-testid="reset-unavailable">
                استعادة كلمة المرور عبر رمز التحقق غير متاحة حالياً. تواصل مع الدعم.
              </p>
            ) : otp.step === "identifier" ? (
              <form onSubmit={handleIdentifier} className="space-y-4" data-testid="reset-identifier-form">
                {availableChannels.length > 1 && (
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="طريقة استلام الرمز">
                    {availableChannels.map((channel) => (
                      <Button
                        key={channel}
                        type="button"
                        variant={activeChannel === channel ? "default" : "outline"}
                        onClick={() => otp.setChannel(channel)}
                        data-testid={`reset-channel-${channel}`}
                      >
                        {channel === "phone" ? "رقم الهاتف" : "البريد الإلكتروني"}
                      </Button>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="reset-identifier">
                    {activeChannel === "phone" ? "رقم الهاتف" : "البريد الإلكتروني"}
                  </Label>
                  <Input
                    id="reset-identifier"
                    data-testid="reset-identifier"
                    dir="ltr"
                    placeholder={activeChannel === "phone" ? "07XXXXXXXXX" : "name@example.com"}
                    value={otp.identifier}
                    onChange={(event) => otp.setIdentifier(event.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>

                <Button type="submit" className="h-12 w-full text-lg font-bold" disabled={otp.pending}>
                  {otp.pending ? "جارٍ الإرسال..." : "إرسال رمز التحقق"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleCode} className="space-y-4" data-testid="reset-code-form">
                <p className="text-center text-sm text-muted-foreground">{hint}</p>
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
                    data-testid="reset-resend"
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
                    data-testid="reset-change-identifier"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={otp.changeIdentifier}
                  >
                    تغيير المُعرّف
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
