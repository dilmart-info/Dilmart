import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";

const MerchantPending = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { logoutCurrentDevice } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["merchant-application-status"],
    queryFn: () => apiClient.getMyMerchantApplicationStatus(),
    retry: 2,
  });

  const handleSignOut = async () => {
    await logoutCurrentDevice();
    navigate("/merchant/login", { replace: true });
  };

  const merchant = data?.merchant;
  const rawStatus = merchant?.status ?? "pending_review";
  const status = searchParams.get("status") === "suspended" || rawStatus === "suspended" ? "suspended" : rawStatus;

  useEffect(() => {
    if (status === "active") {
      navigate("/merchant", { replace: true });
    }
  }, [status, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">جاري التحقق من حالة طلبك...</p>
        </div>
      </div>
    );
  }

  // إذا تمت الموافقة — انتظر التوجيه
  if (status === "active") {
    return null;
  }

  const isRejected = status === "rejected";
  const isSuspended = status === "suspended";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-2xl border bg-card p-8 shadow-sm text-center space-y-5">
          {/* الأيقونة */}
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
            isRejected || isSuspended ? "bg-destructive/10" : "bg-amber-100 dark:bg-amber-900/20"
          }`}>
            {isRejected ? (
              <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : isSuspended ? (
              <svg className="h-8 w-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="h-8 w-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          {/* العنوان والوصف */}
          {isRejected ? (
            <>
              <div>
                <h1 className="text-xl font-bold text-destructive">تم رفض طلبك</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  نأسف، لم يتم قبول طلب الانضمام كتاجر في الوقت الحالي.
                </p>
              </div>

              {merchant?.rejection_reason && (
                <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4 text-right">
                  <p className="text-xs font-medium text-destructive mb-1">سبب الرفض:</p>
                  <p className="text-sm text-foreground">{merchant.rejection_reason}</p>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                يمكنك التواصل معنا أو تقديم طلب جديد بمعلومات مختلفة.
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => navigate("/merchant/register")}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  تقديم طلب جديد
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  تسجيل الخروج
                </button>
              </div>
            </>
          ) : isSuspended ? (
            <>
              <div>
                <h1 className="text-xl font-bold text-amber-600 dark:text-amber-400">تم تعليق حساب المتجر</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  تم تعليق نشاط هذا المتجر مؤقتاً من قبل إدارة المنصة. لمعرفة التفاصيل أو إعادة التنشيط يرجى مراجعة الدعم الفني.
                </p>
              </div>

              {merchant?.display_name && (
                <div className="rounded-lg bg-muted/50 p-4">
                  <p className="text-xs text-muted-foreground mb-1">المتجر المعلق</p>
                  <p className="font-semibold">{merchant.display_name}</p>
                </div>
              )}

              <div className="space-y-2">
                <button
                  onClick={handleSignOut}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  تسجيل الخروج
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <h1 className="text-xl font-bold">طلبك قيد المراجعة</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  شكراً لتقديم طلبك! يقوم فريقنا بمراجعة معلوماتك وسيتم إخطارك في أقرب وقت.
                </p>
              </div>

              {merchant?.display_name && (
                <div className="rounded-lg bg-muted/50 p-4">
                  <p className="text-xs text-muted-foreground mb-1">اسم المتجر المطلوب</p>
                  <p className="font-semibold">{merchant.display_name}</p>
                </div>
              )}

              {merchant?.submitted_at && (
                <p className="text-xs text-muted-foreground">
                  تاريخ التقديم: {new Date(merchant.submitted_at).toLocaleDateString("ar-IQ", {
                    year: "numeric", month: "long", day: "numeric"
                  })}
                </p>
              )}

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                قيد المراجعة من فريق الإدارة
              </div>

              <button
                onClick={handleSignOut}
                className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                تسجيل الخروج
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          للاستفسار تواصل معنا عبر البريد الإلكتروني
        </p>
      </div>
    </div>
  );
};

export default MerchantPending;
