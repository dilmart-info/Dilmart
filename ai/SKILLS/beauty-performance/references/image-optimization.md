# Image Optimization

Beauty marketplaces are image-heavy. Product photos, lifestyle shots, hero banners, ingredient close-ups — images are 70-85% of page weight. Optimizing them is the single biggest performance win.

## The optimization stack

1. **Right format** (AVIF > WebP > JPEG/PNG)
2. **Right size** (responsive `srcset`)
3. **Right time** (lazy-load below fold, preload hero)
4. **Right quality** (80-85% for product photos)
5. **Right CDN** (image transforms at edge)

Apply all five. Each compounds.

## Modern formats

### AVIF

- 30-50% smaller than WebP
- 50-70% smaller than JPEG
- Slower to encode (do at upload time, cache forever)
- Browser support: Chrome 85+, Firefox 86+, Safari 16.4+ (~95% of users)

### WebP

- 25-35% smaller than JPEG
- Universal browser support (97%+)
- Good fallback

### JPEG

- Last resort fallback
- 92%+ quality at start, optimize downward
- Use MozJPEG encoder (better quality than libjpeg)

### PNG

- For graphics with transparency, sharp edges
- Use only when needed (logos, icons)
- Convert to WebP or AVIF lossless where possible

### SVG

- For logos, icons, simple graphics
- Vector — scales perfectly
- Compress with SVGO
- Don't use for photos

### `<picture>` element for fallback

```html
<picture>
  <source srcset="hero.avif" type="image/avif">
  <source srcset="hero.webp" type="image/webp">
  <img src="hero.jpg" 
       alt="..." 
       width="1200" 
       height="675"
       loading="eager"
       decoding="async">
</picture>
```

Browser picks the first format it supports.

### Just `<img>` with format negotiation

Modern CDNs negotiate format based on `Accept` header:

```html
<img src="/img/hero.jpg" alt="...">
```

CDN serves AVIF if browser accepts, else WebP, else JPEG. Simpler markup; requires CDN support.

## Responsive images

Don't ship a 2400px image to a 320px phone screen.

### `srcset` + `sizes`

```html
<img src="hero-800.jpg"
     srcset="hero-400.jpg 400w,
             hero-600.jpg 600w,
             hero-800.jpg 800w,
             hero-1200.jpg 1200w,
             hero-1600.jpg 1600w,
             hero-2400.jpg 2400w"
     sizes="(max-width: 640px) 100vw,
            (max-width: 1024px) 50vw,
            33vw"
     alt="..."
     width="800"
     height="450"
     loading="lazy"
     decoding="async">
```

- `srcset` lists available sizes
- `sizes` tells browser the display size at different viewports
- Browser picks the best `srcset` entry given the viewport

### When to use `srcset`/`sizes`

For images that vary in display size based on viewport (most product images, hero banners).

For images at fixed display size (e.g., 80x80 thumbnail always 80x80), use `srcset` without `sizes`:

```html
<img src="thumb-80.jpg"
     srcset="thumb-80.jpg 1x, thumb-160.jpg 2x, thumb-240.jpg 3x"
     alt="..."
     width="80"
     height="80">
```

Or just provide a 2x version for retina.

### CDN-based sizing

Modern image CDNs (Cloudinary, Imgix, Bunny CDN, Cloudflare Images, Vercel/Next Image) handle this automatically:

```jsx
import Image from 'next/image';

<Image 
  src="/products/shampoo.jpg"
  alt="..."
  width={800}
  height={800}
  sizes="(max-width: 768px) 100vw, 400px"
/>
```

Next.js generates appropriate `srcset`, formats, and serves from edge.

## Lazy loading

```html
<img src="..." loading="lazy" decoding="async" alt="...">
```

- `loading="lazy"` — browser only loads when image is near viewport
- `decoding="async"` — decoding doesn't block main thread
- Don't lazy-load images above the fold (LCP killer)

### `loading="eager"` and `fetchpriority="high"`

For hero / LCP image:

```html
<img src="hero.avif"
     loading="eager"
     fetchpriority="high"
     decoding="async"
     width="1200"
     height="675"
     alt="...">
```

Tells browser: "this is critical, fetch immediately."

### Intersection Observer for advanced lazy

If native lazy isn't enough (e.g., advanced placeholder swapping):

```js
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      observer.unobserve(img);
    }
  });
}, { rootMargin: '50px' });

document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
```

## Placeholder strategies

While image loads, show something:

### Solid color

```html
<img src="..." 
     style="background-color: #f3f4f6;"
     alt="...">
```

Minimal disruption.

### Blurred low-res (BlurHash, ThumbHash)

Tiny encoding of image (~30 bytes) → blurred preview:

```jsx
import { decode } from 'blurhash';
// Or use thumbhash for better quality

function ImageWithBlurhash({ src, blurhash, alt }) {
  return (
    <div style={{ position: 'relative' }}>
      <canvas 
        ref={canvas => {
          if (canvas) {
            const pixels = decode(blurhash, 32, 32);
            const ctx = canvas.getContext('2d');
            const imageData = ctx.createImageData(32, 32);
            imageData.data.set(pixels);
            ctx.putImageData(imageData, 0, 0);
          }
        }}
        width={32}
        height={32}
        style={{ width: '100%', height: '100%', position: 'absolute' }}
      />
      <img src={src} alt={alt} 
           onLoad={e => e.target.style.opacity = 1}
           style={{ opacity: 0, transition: 'opacity 0.3s', position: 'relative' }} />
    </div>
  );
}
```

### Dominant color

CDNs often return dominant color of image. Use as background:

```jsx
<div style={{ backgroundColor: image.dominantColor }}>
  <img src={image.src} alt="..." />
</div>
```

### LQIP (Low-Quality Image Placeholder)

Tiny version of image (10-50px wide), base64-encoded inline:

```html
<img src="data:image/jpeg;base64,..." 
     data-src="full-image.jpg"
     class="lqip"
     alt="...">
```

CSS:
```css
.lqip {
  filter: blur(20px);
  transform: scale(1.1); /* hide blur edge */
  transition: filter 0.3s;
}

.lqip.loaded {
  filter: blur(0);
}
```

Replaced when full image loads.

## Compression quality

For product photos (JPEG/WebP/AVIF):

| Quality | File size | Visual difference |
|---|---|---|
| 100 | Baseline | Imperceptible from 95 |
| 95 | ~70% of 100 | Imperceptible from 85 |
| 85 | ~50% of 100 | Pixel-perfect look |
| 80 | ~40% of 100 | Recommended for product photos |
| 75 | ~30% of 100 | Visible on smooth gradients |
| 70 | ~25% of 100 | Visible compression artifacts |
| 60 | ~20% of 100 | Definitely noticeable |

**Use 80 for AVIF, 80 for WebP, 85 for JPEG** as starting point.

For specific image types:

| Type | Recommended quality |
|---|---|
| Product packshot (white bg) | 85 |
| Lifestyle photo | 80 |
| Banner/hero | 80 |
| Thumbnail (80px) | 75 |
| Avatar | 80 |
| Texture/swatch | 90 (small surface area) |
| Logo (PNG → WebP lossless) | lossless |

### Tools

- **Squoosh** — interactive Web compression
- **Sharp** (Node.js) — programmatic compression
- **ImageMagick** — CLI tool
- **MozJPEG / cjpeg** — best JPEG encoder
- **cwebp / avifenc** — encoders for WebP and AVIF
- **SVGO** — SVG optimization

### Sharp example (Node)

```js
import sharp from 'sharp';

async function processProductImage(buffer) {
  return Promise.all([
    sharp(buffer).resize(2400).avif({ quality: 80 }).toFile('hero-2400.avif'),
    sharp(buffer).resize(1600).avif({ quality: 80 }).toFile('hero-1600.avif'),
    sharp(buffer).resize(1200).avif({ quality: 80 }).toFile('hero-1200.avif'),
    sharp(buffer).resize(800).avif({ quality: 80 }).toFile('hero-800.avif'),
    sharp(buffer).resize(400).avif({ quality: 80 }).toFile('hero-400.avif'),
    
    sharp(buffer).resize(2400).webp({ quality: 80 }).toFile('hero-2400.webp'),
    // ... and so on for WebP and JPEG
  ]);
}
```

Run at upload time, store all variants in CDN. Don't transform on each request.

## CDN integration

### Image CDNs

Specialized CDNs for image delivery:

| Service | Pros | Cons |
|---|---|---|
| **Cloudinary** | Industry standard, many transforms | Expensive at scale |
| **Imgix** | Powerful API | Mid-tier price |
| **Bunny CDN** | Affordable, decent features | Less polished UI |
| **Cloudflare Images** | $5/month for 100K images | Less customization |
| **Vercel/Next Image** | Integrated with Next.js | Locked to Vercel |
| **AWS CloudFront + Lambda@Edge** | Total control | DIY complexity |

For most marketplaces: Cloudinary or Cloudflare Images.

### URL-based transforms

```
https://cdn.example.com/image.jpg
?w=800&h=800&fit=cover&q=80&fm=avif
```

CDN serves:
- 800×800 cropped to fit
- 80% quality
- AVIF format

Generate URLs dynamically:

```js
function imageUrl(path, { width, height, quality = 80, format = 'auto' }) {
  const params = new URLSearchParams({
    w: width, h: height, q: quality, fm: format, fit: 'cover'
  });
  return `https://cdn.example.com/${path}?${params}`;
}

<img src={imageUrl(product.image, { width: 800, height: 800 })} alt="..." />
```

## Per-context image sizes

Different surfaces need different image sizes. Plan upfront.

| Surface | Display size | Image size to request |
|---|---|---|
| Product card grid (4 per row) | 280×280 | 280, 560 (2x), 840 (3x) |
| Product card (mobile, 2 per row) | 180×180 | 180, 360 |
| PDP hero (desktop) | 800×800 | 800, 1200, 1600 |
| PDP hero (mobile) | 400×400 | 400, 600, 800 |
| Thumbnail in cart | 80×80 | 80, 160 |
| Wishlist card | 200×200 | 200, 400 |
| Order confirmation | 60×60 | 60, 120 |
| Featured strip (homepage) | 240×240 | 240, 480 |
| Hero banner (homepage) | 1920×600 | 800, 1200, 1600, 1920 |
| Vendor logo (header) | 60×60 | 60, 120 |
| Vendor cover photo | 1920×400 | 800, 1200, 1600 |

## Aspect ratios

Keep consistent aspect ratios for visual rhythm:

- Product packshot: 1:1 (square)
- Lifestyle: 4:5 (slightly tall) or 16:9 (landscape)
- Hero banner: 16:9 or 21:9
- Avatar: 1:1
- Cover: 16:5 or 16:6

Force aspect ratio with CSS:

```css
.product-image {
  aspect-ratio: 1 / 1;
  object-fit: cover;
  width: 100%;
}

.hero-banner {
  aspect-ratio: 16 / 9;
  object-fit: cover;
  width: 100%;
}
```

`aspect-ratio` reserves space → no CLS.

## Image dimensions in HTML

ALWAYS specify `width` and `height` (intrinsic, not display):

```html
<img src="..." width="800" height="800" alt="...">
```

Even if display size differs (CSS sizes it):

```css
img { width: 100%; height: auto; }
```

Browser uses width/height to calculate aspect ratio and reserve space. No CLS.

## Background images

For decorative backgrounds:

```css
.hero {
  background-image: url('hero.avif');
  background-size: cover;
  background-position: center;
  /* Modern: use image-set for format selection */
  background-image: image-set(
    url('hero.avif') type('image/avif'),
    url('hero.webp') type('image/webp'),
    url('hero.jpg') type('image/jpeg')
  );
}
```

But: background images can't be preloaded efficiently. If hero is a background image, LCP suffers. Prefer `<img>` with `fetchpriority` for hero.

## Above-the-fold strategy

```html
<!-- HEAD -->
<link rel="preload" 
      as="image" 
      href="/hero-1200.avif" 
      type="image/avif" 
      fetchpriority="high"
      imagesrcset="/hero-800.avif 800w, /hero-1200.avif 1200w"
      imagesizes="100vw">

<!-- BODY -->
<img src="/hero-1200.avif"
     srcset="/hero-800.avif 800w, /hero-1200.avif 1200w"
     sizes="100vw"
     fetchpriority="high"
     loading="eager"
     decoding="async"
     width="1200"
     height="675"
     alt="...">
```

This is the bare minimum for hero LCP optimization.

## Below-the-fold strategy

```html
<img src="/product-400.avif"
     srcset="/product-200.avif 200w, /product-400.avif 400w, /product-600.avif 600w"
     sizes="(max-width: 640px) 50vw, 25vw"
     loading="lazy"
     decoding="async"
     width="400"
     height="400"
     alt="...">
```

`loading="lazy"` + `decoding="async"` covers most below-fold images.

## Image galleries

For PDP galleries with multiple images:

1. **First image**: eager + high priority (this is LCP)
2. **Visible thumbnails**: eager
3. **Other gallery images**: lazy
4. **On click of thumbnail**: preload next image

```jsx
function ProductGallery({ images }) {
  const [current, setCurrent] = useState(0);
  
  return (
    <>
      <img 
        src={images[current].src}
        srcset={images[current].srcset}
        fetchpriority={current === 0 ? 'high' : 'auto'}
        loading={current === 0 ? 'eager' : 'lazy'}
        // ...
      />
      <div className="thumbs">
        {images.map((img, i) => (
          <button 
            key={i} 
            onMouseEnter={() => preloadImage(img.src)} // prefetch on hover
            onClick={() => setCurrent(i)}
          >
            <img src={img.thumb} loading="lazy" />
          </button>
        ))}
      </div>
    </>
  );
}
```

## Animated images

### GIF replacement

GIFs are huge and inefficient. Replace with:

```html
<video autoplay loop muted playsinline width="400" height="400">
  <source src="animation.webm" type="video/webm">
  <source src="animation.mp4" type="video/mp4">
</video>
```

WebM/MP4 is 10× smaller than GIF.

### Animated WebP / AVIF

Both formats support animation. Better than GIF, smaller than video for short loops.

## Print/social media images

OG (Open Graph) and Twitter Card images:

```html
<meta property="og:image" content="https://example.com/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
```

Standard sizes:
- Facebook/OG: 1200×630
- Twitter (summary_large_image): 1200×675
- LinkedIn: 1200×627

Generate at build time per product:
- Product name
- Price
- Hero image
- Brand
- (Aspect ratio 1.91:1 for OG)

## Asset URLs

Use versioned/hashed URLs for cache busting:

```
/images/hero.abc123.jpg
```

If the image content changes, the hash changes → new URL → no stale cache issues.

Set headers:
```
Cache-Control: public, max-age=31536000, immutable
```

Forever cache, since URL changes with content.

## Image upload pipeline

When vendor uploads a product image:

```
1. Validate
   - File type (whitelist: jpeg, png, webp, heic)
   - File size (max 10MB)
   - Dimensions (min 800px on shorter side; recommend 2000×2000)
   - No virus (ClamAV scan)

2. Original storage
   - Store original in S3/blob storage
   - Keep for reprocessing

3. Generate variants
   - Sizes: 200, 400, 800, 1200, 1600, 2400
   - Formats: AVIF, WebP, JPEG
   - Total: ~18 variants per image

4. Upload to CDN
   - Use sane URL structure: cdn.example.com/p/{product-id}/{size}.{format}

5. Update product record
   - Store CDN base URL
   - Store blurhash/dominant color for placeholder

6. Done — image ready for serving
```

Tools: Sharp (Node), Pillow (Python), ImageMagick (CLI).

Run in background job (BullMQ, Sidekiq, Celery) — don't block upload response.

## CDN edge processing

Modern image CDNs do transforms at edge on first request:

```
First request to /hero.jpg?w=800&fm=avif
→ CDN fetches /hero.jpg from origin
→ CDN resizes to 800w, converts to AVIF
→ CDN caches the transformed version
→ CDN returns to client

Second request: served from edge cache instantly
```

Pros:
- One source image, many variants on-demand
- No pre-generation needed
- Easy to add new sizes/formats

Cons:
- First request to a new variant has higher latency
- CDN cost scales with variant count

For best of both: pre-generate common sizes at upload (above), let CDN handle long-tail variants.

## Monitoring

Track:
- LCP image load time (RUM)
- Image bytes shipped per page
- Format distribution (% AVIF, % WebP, % JPEG)
- 4xx/5xx rates on image URLs
- CDN cache hit ratio (>95% is good)

## Common image bugs

### Vendor uploads 50MB image

Pipeline rejects:
```
File too large.
Maximum size: 10MB.
Tip: compress your image before uploading.
```

### Vendor uploads tiny 200×200

Pipeline rejects:
```
Image too small for high-quality display.
Minimum: 800×800.
Recommended: 2000×2000.
```

### Vendor uploads HEIC (iPhone format)

Pipeline accepts but converts to JPEG/AVIF (HEIC not widely supported on web).

### EXIF rotation issues

iPhone photos sometimes have EXIF orientation metadata. Strip it and apply rotation to pixel data:

```js
sharp(buffer)
  .rotate() // auto-orient based on EXIF
  .withMetadata(false) // strip EXIF
  .toBuffer();
```

### Color space issues

Images with non-sRGB color spaces look wrong in browsers. Convert to sRGB:

```js
sharp(buffer)
  .toColorspace('srgb')
  .toBuffer();
```

### Transparency

PNG with transparency → JPEG would lose transparency. Use WebP/AVIF (support transparency) or keep PNG.

## Performance audit checklist

- [ ] All images use AVIF or WebP with fallback
- [ ] All images have `width` and `height` (or aspect-ratio CSS)
- [ ] Below-fold images use `loading="lazy"`
- [ ] LCP image uses `fetchpriority="high"` and is NOT lazy-loaded
- [ ] LCP image is preloaded in `<head>`
- [ ] Responsive `srcset` with appropriate `sizes`
- [ ] CDN serves images with proper cache headers
- [ ] No images >500KB above the fold
- [ ] Total above-fold image weight <800KB
- [ ] Animated content uses video, not GIF
- [ ] Placeholder strategy in place (color, blurhash, etc.)
- [ ] Image variants generated for each product

## Anti-patterns

- ❌ Original 4000×3000 image displayed at 400×300 (waste)
- ❌ Lazy-loading the hero image
- ❌ No `width`/`height` → CLS
- ❌ JPEG quality 100 (overkill, 2× the bytes)
- ❌ PNG for photos (10× larger than JPEG)
- ❌ Background image for LCP element
- ❌ Loading all gallery images upfront
- ❌ Different sizes for desktop vs mobile but same image URL (no responsive)
- ❌ GIFs (use video)
- ❌ No CDN (slow worldwide loads)
- ❌ One global "high quality" for all images (some don't need it)
- ❌ Manual variant generation per upload (use Sharp/Imgix/etc.)
- ❌ CDN with no edge caching (defeats purpose)
- ❌ Hot-linking images from external sites (no control over performance or availability)
