# Social Proof

Social proof is "others did this, so it must be good." Used honestly, it accelerates decision-making. Used dishonestly, it destroys trust faster than you can recover. The line between effective and manipulative is mostly about whether it's TRUE.

## Types of social proof

### Numerical
- Star ratings
- Review counts
- Sales counts ("47 sold this week")
- Visitor counts ("23 people viewing now")
- Wishlist counts ("Added by 2,341 people")

### Behavioral
- "Recently purchased" tickers
- "Trending now" labels
- "Customers also bought"
- "Frequently bought together"

### Reputational
- Brand logos showcased
- Press mentions
- Awards
- Influencer endorsements

### Authority
- Expert recommendations
- Certifications
- Professional approval

## Star ratings

The most universal social proof.

### When to display

- 5+ reviews: show full star rating
- 1-4 reviews: show review count without rating ("3 reviews — be the next!")
- 0 reviews: don't fake it; encourage

### Visual

PDP:
```
★ 4.6 (1,247)         ← stars filled per rating
```

Product card:
```
★ 4.6 (1.2k)          ← compact
```

Filled stars in gold (or whatever your accent color). Empty stars in light gray. Half stars work but precision below 0.1 is overkill.

### Display rounding

```
4.55 → 4.6 (display)  ← round to 1 decimal
4.6 → 4 full stars + ~60% of 5th star (visual)
```

Don't show stars below 1.0 (always at least 1). Don't show 0.0.

### RTL

Stars don't mirror — they're symmetric. But the FILL direction matters:

```
LTR: ★★★★☆ — fill from left
RTL: ☆★★★★ — fill from right
```

So a 4-star rating still shows 4 filled stars, starting from the "start" side (right in RTL).

## Review counts

```
★ 4.6 (1,247 reviews)
★ 4.6 (1.2k reviews)   ← compact
★ 4.6 (1.2k)            ← very compact
```

Use comma for thousands in LTR, locale-appropriate in Arabic (still comma for commerce).

For new products with few reviews:
```
3 reviews
```

Don't pad with "Be the first to review" if there are reviews — just show count.

## Sales counts

"X sold this week" is powerful for beauty:

```
🔥 47 sold this week
🛒 2,400+ sold lifetime
⭐ Top seller in shampoo
```

Compute server-side from real data. Update daily or weekly.

Thresholds:
- "X sold this week" — show if ≥10 in 7 days
- "X sold this month" — show if ≥50 in 30 days
- Lifetime — show if ≥500

Below thresholds: don't show (looks weak).

### "Trending" — be honest

Computed: sales acceleration vs. 30-day baseline:

```ts
function isTrending(productId) {
  const last7Days = getSalesCount(productId, 7);
  const previous30Days = getSalesCount(productId, 30) - last7Days;
  const baselineRate = previous30Days / 23; // per day
  const recentRate = last7Days / 7;
  return recentRate > baselineRate * 1.5; // 50%+ acceleration
}
```

Show "Trending" badge only on actually trending products.

## Bestseller badges

Top 5% (or top 10) products per category:

```
[Image]
🏆 #1 Bestseller in Shampoo
Anti-dandruff Shampoo
★ 4.7 (1,247)
AED 89
```

Display only ranked #1, #2, #3 with explicit positions. Use generic "Bestseller" badge for top 5%.

Update weekly. Top changes; don't freeze stale bestsellers.

For new products that lack history: "Trending" works better than "Bestseller."

## Viewing counts (real-time)

```
👀 23 people viewing this now
```

Computed:
```ts
async function getActiveViewers(productId) {
  // Redis key: viewers:product:{id}, set entries with TTL
  const count = await redis.zcount(`viewers:${productId}`, Date.now() - 5 * 60 * 1000, '+inf');
  return count;
}
```

Increment when user lands on PDP; remove on leave (or after 5 min TTL).

Display thresholds:
- 5+: show count
- 2-4: "A few people viewing"
- <2: don't show

NEVER fake this. Some sites show "27 viewing" on every product; users have learned to distrust.

## Recently purchased

A floating notification on PDP:

```
┌──────────────────────────────────────┐
│ 🛍 Layla in Riyadh just bought this  │
│ 2 minutes ago                         │
└──────────────────────────────────────┘
                                  [×]
```

Anonymous (first name only or initial), city (region-level), time.

Implementation:
- Subscribe to recent purchase events
- Show one at a time, rotate
- Dismissible
- Don't dominate the page

Honesty:
- Only real purchases
- Real timeframes (don't show "5 min ago" for an order from 2 weeks ago)
- Respect user privacy (use first name only, broad location)

## "Customers also bought"

Powerful cross-sell + social proof:

```
Customers who bought this also bought:

[product A]    [product B]    [product C]    [product D]
```

Computed: collaborative filtering on order data.

For each product, identify products co-occurring in past N orders. Rank by frequency.

Display 4-8 items. Lazy-load below the fold.

## "Frequently bought together"

PDP bundle:

```
Often bought together:

[hero product]  +  [item B]  +  [item C]
                                  
Total: AED 267 (Save AED 32 vs. buying separately)
[ Add all to cart ]
```

Subtle bundle discount encourages add-on. Common in beauty (cleanser + toner + moisturizer).

## Wishlist counts

```
💗 Added to wishlist by 2,341 people
```

Shows demand. Useful for unique products without many sales yet.

Threshold: 100+. Below that, looks weak.

## Brand logos

Homepage and trust pages:

```
Featured Brands

[L'Oréal]  [MAC]  [Estée Lauder]  [Nars]  [Charlotte Tilbury]
[Hourglass]  [Tatcha]  [Glossier]  [Drunk Elephant]
```

Recognized brands = trust by association. Use real licensed logos.

If most of your inventory is unknown brands, lead with categories instead, or showcase top brands you carry even if niche.

## Press mentions

Lower in trust section:

```
As featured in:
[Vogue Arabia]  [Hia Magazine]  [Cosmopolitan ME]  [Marie Claire]
```

Only with actual mentions. Don't fake. Link to articles if possible.

For local press in MENA: Hia Magazine, Sayidaty, Layalina, Vogue Arabia.

## Awards

For products that have won awards:

```
🏆 Allure Best of Beauty 2025
🏆 Cosmo Beauty Awards Winner
```

Show on PDP and product card. Awards are strong proxies for quality.

## Influencer endorsements

Carefully:

```
"My everyday go-to" 
— @SaraSara_beauty (1.2M followers)
```

With disclosed sponsorship:

```
"My everyday go-to" 
— @SaraSara_beauty (1.2M followers) #ad
```

Ethical: real endorsements with required disclosure. Reduces trust if it looks sponsored without disclosure.

## Expert recommendations

For science-backed products:

```
✓ Recommended by dermatologists
✓ Salon-grade formula
✓ Used in [salon name] in Dubai
```

Specific is better than generic. "Recommended by Dr. X" > "Recommended by experts."

Avoid "9 out of 10 doctors" unless you have actual survey data.

## Certifications

Display verified certifications:

```
✓ Halal Certified (UAE Halal Center)
✓ Cruelty-Free (Leaping Bunny)
✓ Vegan Society Certified
✓ Dermatologist Tested
✓ Allergy Tested
✓ Hypoallergenic
✓ Non-comedogenic
```

Link to certification body. Only certifications the brand legitimately has.

## Hashtag and UGC

Brand hashtags create social proof:

```
Tag your photos with #MyBeautyMP for a chance to be featured

[grid of recent customer photos from social]
```

Aggregated from Instagram, TikTok with permission. Powerful for visual products (makeup).

## In-app social proof patterns

### Activity feed on category pages

```
[Top of category]
🎉 5 people bought "Anti-dandruff Shampoo" this hour
💗 12 added it to wishlist
```

### Personalized social proof

```
"Recommended for you" — based on similar buyers
"People in Dubai are buying" — geographically tailored
"Trending in your age group"
```

Useful only with enough data. For new users with no history, fall back to general social proof.

## A/B testing social proof

Test:
- Showing review count vs not
- Star rating in product card or only on PDP
- "Recently viewed by X" — show or hide
- Bestseller badge styles
- "X sold this week" threshold (5 vs 10 vs 25)

Watch:
- Conversion rate
- Time on page (more is usually good for engagement)
- Cart abandonment (some patterns annoy)

## Cultural considerations for MENA

### Less aggressive

Western e-commerce often uses pushy social proof ("BUY NOW!! ONLY 2 LEFT!!"). MENA users find this off-putting.

Better in MENA:
- Subtle counts ("47 sold this week")
- Reviews emphasized over urgency
- Family-oriented testimonials ("My mom loves it")
- Modest, factual tone

### Authenticity emphasis

Tie social proof to authenticity:

```
1,247 verified buyer reviews
98% would recommend
4.7★ from real customers
```

The "verified" framing matters more than in Western markets.

### Religious context

For Ramadan, Eid: feature gift sets, family-bundle suggestions. Social proof works ("Most-gifted for Eid").

Avoid social proof that emphasizes individual indulgence over family/community.

### Trust mediated by reviews

Western consumers might buy on price + rating alone. MENA consumers often:
1. See reviews on marketplace
2. Cross-check on Instagram
3. Ask friends/family
4. Then purchase

Make reviews shareable to Instagram/WhatsApp. Add "Share" button on individual reviews.

## Dark patterns to avoid

### Fake activity counters

```
"23 people viewing this NOW!!"
```

When the number is hardcoded or randomized. Users notice ("It's always 23"). Trust collapses.

### Fake countdown timers

```
"This deal ends in 12:48:33"
[Timer continues even after refresh]
```

When the deal doesn't actually end. Users feel manipulated.

### Fake "low stock"

```
"Only 1 left!!"
```

When inventory is actually 100+. Comes out eventually; brand image damaged.

### Fake reviews

Buying reviews. Always caught eventually. Account banned, legal liability.

### Sock puppet endorsements

Fake influencer endorsements. Same as fake reviews.

### Misleading "best of" claims

```
"Voted Best Shampoo of 2025"
[no actual voting happened]
```

Be specific. "Cosmo Beauty Awards 2025 Winner" — verifiable. "Best shampoo" — vague and likely false.

## Performance impact

Social proof elements often involve API calls:

- Recently purchased: needs real-time event feed
- Active viewers: needs WebSocket / SSE
- Sales counts: cached aggregates (5-min refresh)
- Reviews: SSR with cached data
- Bestseller: pre-computed daily

Don't load any of these synchronously above the fold. Defer / lazy-load.

```jsx
// Bad: blocking
<RecentPurchaseNotification productId={p.id} />

// Better: lazy-loaded
<Suspense fallback={null}>
  <RecentPurchaseNotification productId={p.id} />
</Suspense>
```

## Truthfulness checklist

For every social proof element, verify:

- [ ] Number is computed from real data (not hardcoded)
- [ ] Number is updated regularly (not stale)
- [ ] Display is accurate (not rounded up dishonestly)
- [ ] Source is traceable (we can prove the number to a regulator)
- [ ] Removed when no longer applicable (e.g., "Last week's bestseller" rotates)
- [ ] Threshold is sensible (don't show "1 sold this month" as bestseller)
- [ ] Privacy respected (no full names, exact addresses)
- [ ] Consent obtained (for testimonials, photos)

## Anti-patterns

- ❌ Fake viewer counts (hardcoded or randomized)
- ❌ Fake recent-purchase tickers (made-up customers)
- ❌ Star ratings without enough reviews ("5.0 from 1 review")
- ❌ Cherry-picked positive testimonials only
- ❌ "Bestseller" applied to every product
- ❌ Sales counts that suspiciously round numbers ("1,000 sold!")
- ❌ Brand logos used without permission
- ❌ Press mentions that didn't happen or aren't relevant
- ❌ Influencer endorsements without disclosure
- ❌ Customer photos used without consent
- ❌ Testimonials with no source / verification
- ❌ Outdated awards displayed prominently
- ❌ "X in their cart" inflation
- ❌ Aggressive Western-style urgency in MENA contexts
- ❌ Social proof that competes with reviews for attention (one or the other)
- ❌ Showing social proof on every page (less is more)
- ❌ Misleading ranking ("#1" without specifying category, timeframe, source)
