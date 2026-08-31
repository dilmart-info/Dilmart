import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { ChevronLeft, ChevronRight, Zap, ShieldCheck, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type HeroSlide = {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  image: string;
  valueProps?: string[];
  badge?: string;
};

type SideCard = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  image: string;
  badge?: string;
};

type HeroSliderProps = {
  slides: HeroSlide[];
  sideCards: SideCard[];
  loading?: boolean;
};

export default function HeroSlider({ slides, sideCards, loading = false }: HeroSliderProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);
  const snapCount = api?.scrollSnapList().length ?? slides.length;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setActiveIndex(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => api.off("select", onSelect);
  }, [api]);

  useEffect(() => {
    if (!api) return;

    let interacting = false;
    const onPointerDown = () => {
      interacting = true;
    };
    const onSettle = () => {
      interacting = false;
    };

    api.on("pointerDown", onPointerDown);
    api.on("settle", onSettle);

    const interval = window.setInterval(() => {
      if (interacting) return;
      api.scrollPrev();
    }, 5500);

    return () => {
      window.clearInterval(interval);
      api.off("pointerDown", onPointerDown);
      api.off("settle", onSettle);
    };
  }, [api]);

  if (loading) {
    return (
      <section className="container py-2.5 md:py-4" dir="rtl">
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <Skeleton className="h-[18rem] rounded-2xl md:h-[23rem] bg-muted/40" />
          <div className="hidden lg:grid grid-cols-1 gap-3.5">
            <Skeleton className="h-[11rem] rounded-2xl bg-muted/40" />
            <Skeleton className="h-[11rem] rounded-2xl bg-muted/40" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="container py-2 md:py-3.5" dir="rtl">
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        {/* ── Main Hero Slider (Brighter Retail Feeling) ─────────────────── */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900 shadow-sm border border-border/60">
          <Carousel
            setApi={setApi}
            opts={{
              direction: "rtl",
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent data-testid="hero-carousel-track" className="ml-0">
              {slides.map((slide) => (
                <CarouselItem
                  key={slide.id}
                  data-testid="hero-carousel-item"
                  className="basis-full pl-0"
                >
                  <div className="relative h-[18rem] sm:h-[20rem] md:h-[23rem] w-full overflow-hidden bg-slate-100">
                    {/* Hero Background Banner Image */}
                    <img
                      src={slide.image}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover object-center"
                      loading="lazy"
                    />
                    {/* Lighter, high-contrast overlay for vibrant retail text legibility */}
                    <div className="absolute inset-0 bg-gradient-to-r from-navy/90 via-navy/65 to-transparent sm:to-black/20" />

                    {/* Content Box */}
                    <div className="relative z-10 flex h-full flex-col justify-center p-5 sm:p-7 md:p-10 text-right max-w-xl text-white">
                      {slide.badge && (
                        <div className="mb-2.5 inline-flex items-center gap-1.5 self-start rounded-full bg-accent px-3 py-0.5 text-xs font-black text-white shadow-sm">
                          <Zap size={12} fill="currentColor" />
                          <span>{slide.badge}</span>
                        </div>
                      )}

                      <h1 className="font-tajawal text-2xl sm:text-3xl md:text-4xl font-black leading-tight tracking-tight text-white mb-2 drop-shadow-sm">
                        {slide.title}
                      </h1>

                      <p className="font-tajawal text-xs sm:text-sm md:text-base font-normal text-blue-100 leading-relaxed mb-4 max-w-md line-clamp-2">
                        {slide.subtitle}
                      </p>

                      {slide.valueProps && slide.valueProps.length > 0 && (
                        <div className="hidden sm:grid grid-cols-2 gap-2 mb-5 text-xs text-blue-200">
                          {slide.valueProps.slice(0, 4).map((prop, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 font-medium">
                              <ShieldCheck size={14} className="text-accent shrink-0" />
                              <span>{prop}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div>
                        <Link to={slide.href}>
                          <Button
                            size="lg"
                            className="bg-accent hover:bg-accent-hover text-white font-extrabold text-xs sm:text-sm px-6 py-5 rounded-xl shadow-md shadow-accent/20 transition-all hover:scale-105 active:scale-95"
                          >
                            <span>{slide.ctaLabel}</span>
                            <ArrowLeft size={16} className="mr-1.5" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>

            {/* Desktop Navigation Arrows */}
            <div className="hidden md:flex items-center gap-2 absolute bottom-4 left-4 z-20">
              <button
                type="button"
                onClick={() => api?.scrollPrev()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/30 hover:bg-white text-white hover:text-navy backdrop-blur-md transition-all shadow-sm"
                aria-label="السابق"
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                onClick={() => api?.scrollNext()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/30 hover:bg-white text-white hover:text-navy backdrop-blur-md transition-all shadow-sm"
                aria-label="التالي"
              >
                <ChevronLeft size={18} />
              </button>
            </div>

            {/* Slide Pagination Dots */}
            <div className="absolute bottom-3.5 right-6 z-20 flex items-center gap-1.5">
              {Array.from({ length: snapCount }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => api?.scrollTo(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    activeIndex === i ? "w-6 bg-accent" : "w-2 bg-white/40 hover:bg-white/70"
                  }`}
                  aria-label={`الانتقال إلى الشريحة ${i + 1}`}
                />
              ))}
            </div>
          </Carousel>
        </div>

        {/* ── Side Merchandising Promo Tiles (Matching Radius & Typography) ── */}
        <div className="hidden lg:grid grid-cols-1 gap-3.5">
          {sideCards.slice(0, 2).map((card) => (
            <Link
              key={card.id}
              to={card.href}
              className="group relative flex flex-col justify-end overflow-hidden rounded-2xl bg-navy p-4 text-white shadow-sm border border-border/60 transition-all hover:shadow-md hover:border-primary/40"
            >
              <img
                src={card.image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/50 to-transparent" />
              <div className="relative z-10 text-right">
                {card.badge && (
                  <span className="mb-1.5 inline-block rounded-md bg-accent px-2 py-0.5 text-[10px] font-black text-white">
                    {card.badge}
                  </span>
                )}
                <h3 className="font-tajawal text-sm md:text-base font-extrabold text-white group-hover:text-accent transition-colors">
                  {card.title}
                </h3>
                {card.subtitle && (
                  <p className="text-[11px] text-blue-200 mt-0.5 line-clamp-1">{card.subtitle}</p>
                )}
                <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-blue-200 group-hover:underline">
                  <span>تسوق الآن</span>
                  <ChevronLeft size={13} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
