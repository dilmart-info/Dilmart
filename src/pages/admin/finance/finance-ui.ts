export const fmt = (n: number) => new Intl.NumberFormat("ar-IQ").format(Math.round(Number(n ?? 0)));

export const STATUS_LABELS: Record<string, string> = {
  accrued: "متراكم",
  payable: "قابل للدفع",
  in_payout: "ضمن دفعة",
  settled: "مسوّى",
  reversed: "معكوس",
  pending: "معلّق",
};

export const PAYOUT_STATUS_LABELS: Record<string, string> = {
  all: "الكل",
  draft: "مسودة",
  approved: "معتمد",
  settled: "مسوّى",
  cancelled: "ملغي",
  processing: "قيد المعالجة",
};

export const DIRECTION_LABELS: Record<"credit" | "debit", string> = {
  credit: "إضافة",
  debit: "خصم",
};
