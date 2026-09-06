import { productsCategoryHref } from "@/lib/category-hierarchy";

export type HeroSlide = {
  id: string;
  badge?: string;
  title: string;
  subtitle: string;
  valueProps?: string[];
  ctaLabel: string;
  href: string;
  image: string;
};

export type SideCard = {
  id: string;
  badge?: string;
  title: string;
  subtitle?: string;
  href: string;
  image: string;
};

export const HOMEPAGE_HERO_SLIDES: HeroSlide[] = [
  {
    id: "hero-deals",
    badge: "تخفيضات كبرى",
    title: "عروض وتخفيضات ديلمارت الكبرى",
    subtitle: "خصومات مميزة تصل حتى 40% على الأجهزة والإلكترونيات ومستلزمات المنزل.",
    valueProps: ["منتجات مختارة", "دفع آمن عند الاستلام", "تسوق بثقة", "توصيل سريع"],
    ctaLabel: "تسوق العروض الآن",
    href: "/offers",
    image: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1600&q=85&auto=format&fit=crop",
  },
  {
    id: "hero-electronics",
    badge: "أحدث الأجهزة",
    title: "أحدث الإلكترونيات ومستلزمات الهاتف",
    subtitle: "أحدث الموديلات من الماركات المعتمدة بأسعار منافسة وتوصيل مباشر.",
    valueProps: ["أحدث الإصدارات", "ماركات موثوقة", "شحن مباشر", "دعم العملاء"],
    ctaLabel: "استكشف الأجهزة",
    href: productsCategoryHref("electronics-accessories"),
    image: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=1600&q=85&auto=format&fit=crop",
  },
  {
    id: "hero-home-living",
    badge: "المنزل والمطبخ",
    title: "كل ما يحتاجه منزلك في مكان واحد",
    subtitle: "أجهزة منزلية وعناية وأدوات مطبخ بجودة موثوقة وتجربة شراء سهلة.",
    valueProps: ["متاجر موثقة", "أسعار منافسة", "توصيل مباشر", "فحص الطلب قبل الاستلام"],
    ctaLabel: "تصفح مستلزمات المنزل",
    href: productsCategoryHref("home-kitchen"),
    image: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=1600&q=85&auto=format&fit=crop",
  },
];

export const HOMEPAGE_SIDE_CARDS: SideCard[] = [
  {
    id: "side-flash-deals",
    badge: "عروض اليوم",
    title: "تخفيضات مميزة لفترة محدودة",
    subtitle: "وفر حتى 40% على منتجات مختارة",
    href: "/offers",
    image: "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=800&q=85&auto=format&fit=crop",
  },
  {
    id: "side-stores",
    badge: "دليل المتاجر",
    title: "المتاجر المعتمدة في ديلمارت",
    subtitle: "تسوق مباشرة من كبرى الشركات",
    href: "/stores",
    image: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&q=85&auto=format&fit=crop",
  },
];
