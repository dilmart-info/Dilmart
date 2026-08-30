/**
 * STORE-PR6 §13 — customer-safe Arabic UX for the /open handoff. No backend/internal detail is shown; a
 * valid DilMart handoff failure is NEVER turned into a Store login page.
 */
import type { HandoffUxState } from "./store-deep-link.types";

type Copy = { title: string; sub?: string; cta?: boolean };

const COPY: Record<HandoffUxState, Copy> = {
  processing: { title: "جاري فتح حسابك في DilMart Store..." },
  success: { title: "تم فتح حسابك بنجاح." },
  expired: { title: "انتهت صلاحية رابط الدخول.", sub: "ارجع إلى تطبيق DilMart وحاول فتح المتجر مرة أخرى.", cta: true },
  already_used: { title: "رابط الدخول لم يعد صالحاً.", sub: "افتح المتجر مرة أخرى من تطبيق DilMart.", cta: true },
  invalid: { title: "رابط الدخول لم يعد صالحاً.", sub: "افتح المتجر مرة أخرى من تطبيق DilMart.", cta: true },
  unavailable: { title: "تعذر فتح المتجر الآن.", sub: "حاول مرة أخرى بعد قليل.", cta: true },
  retryable_error: { title: "تعذر فتح المتجر الآن.", sub: "حاول مرة أخرى بعد قليل.", cta: true },
  identity_verification_required: { title: "يحتاج حسابك إلى خطوة تحقق إضافية قبل ربطه بالمتجر.", sub: "يمكنك متابعة التصفح في المتجر الآن.", cta: true },
  blocked: { title: "تعذر ربط حسابك بالمتجر.", sub: "يمكنك متابعة التصفح في المتجر.", cta: true },
};

export function HandoffScreen({ state, onContinue }: { state: HandoffUxState; onContinue: () => void }) {
  const copy = COPY[state] ?? COPY.unavailable;
  return (
    <div
      dir="rtl"
      data-testid={`handoff-${state}`}
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
    >
      {state === "processing" ? (
        <div data-testid="handoff-spinner" className="h-10 w-10 animate-spin rounded-full border-2 border-DilMart-store-gold border-t-transparent" />
      ) : null}
      <h1 className="text-xl font-bold">{copy.title}</h1>
      {copy.sub ? <p className="text-sm text-muted-foreground max-w-md">{copy.sub}</p> : null}
      {copy.cta ? (
        <button
          type="button"
          data-testid="handoff-continue"
          onClick={onContinue}
          className="mt-2 rounded-md bg-DilMart-store-gold px-5 py-2 text-white"
        >
          متابعة إلى المتجر
        </button>
      ) : null}
    </div>
  );
}
