import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { storeConfig } from "@/config/store";
import { INFO_NAV_LINKS } from "@/content/customer-policies";
import { ChevronLeft, Home, Shield } from "lucide-react";

interface InfoPageLayoutProps {
  title: string;
  documentTitle?: string;
  subtitle?: string;
  badge?: string;
  lastUpdated?: string;
  children: ReactNode;
}

export default function InfoPageLayout({
  title,
  documentTitle,
  subtitle,
  badge,
  lastUpdated,
  children,
}: InfoPageLayoutProps) {
  const location = useLocation();

  useEffect(() => {
    const pageTitle = documentTitle || title;
    document.title = `${pageTitle} | ${storeConfig.nameAr}`;
    try {
      if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        window.scrollTo({ top: 0, behavior: "instant" as any });
      }
    } catch {
      // safe fallback in test environments
    }
  }, [title, documentTitle]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F7FA] text-[#111827] font-tajawal antialiased">
      <Header />

      {/* ── Sub-header / Breadcrumbs Banner ── */}
      <div className="bg-white border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="container max-w-4xl py-3 text-xs text-slate-500" dir="rtl">
          <nav className="flex items-center gap-1.5 flex-wrap" aria-label="مسار الصفحة">
            <Link
              to="/"
              className="hover:text-[#1261D8] transition-colors flex items-center gap-1"
            >
              <Home className="w-3.5 h-3.5" />
              <span>الرئيسية</span>
            </Link>
            <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900 font-bold">{title}</span>
          </nav>
        </div>
      </div>

      {/* ── Page Header Banner (Clean, utility-focused, no marketing hero) ── */}
      <section className="bg-gradient-to-b from-white to-slate-50 border-b border-slate-200/70 py-8 md:py-10">
        <div className="container max-w-4xl" dir="rtl">
          <div className="space-y-2">
            {badge && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#1261D8] border border-blue-100/80">
                <Shield className="w-3 h-3" />
                <span>{badge}</span>
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#071A3D] tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm sm:text-base text-slate-600 font-medium max-w-2xl leading-relaxed">
                {subtitle}
              </p>
            )}
            {lastUpdated && (
              <p className="text-xs text-slate-400 pt-1">
                آخر تحديث: <span className="font-semibold text-slate-600">{lastUpdated}</span>
              </p>
            )}
          </div>

          {/* ── Quick Informational Navigation Pills ── */}
          <div className="mt-6 pt-5 border-t border-slate-200/60 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-2 pb-1 text-xs">
              <span className="text-slate-400 font-bold shrink-0 ml-1">صفحات المساعدة والمعلومات:</span>
              {INFO_NAV_LINKS.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition-colors ${
                      isActive
                        ? "bg-[#1261D8] text-white shadow-sm"
                        : "bg-white text-slate-700 hover:bg-slate-100/90 border border-slate-200/80"
                    }`}
                  >
                    {item.title}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Content Area ── */}
      <main className="flex-1 container max-w-4xl py-8 md:py-12" dir="rtl">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 md:p-10 shadow-sm leading-relaxed text-sm sm:text-base text-slate-700">
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}
