export function formatPrice(price: number | undefined | null): string {
  if (price === undefined || price === null) return "0 د.ع";
  return price.toLocaleString("ar-IQ") + " د.ع";
}
