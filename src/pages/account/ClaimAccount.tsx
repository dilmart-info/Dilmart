import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, Phone, Lock, CheckCircle2, ArrowRight, RefreshCw, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-core";
import { WEAK_PASSWORD_MESSAGE_AR } from "@/lib/auth/password-errors";
import { customerApi } from "@/lib/api/customer";
import { useAuth } from "@/hooks/use-auth";

export default function ClaimAccount() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialOrderNumber = searchParams.get("orderNumber") || "";
  const initialPhone = searchParams.get("phone") || "";
  const { user, profile } = useAuth();

  const [step, setStep] = useState<"phone" | "otp" | "password" | "done">(
    "phone"
  );
  const [phone, setPhone] = useState(initialPhone || profile?.phone || "");
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [actionToken, setActionToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const startResendTimer = (seconds: number) => {
    setResendTimer(seconds);
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phone.trim()) {
      toast.error("يرجى إدخال رقم الهاتف");
      return;
    }

    setLoading(true);
    try {
      if (orderNumber.trim()) {
        // recover always returns an opaque request_id, so an unauthenticated user can
        // reach the verify step too. Previously only logged-in users got a challenge and
        // everyone else landed on the OTP screen with an empty id.
        const res = await customerApi.recoverClaimByOrder(orderNumber.trim(), phone.trim());
        setChallengeId(res.request_id);
        startResendTimer(60);
        toast.info(res.message || "إذا كانت البيانات صحيحة فقد أرسلنا رمز التوثيق إلى واتساب");
      } else {
        const res = await customerApi.requestAccountClaim(phone.trim());
        setChallengeId(res.challenge_id);
        startResendTimer(res.resend_after || 60);
        toast.success("أرسلنا رمز التوثيق إلى واتساب");
      }
      setStep("otp");
    } catch (err: any) {
      toast.error(err?.message || "فشل إرسال رمز التوثيق");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      toast.error("رمز التوثيق يتكون من 6 أرقام");
      return;
    }

    setLoading(true);
    try {
      const res = await customerApi.verifyAccountClaimOtp(challengeId, otp);
      if (res.success && res.action_token) {
        setActionToken(res.action_token);
        toast.success("تم إثبات ملكية الرقم بنجاح");
        setStep("password");
      }
    } catch (err: any) {
      toast.error(err?.message || "رمز التوثيق غير صحيح");
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteClaim = async (e: React.FormEvent) => {
    e.preventDefault();
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
        toast.success(res.message || "تم استلام حسابك وتعيين كلمة المرور بنجاح");
        setStep("done");
      }
    } catch (err: unknown) {
      // The backend returns the structured code for a password Supabase rejected as weak. Branch
      // on the code, never on the message text. The user stays on the password step with the
      // action token untouched, so a different password can be submitted immediately.
      if (err instanceof ApiError && err.code === "WEAK_PASSWORD") {
        toast.error(err.message || WEAK_PASSWORD_MESSAGE_AR);
        return;
      }
      toast.error(err instanceof Error && err.message ? err.message : "فشل إكمال استلام الحساب");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-primary/10">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <CardTitle className="text-xl font-bold">استلام وتأكيد الحساب</CardTitle>
          <CardDescription>
            {step === "phone" && "أدخل رقم الهاتف المرتبط بطلبك لاستلام حسابك وتعيين كلمة مرور دائمية"}
            {step === "otp" && "أدخل رمز التوثيق الذي أرسلناه إلى واتساب"}
            {step === "password" && "أنشئ كلمة مرور جديدة لحماية حسابك وحفظ طلباتك"}
            {step === "done" && "تهانينا! أصبح حسابك مؤكداً وجاهزاً للاستخدام"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === "phone" && (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              {orderNumber && (
                <div className="space-y-2">
                  <Label htmlFor="orderNumber">رقم الطلب</Label>
                  <div className="relative">
                    <Package className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="orderNumber"
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      placeholder="DUK-XXXXXX"
                      className="pr-10"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="phone">رقم الهاتف</Label>
                <div className="relative">
                  <Phone className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07XXXXXXXXX"
                    dir="ltr"
                    className="pr-10 text-left"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "جارٍ إرسال الرمز..." : "إرسال رمز التوثيق"}
              </Button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp">رمز التوثيق (OTP)</Label>
                <Input
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  dir="ltr"
                  className="text-center text-2xl tracking-widest"
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading || otp.length < 6}>
                {loading ? "جارٍ التحقق..." : "تأكيد الرمز"}
              </Button>

              <div className="text-center pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={resendTimer > 0 || loading}
                  onClick={handleRequestOtp}
                  className="text-xs text-muted-foreground"
                >
                  <RefreshCw className="w-3 h-3 ml-1" />
                  {resendTimer > 0 ? `إعادة الإرسال بعد ${resendTimer} ثانية` : "إعادة إرسال الرمز"}
                </Button>
              </div>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={handleCompleteClaim} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="******"
                    className="pr-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="******"
                    className="pr-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "جارٍ حفظ الحساب..." : "حفظ الحساب ودخول التطبيق"}
              </Button>
            </form>
          )}

          {step === "done" && (
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <p className="text-sm text-muted-foreground">
                تم استلام حسابك وتأكيد هويتك بنجاح. يمكنك الآن متابعة طلباتك والاستفادة من خدمات المتجر.
              </p>
              <Button onClick={() => navigate("/profile")} className="w-full">
                الانتقال إلى حسابي
                <ArrowRight className="w-4 h-4 mr-2" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
