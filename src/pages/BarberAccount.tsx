/**
 * B2B "حسابي" experience for a Barber/Owner browsing the Store via the Barber web handoff.
 * Rendered instead of the Customer Profile page whenever a valid __Host-DilMart_store_bwt session
 * exists (see ProfileRouteGate.tsx) — never the Customer login/register screen. Read-only identity
 * display only: no order history, no ratings/balances, no address sync (BARBER_ADDRESS_SYNC =
 * NOT_IMPLEMENTED) — only real session data already returned by GET .../barber/web-session.
 */
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, Phone, ShieldCheck, User } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useBarberWebSession } from "@/lib/barber-handoff/BarberWebSessionContext";

const ROLE_LABEL: Record<"OWNER" | "BARBER", string> = {
  OWNER: "صاحب صالون",
  BARBER: "حلاق / مختص",
};

export default function BarberAccount() {
  const { state, logout } = useBarberWebSession();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  if (state.status !== "authenticated") {
    // ProfileRouteGate only renders this page when state is already "authenticated"; this guards
    // against a session expiring/being revoked mid-visit (e.g. a second handoff elsewhere).
    return (
      <div className="min-h-screen flex flex-col bg-muted/30">
        <Header />
        <main className="flex-1 container py-8 flex items-center justify-center text-muted-foreground">
          انتهت صلاحية جلسة المتجر. أعد فتح المتجر من تطبيق ديل مارتللحلاقين.
        </main>
        <Footer />
      </div>
    );
  }

  const { barber } = state;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const confirmed = await logout();
      if (confirmed) {
        toast.success("تم إنهاء جلسة المتجر");
        navigate("/", { replace: true });
      } else {
        toast.error("تعذر إنهاء الجلسة. حاول مرة أخرى.");
      }
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30" data-testid="barber-account-page">
      <Header />
      <main className="flex-1 container py-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">حسابي</h1>
            <Badge variant="secondary" className="flex items-center gap-1.5 text-xs">
              <ShieldCheck size={14} />
              متصل عبر ستايلي
            </Badge>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User size={20} className="text-primary" />
                {barber.displayName || "حساب متصل"}
              </CardTitle>
              <CardDescription>{ROLE_LABEL[barber.role]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {barber.businessType ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 size={16} />
                  <span>{barber.businessType}</span>
                </div>
              ) : null}
              {barber.city ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin size={16} />
                  <span>{barber.city}</span>
                </div>
              ) : null}
              {barber.phone ? (
                <div className="flex items-center gap-2 text-muted-foreground" dir="ltr">
                  <Phone size={16} />
                  <span>{barber.phone}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-muted-foreground/10 bg-muted/40">
            <CardContent className="p-4 text-xs text-muted-foreground">
              هذا حساب متجر خاص بالمحترفين، منفصل عن حسابات العملاء. لإدارة حسابك في ستايلي، استخدم تطبيق ديل مارتللحلاقين.
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full" disabled={loggingOut} onClick={() => void handleLogout()}>
            {loggingOut ? "جاري الخروج..." : "إنهاء جلسة المتجر"}
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
