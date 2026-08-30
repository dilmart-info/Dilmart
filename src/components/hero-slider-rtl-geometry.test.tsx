import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { twMerge } from "tailwind-merge";
import HeroSlider from "@/components/HeroSlider";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";

// embla measures real layout, which jsdom does not provide. The component still renders
// its DOM, which is what these geometry assertions inspect.
vi.mock("embla-carousel-react", () => {
  const api = {
    scrollSnapList: () => [0, 1, 2],
    selectedScrollSnap: () => 0,
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
    scrollTo: vi.fn(),
    canScrollPrev: () => true,
    canScrollNext: () => true,
    on: vi.fn(),
    off: vi.fn(),
  };
  return { default: () => [vi.fn(), api] };
});

const slides = [
  { id: "a", title: "الأول", subtitle: "وصف", ctaLabel: "تسوق", href: "/a", image: "/a.jpg" },
  { id: "b", title: "الثاني", subtitle: "وصف", ctaLabel: "تسوق", href: "/b", image: "/b.jpg" },
  { id: "c", title: "الثالث", subtitle: "وصف", ctaLabel: "تسوق", href: "/c", image: "/c.jpg" },
];

function renderHero() {
  return render(
    <MemoryRouter>
      <HeroSlider slides={slides} sideCards={[]} />
    </MemoryRouter>,
  );
}

const HORIZONTAL_SPACING = [
  "-ml-4",
  "ml-4",
  "pl-4",
  "pr-4",
  "-mr-4",
  "mr-4",
  "gap-4",
  "space-x-4",
];

describe("hero carousel RTL geometry", () => {
  it("renders the track with no horizontal spacing between slides", () => {
    const { container } = renderHero();
    const track = container.querySelector('[data-testid="hero-carousel-track"]') as HTMLElement;

    expect(track).not.toBeNull();
    for (const cls of HORIZONTAL_SPACING) {
      expect(track.classList.contains(cls)).toBe(false);
    }
    expect(track).toHaveClass("ml-0");
  });

  it("renders every slide full width with no horizontal padding", () => {
    const { container } = renderHero();
    const items = Array.from(
      container.querySelectorAll('[data-testid="hero-carousel-item"]'),
    ) as HTMLElement[];

    expect(items).toHaveLength(slides.length);
    for (const item of items) {
      expect(item).toHaveClass("basis-full");
      expect(item).toHaveClass("pl-0");
      for (const cls of HORIZONTAL_SPACING) {
        expect(item.classList.contains(cls)).toBe(false);
      }
    }
  });

  it("cancels the shared gutter through tailwind-merge rather than relying on source order", () => {
    // Guards the actual mechanism: if tailwind-merge ever stopped collapsing these into
    // one declaration, both would land in the class list and the seam would come back.
    expect(twMerge("flex -ml-4", "ml-0")).toBe("flex ml-0");
    expect(twMerge("min-w-0 shrink-0 grow-0 basis-full pl-4", "basis-full pl-0")).not.toContain("pl-4");
  });

  it("keeps the RTL direction on the hero section", () => {
    const { container } = renderHero();
    expect(container.querySelector("section")?.getAttribute("dir")).toBe("rtl");
  });

  it("renders one indicator per real slide", () => {
    const { container } = renderHero();
    const indicators = container.querySelectorAll('[aria-label^="الانتقال إلى الشريحة"]');
    expect(indicators).toHaveLength(slides.length);
  });

  it("keeps both desktop arrow controls", () => {
    const { container } = renderHero();
    expect(container.querySelector('[aria-label="السابق"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="التالي"]')).not.toBeNull();
  });
});

describe("shared carousel defaults are unchanged", () => {
  it("still applies the default gutter for consumers that do not override it", () => {
    const { container } = render(
      <Carousel>
        <CarouselContent data-testid="default-track">
          <CarouselItem data-testid="default-item">one</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    expect(container.querySelector('[data-testid="default-track"]')).toHaveClass("-ml-4");
    expect(container.querySelector('[data-testid="default-item"]')).toHaveClass("pl-4");
    expect(container.querySelector('[data-testid="default-item"]')).toHaveClass("basis-full");
  });
});
