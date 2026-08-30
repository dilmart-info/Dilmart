type StorefrontUnavailableProps = {
  title?: string;
  message?: string;
};

export default function StorefrontUnavailable({
  title = "المتجر غير متاح حالياً",
  message = "تعذر تحديد متجر نشط للعرض الآن. يرجى المحاولة لاحقاً.",
}: StorefrontUnavailableProps) {
  return (
    <div className="rounded-2xl border border-dashed border-DilMart-store-gold/30 bg-card/40 px-6 py-12 text-center">
      <h2 className="font-display text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
