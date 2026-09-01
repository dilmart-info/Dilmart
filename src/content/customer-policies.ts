import { storeConfig } from "@/config/store";

export const POLICY_METADATA = {
  lastUpdated: "سبتمبر 2026",
  brandNameAr: storeConfig.nameAr,
  brandNameEn: storeConfig.name,
  taglineAr: storeConfig.taglineAr,
} as const;

export interface InfoPageLink {
  title: string;
  href: string;
  description?: string;
}

export const INFO_NAV_LINKS: InfoPageLink[] = [
  {
    title: "عن ديلمارت",
    href: "/about",
    description: "تعرف على منصة ديلمارت وتجربة التسوق",
  },
  {
    title: "مركز المساعدة",
    href: "/support",
    description: "إجابات على الأسئلة الشائعة وإرشادات الطلب والتوصيل",
  },
  {
    title: "تواصل معنا",
    href: "/contact",
    description: "قنوات التواصل المباشرة وخدمة العملاء",
  },
  {
    title: "الإلغاء والإرجاع",
    href: "/returns",
    description: "إرشادات تقديم طلبات الإلغاء وحالات الإرجاع",
  },
  {
    title: "الشروط والأحكام",
    href: "/terms",
    description: "شروط وضوابط استخدام المنصة والطلبات",
  },
  {
    title: "سياسة الخصوصية",
    href: "/privacy",
    description: "كيفية التعامل مع البيانات وحمايتها أثناء الاستخدام",
  },
];
