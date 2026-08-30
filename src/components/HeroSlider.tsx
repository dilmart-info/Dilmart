import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type HeroSlide = {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  image: string;
  valueProps?: string[];
};

type SideCard = {
  id: string;
  title: string;
  href: string;
  image: string;
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

    // Autoplay must never start a transition on top of a drag or an in-flight
    // transition — that is what tears a slide in half mid-scroll.
    let interacting = false;
    const onPointerDown = () => {
      interacting = true;
    };
    const onSettle = () => {
      interacting = false;
    };

    api.on("pointerDown", onPointerDown);
    api.on("settle", onSettle);

    // RTL autoplay should move visually from right to left.
    const interval = window.setInterval(() => {
      if (interacting) return;
      api.scrollPrev();
    }, 7200);

    return () => {
      window.clearInterval(interval);
      api.off("pointerDown", onPointerDown);
      api.off("settle", onSettle);
    };
  }, [api]);

  if (loading) {
    return (
      <section className="container py-5 md:py-7">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <Skeleton className="h-[19rem] rounded-2xl md:h-[24rem]" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <Skeleton className="h-36 rounded-2xl md:h-[11.5rem]" />
            <Skeleton className="h-36 rounded-2xl md:h-[11.5rem]" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="container py-5 md:py-7" dir="rtl">
      <div className="space-y-4">
        <div className="hidden grid-cols-3 gap-4 lg:grid">
          {sideCards.slice(0, 3).map((card) => (
            <Link
              key={card.id}
              to={card.href}
              className="group relative overflow-hidden rounded-2xl border border-DilMart-store-gold/15 bg-card"
            >
              <img src={card.image} alt="" className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/30 to-transparent" />
              <p className="absolute bottom-3 right-3 text-sm font-semibold text-white">{card.title}</p>
            </Link>
          ))}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-DilMart-store-gold/15 bg-card">
          {/*
            The shared carousel ships an LTR gutter idiom: -ml-4 on the track and pl-4 on
            every item. Under direction:"rtl" both land on the trailing edge instead of
            straddling the slides, so the track runs 1rem wider than its viewport and the
            gutter shows through as a black vertical seam mid-transition. The hero is a
            full-bleed panel with no gutter at all, so both are cancelled here rather than
            in the shared component.
          */}
          <Carousel opts={{ loop: true, align: "start", direction: "rtl" }} setApi={setApi}>
            <CarouselContent className="ml-0" data-testid="hero-carousel-track">
              {slides.map((slide) => (
                <CarouselItem key={slide.id} className="basis-full pl-0" data-testid="hero-carousel-item">
                  <div className="relative z-10 flex min-h-[19rem] items-center overflow-hidden p-6 md:min-h-[24rem] md:p-10 lg:min-h-[31rem]">
                    <img
                      src={slide.image}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover opacity-75"
                    />
                    <div className="absolute inset-0 bg-gradient-to-l from-black/60 via-black/35 to-black/15" />
                    <div className="max-w-xl space-y-4 rounded-2xl bg-black/35 p-4 text-right backdrop-blur-[1px] md:p-5">
                      <h1 className="font-display text-3xl font-semibold leading-tight text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.7)] md:text-5xl">
                        {slide.title}
                      </h1>
                      <p className="text-sm leading-relaxed text-white/95 [text-shadow:0_1px_8px_rgba(0,0,0,0.75)] md:text-base">
                        {slide.subtitle}
                      </p>
                      {slide.valueProps && slide.valueProps.length > 0 && (
                        <ul className="space-y-1.5 text-xs text-white/95 [text-shadow:0_1px_8px_rgba(0,0,0,0.75)] md:text-sm">
                          {slide.valueProps.slice(0, 4).map((point) => (
                            <li key={point} className="flex flex-row-reverse items-center justify-end gap-2 text-right">
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Link to={slide.href}>
                        <Button className="h-11 rounded-xl px-7">{slide.ctaLabel}</Button>
                      </Link>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          <button
            type="button"
            onClick={() => api?.scrollNext()}
            className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-DilMart-store-gold/20 bg-background/80 backdrop-blur hover:bg-background md:flex"
            aria-label="السابق"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => api?.scrollPrev()}
            className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-DilMart-store-gold/20 bg-background/80 backdrop-blur hover:bg-background md:flex"
            aria-label="التالي"
          >
            <ChevronRight size={18} />
          </button>

          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2">
            {Array.from({ length: snapCount }).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => api?.scrollTo(idx)}
                className={`h-2.5 rounded-full transition-all ${idx === activeIndex ? "w-6 bg-DilMart-store-gold" : "w-2.5 bg-muted-foreground/40"}`}
                aria-label={`الانتقال إلى الشريحة ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:hidden">
          {sideCards.slice(0, 3).map((card) => (
            <Link
              key={card.id}
              to={card.href}
              className="group relative overflow-hidden rounded-2xl border border-DilMart-store-gold/15 bg-card"
            >
              <img src={card.image} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/30 to-transparent" />
              <p className="absolute bottom-3 right-3 text-sm font-semibold text-white">{card.title}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
