# Product Card — The Single Most Important Component

The product card is rendered hundreds of times per page-view. Every pixel matters. Get this wrong and the marketplace fails regardless of how good the homepage looks.

## Anatomy (desktop, ~240px wide card)

```
┌────────────────────────────────────┐
│  [-30%]              [♡]           │ ← Badge top-left, wishlist top-right (16px from edges)
│                                    │
│                                    │
│          PRODUCT IMAGE             │ ← 1:1 square, contain-fit, off-white bg
│          (240 × 240)               │
│                                    │
│                                    │
│  ●●●○○ ○○○○○                       │ ← optional swatches row (variant colors), max 5 + "+N"
├────────────────────────────────────┤
│  BRAND NAME                        │ ← 11px, uppercase, letter-spacing 0.06em, ink-500
│  Product name in two lines max,    │ ← 14px, weight 500, ink-900, line-clamp:2
│  truncate with ellipsis            │
│  ★ 4.7 (1,284)                     │ ← 12px, stars in gold, count in ink-500
│                                    │
│  $24.99  $34.99                    │ ← price 18px weight 700 + strike 13px ink-500
│  Save $10 · Free delivery          │ ← 11px success/info copy, optional
│                                    │
│  [   Add to cart   ]               │ ← full-width, 40px tall, primary CTA
└────────────────────────────────────┘
```

## Required data fields

```ts
type ProductCardData = {
  id: string;
  brand: string;              // "L'Oréal Professionnel"
  name: string;               // "Serie Expert Vitamino Color Shampoo 300ml"
  image: { src: string; alt: string };
  hoverImage?: { src: string; alt: string };  // shown on hover (lifestyle shot)
  price: { amount: number; currency: string };
  originalPrice?: { amount: number; currency: string };
  rating?: { value: number; count: number };  // 0–5
  badges?: Badge[];           // see below, max 2 visible
  swatches?: Swatch[];        // for hair color, lipstick, polish
  stockState: "in_stock" | "low_stock" | "pre_order" | "sold_out";
  deliveryPromise?: string;   // "Tomorrow" | "Free over $50"
  isWishlisted: boolean;
  vendorBadge?: "official_store" | "authorized_reseller" | "marketplace_seller";
};
```

## Badge system — max 2 visible, ordered by priority

| Priority | Badge | Color | Use when |
|----------|-------|-------|----------|
| 1 | `-NN%` | discount-bg/fg | discount ≥ 10% |
| 2 | `Bestseller` | gold on dark | top 1% sales in category |
| 3 | `New` | info | added in last 30 days |
| 4 | `Authentic` | success | official store / verified brand |
| 5 | `Pro Only` | ink-900 on gold | salon-pro tier product |
| 6 | `Vegan` / `Cruelty-Free` | success outline | matches product attributes |
| 7 | `Limited Edition` | gold outline | limited stock SKU |

Never show more than 2 simultaneously. If discount + bestseller both apply, show discount + bestseller in a vertical stack with 4px gap.

## States

### Default
- Background: `--color-surface`
- Border: `1px solid transparent`
- Shadow: none

### Hover (desktop only)
- Lift: `transform: translateY(-2px)`
- Shadow: `--shadow-md`
- Border: `1px solid --color-ink-100`
- Image: crossfade to `hoverImage` over 240ms if available
- Wishlist icon: scale 1.1
- Transition: `all 180ms cubic-bezier(0.2, 0.8, 0.2, 1)`

### Loading (skeleton)
- Image area: animated shimmer `linear-gradient(90deg, surface-3 0%, ink-100 50%, surface-3 100%)` 1.6s infinite
- Text rows: 3 rows of varying widths (90%, 70%, 50%) in surface-3
- No spinner. Skeletons only.

### Sold out
- Image: 50% opacity + grayscale(40%)
- Overlay text: "Out of stock" — 14px, weight 600, centered, bg `rgba(255,255,255,0.85)` chip
- CTA replaced with: `[ Notify me ]` outlined variant

### Pre-order
- Badge: `Pre-order` in info color
- CTA: `[ Pre-order — ships Mar 15 ]`
- Price stays normal

## CTA behavior

The card has **one primary action**: Add to cart. NOT "View details" — the whole card surface is the link to the PDP. The CTA button has its own click handler that adds-to-cart inline without leaving the page.

```html
<article class="product-card">
  <a href="/p/{slug}" class="product-card__link">
    <!-- image, name, price -->
  </a>
  <button class="product-card__cta" data-product-id="{id}">
    Add to cart
  </button>
</article>
```

The CTA must `event.stopPropagation()` and `event.preventDefault()` so it doesn't navigate.

On click: button shows spinner for 400ms max, then morphs into a `[− 1 +]` quantity stepper. The stepper stays visible until the user navigates away or the card re-renders.

## Variant swatches (when applicable)

For products with color variants (hair dye, lipstick, nail polish, foundation):

- Show **up to 5 swatches inline**, then `+N` chip if more
- Each swatch: 18px circle, 2px white inner ring, 1px ink-300 outer border
- On swatch hover: image swaps to that variant's photo
- On swatch click: do NOT navigate — update the card's image/price/sku in place
- ARIA: `role="radiogroup"` with `aria-label="Choose shade"`

## Accessibility (non-negotiable)

- The whole card link has `aria-label="{brand} {name}, {price}, rated {rating} out of 5"`
- Wishlist button: `aria-pressed` + `aria-label="Add to wishlist" / "Remove from wishlist"`
- Add to cart: `aria-label="Add {name} to cart"`
- Color is never the only indicator of state (sold out has text, not just gray image)
- Focus ring: 2px solid `--color-primary-500`, offset 2px, visible on `:focus-visible`
- Min tap target on any interactive element: 32×32 visually, 44×44 effective via padding

## Mobile layout (≤640px, 2-column grid)

Same structure, condensed:
- Card width ~170px
- Image 170×170
- Name allowed 2 lines, 13px
- Hide brand line (it's already in the name via context)
- Hide secondary copy ("Save $X · Free delivery") — keep only price + strike
- CTA shrinks to 36px tall, full width
- Wishlist heart stays top-right, 32×32 tap target

## What NOT to do on the product card

1. **Don't show "Quick view" buttons** — they tested badly in 2018 and badly again in 2023. PDP is fast enough.
2. **Don't autoplay video previews** — destroys scroll performance and battery.
3. **Don't put the brand name larger than the product name** — brand is context, product is the noun.
4. **Don't use star emoji (★) inconsistently** — use one SVG star component, never mixed with text stars.
5. **Don't show fractional ratings without the count** — "4.7" alone is meaningless; "4.7 (1,284)" has authority.
6. **Don't make the wishlist icon red by default** — red = active state. Default = ink-500 outline.
7. **Don't hide the price behind hover** — the price is the reason the card exists.

## Reference HTML (clean baseline, RTL-safe)

```html
<article class="pc" data-product-id="sku-12345">
  <a class="pc__media" href="/p/loreal-vitamino-shampoo-300ml"
     aria-label="L'Oréal Vitamino Color Shampoo 300ml, $24.99, rated 4.7 out of 5">
    <div class="pc__badges">
      <span class="pc__badge pc__badge--discount">-29%</span>
      <span class="pc__badge pc__badge--bestseller">Bestseller</span>
    </div>
    <button class="pc__wishlist" aria-label="Add to wishlist" aria-pressed="false">
      <svg aria-hidden="true">...</svg>
    </button>
    <img class="pc__image" src="..." alt="" loading="lazy" decoding="async">
  </a>
  <div class="pc__body">
    <p class="pc__brand">L'Oréal Professionnel</p>
    <h3 class="pc__name">Serie Expert Vitamino Color Shampoo 300ml</h3>
    <div class="pc__rating" aria-label="Rated 4.7 out of 5, 1284 reviews">
      <span class="pc__stars" style="--rating: 4.7"></span>
      <span class="pc__rating-count">(1,284)</span>
    </div>
    <div class="pc__price">
      <span class="pc__price-now">$24.99</span>
      <s class="pc__price-was">$34.99</s>
    </div>
    <p class="pc__delivery">Free delivery · Tomorrow</p>
  </div>
  <button class="pc__cta" type="button">Add to cart</button>
</article>
```

Build every card from this skeleton. Variants and embellishments come from data, not from forking the HTML.
