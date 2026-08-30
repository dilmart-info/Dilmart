# Review System

Reviews are the most powerful conversion lever after price. Users trust other customers more than brand claims. Designing the review system means deciding what to allow, what to verify, what to surface, and how to handle abuse. Get it wrong and trust collapses.

## The review system stack

A complete system includes:
1. **Collection**: Inviting reviews, capturing meaningful data
2. **Verification**: Verified buyer flag, fraud detection
3. **Display**: Sorting, filtering, summary stats
4. **Moderation**: Removing fake/abusive content
5. **Vendor response**: Allowing sellers to reply
6. **Helpfulness**: Voting on review utility
7. **Photos/video**: User-submitted media
8. **Q&A**: Pre-purchase questions

Each contributes to a trustable ecosystem.

## Data model

```sql
CREATE TABLE reviews (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  user_id UUID NOT NULL REFERENCES users(id),
  order_item_id UUID REFERENCES order_items(id), -- for verified flag
  
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  body TEXT NOT NULL,
  
  -- Verified buyer flag (derived from order)
  is_verified_buyer BOOLEAN NOT NULL DEFAULT false,
  
  -- Verification metadata
  verified_purchase_date TIMESTAMPTZ,
  verified_purchase_quantity INTEGER,
  
  -- Media
  photos JSONB DEFAULT '[]'::jsonb, -- array of URLs
  videos JSONB DEFAULT '[]'::jsonb,
  
  -- Skin/hair type and other beauty-specific
  reviewer_skin_type TEXT, -- 'oily', 'dry', 'combination', 'sensitive', 'normal'
  reviewer_hair_type TEXT,
  reviewer_age_range TEXT,
  reviewer_concerns JSONB,
  
  -- Engagement
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  
  -- Moderation
  status TEXT NOT NULL DEFAULT 'pending', -- pending | published | rejected | flagged
  moderated_by UUID REFERENCES users(id),
  moderated_at TIMESTAMPTZ,
  moderation_notes TEXT,
  
  -- Vendor response
  vendor_response TEXT,
  vendor_response_at TIMESTAMPTZ,
  
  -- Flags
  flag_count INTEGER DEFAULT 0,
  flagged_for TEXT, -- 'spam' | 'offensive' | 'fake' | 'irrelevant'
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one review per user per product
  UNIQUE(user_id, product_id)
);

CREATE INDEX idx_reviews_product ON reviews(product_id, status, created_at DESC);
CREATE INDEX idx_reviews_helpful ON reviews(product_id, helpful_count DESC) WHERE status = 'published';
CREATE INDEX idx_reviews_user ON reviews(user_id, created_at DESC);

CREATE TABLE review_helpful_votes (
  review_id UUID NOT NULL REFERENCES reviews(id),
  user_id UUID NOT NULL REFERENCES users(id),
  is_helpful BOOLEAN NOT NULL,
  voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (review_id, user_id)
);

CREATE TABLE review_flags (
  id UUID PRIMARY KEY,
  review_id UUID NOT NULL REFERENCES reviews(id),
  flagger_user_id UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT
);
```

## Verified buyer flag

Critical for trust. Only verified buyers' reviews get the badge.

```ts
function isVerifiedBuyer(userId: string, productId: string): boolean {
  return await db.orderItem.exists({
    where: {
      productId,
      order: {
        userId,
        status: { in: ['DELIVERED', 'COMPLETED'] }
      }
    }
  });
}
```

Display:
```
★★★★★  Sarah M. ✓ Verified Buyer
"Best shampoo I've ever used..."
```

Allow non-verified reviews? Marketplace choice. Pros of allowing: more reviews. Cons: trust dilution. Recommendation: allow but mark clearly.

## Review collection

### Post-delivery email

X days after delivery:
```
Subject: How was your order?

Hi Sarah,

Your order ORD-...-A7F9 was delivered last week.
We'd love to hear your thoughts!

[Anti-dandruff Shampoo]    [Hair Serum]
★ ★ ★ ★ ★                  ★ ★ ★ ★ ★
[ Write a review ]         [ Write a review ]
```

Click → opens review form pre-filled with product, with verified purchase.

Timing:
- 7 days: enough time to try the product
- 14 days: reminder if no response
- 30 days: final reminder
- After 30 days: stop asking

### In-app prompts

Banner on next visit after delivery:
```
You recently received [Product]. Share your experience? [ Review now ]
```

### Account → orders section

Each delivered order has "Review" button per item.

### Review form

Required:
- Star rating (1-5)
- Body (min 30 chars)

Optional:
- Title
- Photos (up to 5)
- Video (up to 30 seconds)
- Skin/hair type
- Recommend? (Yes/No)
- Specific attributes (depending on category)

Encourage but don't require detail. Required fields drop completion rate.

### Beauty-specific attributes

For makeup:
- "How did it look on you?"
- Skin tone (light/medium/deep)
- Skin type
- Coverage achieved

For skincare:
- "Did you see results?"
- Time to results (1 week / 1 month / 3 months / no change)
- Concerns it addressed

For hair:
- Hair type (curly/straight/wavy)
- Hair condition (oily/dry/normal)
- Concerns (frizz, breakage, dandruff, etc.)
- Worked for your hair?

These structured attributes power filtering: "Show me reviews from people with curly hair."

## Display

### Reviews section on PDP

```
Customer Reviews

★ ★ ★ ★ ☆  4.6 out of 5
Based on 1,247 reviews

Distribution:
★★★★★ ████████░░ 78%  (970)
★★★★☆ ███░░░░░░░ 14%  (175)
★★★☆☆ █░░░░░░░░░ 5%   (62)
★★☆☆☆ ░░░░░░░░░░ 2%   (25)
★☆☆☆☆ ░░░░░░░░░░ 1%   (15)

Filter by: [All] [5★] [4★] [3★] [2★] [1★] [With photos] [Verified only]

Sort by: ▼ Most helpful

─────────────────────────────────────────
★★★★★  Sarah M. ✓ Verified Buyer    2 weeks ago
Hair: Curly, dry  |  Concerns: Frizz, breakage

"Game changer for curly hair"

I've been using this for 3 weeks and my curls have never been so 
defined. The smell is amazing too. Highly recommend!

📷 [photo] [photo]

👍 Helpful (47)   👎 (2)   |  Report

─────────────────────────────────────────
★★★★☆  Ahmed K. ✓ Verified Buyer    1 month ago
"Good but pricey"

Works well, no complaints on the product itself. Just feels 
expensive for the size. Will buy again when on sale.

👍 Helpful (23)   👎 (1)   |  Report

Vendor response:
"Thanks Ahmed! Look out for our seasonal sales — 20% off coming 
in 2 weeks." — SkinCare Pro, 3 weeks ago

─────────────────────────────────────────

[ Load more reviews ]
```

### Summary at top of PDP

```
[Product Name]
[Brand]
★ 4.6 (1,247 reviews)    ← click goes to reviews section
```

Make the star bar clickable. User scrolls to reviews.

### Sort options

- **Most helpful** (default): helpful_count DESC
- **Most recent**: created_at DESC
- **Highest rated**: rating DESC, helpful DESC
- **Lowest rated**: rating ASC, helpful DESC
- **With photos**: filter to media-included

### Filter options

- Star rating (1-5 individually or "3 and above")
- With media (photo/video)
- Verified purchase only
- Skin type / hair type (beauty-specific)
- Sentiment (auto-tag: positive, neutral, negative)
- "Mention specific keyword" search

### Recently helpful

For products with many reviews (1000+), feature recently-promoted reviews:

```
Recently helpful:
[★★★★★ review marked helpful by 23 people in last week]
```

Keeps fresh content surfaced.

## Helpfulness voting

Each user can vote each review helpful/not-helpful once:

```jsx
function HelpfulButtons({ reviewId }) {
  const [voted, setVoted] = useState(null);
  
  function vote(isHelpful) {
    setVoted(isHelpful);
    fetch(`/api/reviews/${reviewId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ isHelpful }),
    });
  }
  
  return (
    <div>
      <button 
        onClick={() => vote(true)}
        aria-pressed={voted === true}
        disabled={voted !== null}
      >
        👍 Helpful ({helpfulCount})
      </button>
      <button 
        onClick={() => vote(false)}
        aria-pressed={voted === false}
        disabled={voted !== null}
      >
        👎 ({notHelpfulCount})
      </button>
    </div>
  );
}
```

Helpful votes drive "most helpful" sort and create incentive for quality reviews.

## Vendor responses

Sellers can respond to reviews:

```
Vendor response:
"Hi Sarah, thanks so much for your detailed review! We're 
thrilled to hear about your curls. If you want to try our new 
deep conditioner — it pairs perfectly with this — let us know!"
— SkinCare Pro, 5 days ago
```

Rules:
- Vendor can respond once per review
- Response visible alongside the review
- Vendor responses also subject to moderation
- Cannot delete or edit user's review (only respond)

Bad vendor responses:
- Defensive ("you used it wrong")
- Aggressive ("this is false")
- Begging for change ("please update to 5 stars")
- Off-topic promotion

Good vendor responses:
- Acknowledge feedback
- Offer help if there's an issue
- Thank for positive feedback
- Address specific concerns

## Moderation

### Auto-moderation

Block obvious violations:
- Profanity (filter list)
- Personal info (phone numbers, emails — regex match)
- Spam links
- Repeated text patterns
- Reviews under 20 chars
- Reviews submitted within 60 seconds of each other (rate limit)

### Manual moderation queue

Reviews flagged or auto-detected go to moderator queue:

```
Review Queue (47 items)
┌────────────────────────────────────────────┐
│ ★★★★★  by "user_xyz"  ⚠ 3 flags          │
│ "Best ever! Buy from FakeSite.com!"         │
│ [ Approve ] [ Reject ] [ Edit ]             │
└────────────────────────────────────────────┘
```

Moderators review and approve/reject within 24 hours.

### Rejection reasons

- Spam / promotion
- Off-topic
- Offensive language
- Personal information
- Suspected fake
- Irrelevant to product
- Vendor pretending to be customer

User notified of rejection with reason. Can revise and resubmit.

### Fake review detection

Heuristics:
- New account + immediate review (suspicious)
- Cluster of reviews from same IP
- Review pattern: same phrasing across accounts
- Reviewer rating distribution: all 5★ (unusual)
- Negative review on competitor + positive on this product (sock puppet)

ML models help; pattern matching catches most.

### Flagging system

Users flag reviews:

```
Why are you flagging this review?
- [ ] Spam or promotion
- [ ] Offensive or inappropriate
- [ ] Inaccurate or fake
- [ ] Off-topic
- [ ] Contains personal information

[ Cancel ] [ Submit ]
```

3+ flags → auto-hide pending review.

## Q&A section

Below reviews on PDP:

```
Questions about this product?

[ Ask a question ]

─────────────────────────────────────
Q: Is this suitable for color-treated hair?
   Asked by Layla, 1 month ago

A: Yes, this is safe for color-treated hair. The formula 
   is sulfate-free and won't strip color.
   Answered by SkinCare Pro (Verified Vendor), 1 month ago
   👍 Helpful (12)

A: I have color-treated hair and use this. Works great!
   Answered by Sarah M. (Verified Buyer), 3 weeks ago
   👍 Helpful (8)

─────────────────────────────────────
Q: How long does one bottle last?
   ...
```

Anyone can ask; vendor responds priority. Also customers/verified buyers can answer.

Q&A creates evergreen content useful for SEO and decision-making.

## Photos and videos

User-submitted media is gold for trust.

### Photo guidelines

Display in PDP:

```
Customer photos (47)

[grid of thumbnails — click to expand carousel]
```

### Photo gallery

Click any photo → modal carousel:
- Photo + review snippet
- Reviewer info (verified buyer flag)
- Filter by attributes ("see photos from people with curly hair")

### Video reviews

Short videos (30 seconds max):
- "Result after 1 month"
- "Application demo"
- "Texture/swatch"

Treated like photo reviews in display.

### Moderation for media

- No personally identifying close-ups (faces blurred or optional)
- No competing brands shown
- No inappropriate content
- Brand-direct vendors can request removal of competitor product mentions

## Aggregate ratings

Compute per-product rating:

```ts
function computeRating(reviews) {
  const published = reviews.filter(r => r.status === 'published');
  const sum = published.reduce((acc, r) => acc + r.rating, 0);
  return {
    average: sum / published.length,
    count: published.length,
    distribution: {
      5: published.filter(r => r.rating === 5).length,
      4: published.filter(r => r.rating === 4).length,
      3: published.filter(r => r.rating === 3).length,
      2: published.filter(r => r.rating === 2).length,
      1: published.filter(r => r.rating === 1).length,
    }
  };
}
```

Cache aggregates; recompute on new review:
- Increment counters incrementally
- Or batch-recompute on schedule

For "0 reviews" products, suppress the rating widget entirely. Don't show "0.0 stars."

## Display logic for new products

```
< 5 reviews:  "Be the first to review"
5-50:         show rating + count
50+:          show rating, count, distribution
1000+:        show all + "recently helpful"
```

## Vendor metrics from reviews

Vendor dashboard shows:
- Overall vendor rating (across all products)
- Per-product ratings
- Recent reviews (last 30 days)
- Review response rate
- Average response time

Reviews affect:
- Vendor search ranking
- Featured product eligibility
- Trust badge tier

Low vendor rating (<3.5★) triggers:
- Notification to vendor
- Coaching resources
- If sustained: marketplace review for action

## Display in Arabic

Reviews are user-generated content. Don't auto-translate (lossy).

```
RTL:
★★★★★  سارة م.  ✓ مشترٍ موثق   منذ أسبوعين
نوع الشعر: مجعد، جاف  |  المخاوف: التجعد، التكسر

"تغيير قواعد اللعبة للشعر المجعد"

استخدمته لمدة 3 أسابيع وتجاعيدي لم تكن أبدا بهذا الوضوح...

📷 [صورة] [صورة]

👍 مفيد (47)   👎 (2)   |  بلاغ
```

If review is in Arabic and user is in English UI: show original + "Translate" button (Google Translate).

If review is in English on Arabic UI: show original + Arabic translation option.

## Incentivizing reviews

Lightweight incentives:
- Points/credits per review ($1-3 worth)
- Photo bonus (extra points for media)
- "Top reviewer" badges (no money)

Strong rules:
- Incentive disclosed in review ("Reviewed with incentive")
- Cannot require positive review for incentive
- Cannot revoke incentive after negative review

Over-incentivizing → review quality drops, spam increases.

## Schema.org markup

For SEO and rich snippets in Google:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Anti-dandruff Shampoo",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.6",
    "reviewCount": "1247"
  },
  "review": [
    {
      "@type": "Review",
      "author": "Sarah M.",
      "datePublished": "2026-05-02",
      "reviewBody": "Game changer for curly hair...",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": "5"
      }
    }
  ]
}
</script>
```

Google shows stars in search results → CTR boost.

## Anti-patterns

- ❌ Allowing reviews without any purchase verification (becomes spam channel)
- ❌ Auto-deleting low-rated reviews ("the vendor will be sad")
- ❌ Letting vendors edit/delete customer reviews
- ❌ Buying fake reviews to seed initial products (caught = banned, reputation destroyed)
- ❌ Showing only positive reviews (users smell it)
- ❌ Hiding rating distribution (just showing average)
- ❌ "Filter by 1 star" disabled (users see this as suspicious)
- ❌ Verified badge without actual verification logic
- ❌ Photos in reviews not displayed (huge missed opportunity)
- ❌ Vendor response that argues with the reviewer
- ❌ No way to flag inappropriate reviews
- ❌ Reviews never moderated (spam takes over)
- ❌ Aggregate rating updated slowly (showing stale numbers)
- ❌ Reviewer skin/hair type optional but rarely surfaced for filtering
- ❌ Different rating scales across categories (5★ here, 10★ there)
- ❌ Incentivizing only positive reviews (review fraud)
- ❌ Q&A section unanswered for months
- ❌ Translation that mangles reviewer's intent
- ❌ Showing reviewer's full email or personal info
- ❌ Letting users review products they returned/refunded
