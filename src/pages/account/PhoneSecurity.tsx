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
import { toIraqiE164 } from "@/lib/auth/identifier";
import { phoneLinkingEnabled } from "@/lib/auth/auth-feature-flags";
import { apiClient } from "@/lib/api-client";

/**
 * Verified phone linking for a signed-in user.
 *
 * The production audit found seven profiles carrying a phone number that nothing ever
 * verified, and zero auth users with a phone at all. Those seven numbers are claims, not
 * proof — somebody typed them into a checkout form. This screen is how a claim becomes
 * proof, and it is the only way: there is no backfill, and profiles.phone is never promoted
 * to "verified" behind the user's back.
 *
 * Three steps, and Supabase owns the middle one entirely:
 *
 *   1. enter the number → check it is free → updateUser({ phone }) sends the code
 *   2. enter the code   → verifyOtp({ type: "phone_change" })
 *   3. read the phone back from the auth record, then ask the backend to mirror it
 *
 * Step 3 re-reads from Supabase rather than trusting step 2's return value, so a
 * verification that silently failed cannot be reported as success.
 */
type Step = "phone" | "code" | "done";

export default function PhoneSecurity() {
  const navigate = useNavigate();
  const { user, startPhoneChange, verifyPhoneChange, getVerifiedAuthPhone } = useAuth();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [normalized, setNormalized] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkedMask, setLinkedMask] = useState("");

  const sendCode = useCallback(async () => {
    const e164 = toIraqiE164(phone);
    if (!e164) {
      toast.error("رقم هاتف غير صالح");
      return;
    }

    setBusy(true);
    try {
      // Ask before sending, so a user does not spend a code on a number they cannot have.
      const availability = await apiClient.checkPhoneAvailability({ phone: e164 });
      if (!availability.available) {
        toast.error("رقم الهاتف مرتبط بحساب آخر");
        return;
      }
      if (availability.alreadyMine) {
        toast.info("هذا الرقم مرتبط بحسابك بالفعل");
        return;
      }

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
      await verifyPhoneChange(normalized, code);

      // Authority is the auth record, not the call that just returned.
      const confirmed = await getVerifiedAuthPhone();
      if (!confirmed || toIraqiE164(confirmed) !== normalized) {
        toast.error("لم يتم تأكيد رقم الهاتف. حاول مرة أخرى");
        return;
      }

      const result = await apiClient.syncVerifiedPhoneIdentity();
      setLinkedMask(result.phoneMasked);
      setStep("done");
      toast.success("تم ربط رقم الهاتف بحسابك");
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

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 flex justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>توثيق رقم الهاتف</CardTitle>
            <CardDescription>
              اربط رقم هاتفك بحسابك بعد تأكيده برمز يصلك عبر واتساب.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!phoneLinkingEnabled && (
              <p className="text-sm text-muted-foreground">
                توثيق رقم الهاتف غير متاح حالياً.
              </p>
            )}

            {phoneLinkingEnabled && !user && (
              <p className="text-sm text-muted-foreground">
                يجب تسجيل الدخول أولاً لتوثيق رقم هاتفك.
              </p>
            )}

            {phoneLinkingEnabled && user && step === "phone" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="phone">رقم الهاتف</Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="07XX XXX XXXX"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    disabled={busy}
                  />
                </div>
                <Button className="w-full" onClick={sendCode} disabled={busy}>
                  {busy ? "جارٍ الإرسال..." : "إرسال رمز التحقق"}
                </Button>
              </>
            )}

            {phoneLinkingEnabled && user && step === "code" && (
              <>
                <p className="text-sm text-muted-foreground">
                  أدخل الرمز المرسل إلى الرقم الذي أدخلته.
                </p>
                <OtpCodeInput value={code} onChange={setCode} disabled={busy} />
                <Button className="w-full" onClick={confirmCode} disabled={busy}>
                  {busy ? "جارٍ التحقق..." : "تأكيد الرمز"}
                </Button>
                <Button variant="ghost" className="w-full" onClick={restart} disabled={busy}>
                  تغيير الرقم
                </Button>
              </>
            )}

            {step === "done" && (
              <>
                <p className="text-sm">
                  تم توثيق رقم هاتفك{linkedMask ? ` (${linkedMask})` : ""} وربطه بحسابك.
                </p>
                <Button className="w-full" onClick={() => navigate("/profile")}>
                  العودة إلى الحساب
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
