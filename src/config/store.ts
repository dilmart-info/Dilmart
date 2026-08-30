export const storeConfig = {
  brand: {
    ar: "ديلمارت ستور",
    en: "DilMart Store",
  },
  name: "DilMart Store",
  nameAr: "ديلمارت ستور",
  taglineAr: "معدات حلاقة وتجهيزات صالونات — رجالي ونسائي",
  phone: "+964 787 185 7930",
  whatsapp: "9647871857930",
  address: "بغداد، شارع اليرموك — قرب مطعم الدلة",
  logoUrl: "/DilMart-store-logo.png",
  logoWebpUrl: "/DilMart-store-logo.webp",
  iconUrl: "/DilMart-store-icon-only.png",
  iconWebpUrl: "/DilMart-store-icon-only.webp",
  social: {
    instagram: "https://www.instagram.com/DilMart-store_or?igsh=MXVrZWd2anhkZzJzNg==",
    facebook: "https://www.facebook.com/profile.php?id=",
    tiktok: "https://www.tiktok.com/@.DilMart.store",
  },
  currency: "د.ع",
  /**
   * Legacy placeholder — **not** used by M1.6 storefront routing (no default `/store/...` resolution).
   * Do not use for new links; use `/store/:slug` with a real `merchants.slug`. See `docs/canonical-routing.md`.
   */
  defaultMerchantSlug: "DilMart-primary",
} as const;
