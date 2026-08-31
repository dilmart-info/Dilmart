import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { ChevronLeft, ChevronRight, Sparkles, Zap, ShieldCheck, Truck } from "lucide-react";
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
    }, 6000);

    return () => {
      window.clearInterval(interval);
      api.off("pointerDown", onPointerDown);
      api.off("settle", onSettle);
    };
  }, [api]);

  if (loading) {
    return (
      <section className="container py-4 md:py-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <Skeleton className="h-[20rem] rounded-2xl md:h-[26rem] bg-muted/40" />
          <div className="hidden lg:grid grid-cols-1 gap-4">
            <Skeleton className="h-[12.5rem] rounded-2xl bg-muted/40" />
            <Skeleton className="h-[12.5rem] rounded-2xl bg-muted/40" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="container py-3 md:py-5" dir="rtl">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        {/* Main Hero Slider */}
        <div className="relative overflow-hidden rounded-2xl bg-navy shadow-md">
          <Carousel
            setApi={setApi}
            opts={{
              direction: "rtl",
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent>
              {slides.map((slide) => (
                <CarouselItem key={slide.id}>
                  <div className="relative h-[20rem] sm:h-[22rem] md:h-[26rem] w-full overflow-hidden">
                    {/* Background Banner Image */}
                    <img
                      src={slide.image}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover object-center"
                      loading="lazy"
                    />
                    {/* Gradient Overlay for crisp text legibility */}
                    <div className="absolute inset-0 bg-gradient-to-r from-navy/95 via-navy/80 to-transparent sm:to-black/30" />

                    {/* Content Box */}
                    <div className="relative z-10 flex h-full flex-col justify-center p-6 sm:p-8 md:p-12 text-right max-w-xl text-white">
                      {slide.badge && (
                        <div className="mb-3 inline-flex items-center gap-1.5 self-start rounded-full bg-accent px-3 py-1 text-xs font-black text-white shadow-sm">
                          <Zap size={13} fill="currentColor" />
                          <span>{slide.badge}</span>
                        </div>
                      )}

                      <h1 className="font-tajawal text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black leading-tight tracking-tight text-white mb-3 drop-shadow-sm">
                        {slide.title}
                      </h1>

                      <p className="font-tajawal text-xs sm:text-sm md:text-base font-normal text-blue-100/90 leading-relaxed mb-6 max-w-md line-clamp-2">
                        {slide.subtitle}
                      </p>

                      {slide.valueProps && slide.valueProps.length > 0 && (
                        <div className="hidden sm:grid grid-cols-2 gap-2 mb-6 text-xs text-blue-200">
                          {slide.valueProps.slice(0, 4).map((prop, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
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
                            className="bg-accent hover:bg-accent-hover text-white font-extrabold text-sm sm:text-base px-7 py-6 rounded-xl shadow-lg shadow-accent/25 transition-all hover:scale-105 active:scale-95"
                          >
                            {slide.ctaLabel}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>

            {/* Carousel Navigation Arrows (Desktop) */}
            <div className="hidden md:flex items-center gap-2 absolute bottom-4 left-4 z-20">
              <button
                type="button"
                onClick={() => api?.scrollPrev()}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 hover:bg-white text-white hover:text-navy backdrop-blur-md transition-all shadow-sm"
                aria-label="السابق"
              >
                <ChevronRight size={20} />
              </button>
              <button
                type="button"
                onClick={() => api?.scrollNext()}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 hover:bg-white text-white hover:text-navy backdrop-blur-md transition-all shadow-sm"
                aria-label="التالي"
              >
                <ChevronLeft size={20} />
              </button>
            </div>

            {/* Pagination Dots */}
            <div className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5">
              {Array.from({ length: snapCount }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => api?.scrollTo(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    activeIndex === i ? "w-6 bg-accent" : "w-2 bg-white/40 hover:bg-white/70"
                  }`}
                  aria-label={`شريحة ${i + 1}`}
                />
              ))}
            </div>
          </Carousel>
        </div>

        {/* Side Promo Tiles (Desktop / Tablet) */}
        <div className="hidden lg:grid grid-cols-1 gap-4">
          {sideCards.slice(0, 2).map((card) => (
            <Link
              key={card.id}
              to={card.href}
              className="group relative flex flex-col justify-end overflow-hidden rounded-2xl bg-navy p-5 text-white shadow-sm transition-all hover:shadow-md"
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
                  <span className="mb-2 inline-block rounded-md bg-accent px-2 py-0.5 text-[10px] font-extrabold text-white">
                    {card.badge}
                  </span>
                )}
                <h3 className="font-tajawal text-base font-extrabold text-white group-hover:text-accent transition-colors">
                  {card.title}
                </h3>
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-blue-200 group-hover:underline">
                  <span>تسوق الآن</span>
                  <ChevronLeft size={14} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
