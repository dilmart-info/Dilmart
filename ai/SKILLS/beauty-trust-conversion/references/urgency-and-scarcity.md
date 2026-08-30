# Urgency & Scarcity

Used honestly, urgency accelerates decisions. Used dishonestly, it's manipulation that destroys trust. The discipline here is harder than other trust signals because the pressure to "boost conversions" can lead to deploying patterns that work short-term but kill the marketplace long-term.

## The honesty test

Before deploying any urgency pattern, ask:

1. **Is the underlying claim true?** (e.g., is stock actually low?)
2. **Will it still be true tomorrow?** (e.g., is the sale actually ending?)
3. **Would I be comfortable explaining it to a regulator?**
4. **Does it pressure users into decisions they'll regret?**

If any answer is "no" or "maybe," redesign.

## Types of urgency

### Stock scarcity
"Only 3 left in stock"

### Time-limited
"Sale ends in 6 hours"

### Personal urgency
"Your cart will expire in 15 minutes"

### Demand signals
"Selling fast — added to 47 carts in the last hour"

### Restock alerts
"Only restocked 50 units, often sells out"

## Stock scarcity

The most common urgency pattern. Easy to do honestly.

### Display thresholds

```ts
function getStockMessage(stockCount: number): string | null {
  if (stockCount === 0) return 'Out of stock';
  if (stockCount === 1) return 'Only 1 left!';
  if (stockCount <= 3) return `Only ${stockCount} left in stock`;
  if (stockCount <= 10) return `Low stock — ${stockCount} left`;
  return null; // ≥10: don't show
}
```

Display thresholds:
- 1: "Only 1 left!" (strong)
- 2-3: "Only X left in stock"
- 4-10: "Low stock"
- 11+: no urgency message

### Visual

Subtle warning color (orange or muted red):

```
┌─────────────────────────────┐
│ Only 3 left in stock         │  ← muted orange/yellow
└─────────────────────────────┘
```

Don't use big red banners. Communicates "panic," looks aggressive.

### Multi-variant products

```
Color: Red — 12 left
       Blue — Only 2 left!   ← per-variant
       Green — Out of stock
```

Variant-level stock matters. Show in the variant picker, not just at top.

### Honesty rules

- Compute from actual inventory
- Update in real-time (or near real-time)
- "Out of stock" actually disables purchase
- Stock count visible to vendor in dashboard (so they can verify what you're showing)

### Edge cases

#### Stock rapidly changing during checkout

If user has 1 in cart and stock just sold out:

```
⚠ Stock just changed

This item is now out of stock. We've removed it from your cart.
The rest of your order is ready to check out.

[ Continue checkout ]  [ Browse similar ]
```

#### Stock low but not yet selling out

```
"Low stock — 5 left"
```

User hesitates → leaves → comes back day later → still 5 left.

Vendor restocked! Update accordingly. Show:

```
"Back in stock — limited quantities"
```

(Only if true — vendor confirmed restock.)

## Time-limited offers

```
🔥 Sale ends in 6h 42m 17s

Anti-dandruff Shampoo
~~AED 159~~  AED 89 (45% off)
```

Strong if true. Disastrous if fake.

### Honesty rules

- Real sale period (start and end times committed)
- After end time: sale ACTUALLY ends, price returns to regular
- No fake countdown (when refreshed, doesn't reset to 12 hours)
- No "extending the sale" indefinitely

### Implementation

```jsx
function SaleCountdown({ endsAt }) {
  const [remaining, setRemaining] = useState(calcRemaining(endsAt));
  
  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(calcRemaining(endsAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);
  
  if (remaining.expired) return null;
  
  return (
    <div className="sale-countdown">
      🔥 Sale ends in {remaining.formatted}
    </div>
  );
}

function calcRemaining(endsAt) {
  const ms = endsAt - Date.now();
  if (ms <= 0) return { expired: true };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return {
    expired: false,
    formatted: `${h}h ${m}m ${s}s`,
  };
}
```

Server-side end time. Client-side display only.

### Honest sale types

**Flash sales**: short windows (4-12 hours). Real start and end.

**Daily deals**: changes daily at midnight. Predictable.

**Weekend sales**: Friday-Sunday. Honest.

**Seasonal**: end of season clearance. Months long, ok.

**Eid / Ramadan sales**: anchored to real dates.

### Dishonest patterns to avoid

❌ Countdown that resets every visit
❌ "24-hour sale" that runs every day
❌ "Last chance" that keeps showing up
❌ Adding fake "original price" to inflate discount

## Personal urgency

"Your cart will expire in 15 minutes" or "Your wishlist sale price expires in 24 hours."

### Cart expiration (rarely needed)

Usually unnecessary. Carts can live indefinitely.

Exception: time-limited inventory holds (e.g., user reserved a high-demand item):

```
You have this item reserved for 10:00 (mm:ss)
Complete checkout before time runs out.
```

If user reserves, real timer. After expiration, item returns to general inventory.

### Wishlist price drop expiration

```
"This item is on sale. Sale ends Sunday."
```

Not a manufactured urgency — just reminder of the real sale window.

### Limited offer ("once per customer")

```
"Limited offer: 20% off your first order. Use code: WELCOME20."
```

Honest if it's actually limited to first order.

## Demand signals

Shows demand without claiming scarcity:

```
"Added to 47 carts in the last hour"
"Top-selling shampoo this week"
"Trending in your city"
```

### Honesty rules

- Real counts
- Real timeframes
- Updated regularly

### Thresholds

- "Added to X carts in last hour" — only if X≥10
- "Selling fast" — only if velocity is genuinely high

### Display

Subtle:

```
🔥 Selling fast — 47 carts added in last hour
```

Not in your face. Information for decision-making.

## Restock urgency

When item is back after stockout:

```
✨ Back in stock — limited quantities

This sells out quickly. Last out-of-stock period was 4 days.
```

Honest scarcity:
- Real "back in stock" event
- Real historical stockout data
- Limited quantity verified

## Free shipping thresholds

Different kind of urgency — "you're so close":

```
You're AED 12 away from FREE delivery
[progress bar: ███████░░░ 80%]

Add an extra AED 12 to get free delivery
[suggested products under 12 AED]
```

Real threshold. User completes more often.

```
✓ You qualify for FREE delivery!
```

When user crosses threshold.

This isn't manipulation — it's reward feedback.

## Cart abandonment urgency (post-leave)

When user leaves with items in cart, follow-up:

Email 1 (1 hour later):
```
Subject: Your cart is waiting

You left these items behind. Don't worry — we saved them for you.

[items]

[ Complete your order ]

Free returns | Authentic guarantee | Fast delivery
```

Email 2 (24 hours later):
```
Subject: Still thinking about it?

Here's 10% off to make your decision easier.
Code: COMEBACK10

[items]

[ Use the code ]

Expires in 48 hours.
```

Email 3 (3 days later, if appropriate):
```
Subject: Last chance — your items might sell out

[items with stock warnings if applicable]

[ Complete checkout ]
```

Honesty:
- Discount actually works (real code)
- Items shown are still available
- Expiration is real

Don't:
- Send 10 emails
- Pretend items are about to sell out when they're not
- Send "your discount expires in 24 hours" then send another one tomorrow

## Subscription / auto-replenish urgency

For replenishable items:

```
"Reminder: Sarah, you've been using this shampoo for 60 days. 
Time to reorder?"
[ Reorder ]
```

Helpful, not urgent.

```
"Subscribe and save 10%"
```

Clearly framed: subscription benefit, not urgency.

## Combining urgency signals

Multiple urgency cues can compound:

```
Anti-dandruff Shampoo
[Image]
★ 4.7 (1,247)
~~AED 159~~ AED 89 (45% off — sale ends in 6h)
Only 3 left in stock
🔥 47 sold in last 24h
```

This is intense. Risk: looks like a scammy ad.

Better:
```
Anti-dandruff Shampoo
[Image]
★ 4.7 (1,247)
~~AED 159~~ AED 89
Sale ends Sunday
Only 3 left in stock
```

Two signals is plenty. Three is borderline. Four is desperate.

## RTL considerations

In Arabic, urgency phrases:

```
"Only 3 left!" → "متبقي ٣ فقط!" or "بقي ٣ فقط"
"Sale ends in 6h" → "ينتهي العرض خلال ٦ ساعات"
"Selling fast" → "نفاد سريع" or "بيع سريع"
"Back in stock" → "متوفر مجدداً"
"Limited quantities" → "كميات محدودة"
"Flash sale" → "عرض سريع"
"Last chance" → "آخر فرصة"
```

Direction-aware countdown:
```
LTR: 6h 42m 17s
RTL: ٦ساعات ٤٢دقيقة ١٧ثانية   or   6h 42m 17s (with Latin digits)
```

## Cultural considerations for MENA

MENA users tend to be more deliberate buyers. Aggressive urgency feels:
- Untrustworthy
- Pushy (cultural value: hospitality > pressure)
- Like a scam

Tone urgency DOWN by 30-50% vs Western e-commerce.

Better in MENA:
- Subtle stock warnings
- Real sale windows (Ramadan, Eid)
- Helpful reminders (refill time, sale ending)

Worse:
- "ACT NOW!!!"
- Big red countdown timers
- "DON'T MISS OUT"
- All-caps urgency

## Mobile-specific

Sticky bottom CTA with subtle urgency:

```
┌──────────────────────────────────┐
│  Only 3 left   |  [ Add to cart ] │  ← bottom of screen
└──────────────────────────────────┘
```

Don't intrude on content. Don't pop up modals with urgency claims.

## Position on page

PDP:
- Below price: stock indicator (if low)
- Above add-to-cart: sale countdown (if active)
- Below add-to-cart: "Selling fast" if applicable
- Footer of summary: shipping urgency

Don't pack the top with urgency. Let the price and image speak first.

## What NOT to do

### Fake countdown timers

```
Sale ends in 23:59:58
[Resets to 24:00:00 every day]
```

Caught quickly. Lose all trust.

### Fake stock counts

```
"Only 1 left!" [when there are 100 in inventory]
```

Vendors notice. Customer service complaints. Eventual exposure.

### Multiple "limited time" overlapping

```
- 24 hour flash sale (running for 6 months)
- "Limited time" code (no expiration)
- "Almost gone!" (always shown)
```

Pattern that signals everything is fake.

### "23 viewers" hardcoded

```
"23 people viewing this now"
[Always 23, every product, every load]
```

Users see through immediately.

### Manufactured FOMO

```
"Don't be the one who missed out!"
"Everyone is buying this!"
"You'll regret it if you don't!"
```

Borderline harassment. Manipulative.

## Regulatory concerns

Some jurisdictions ban dark patterns:
- EU's Digital Services Act
- California's Consumer Protection
- UAE's Consumer Protection Law (modest framework)
- Saudi Arabia CITC e-commerce regulations

Banned patterns may include:
- Fake countdown timers
- Fake stock claims
- Hidden subscription enrollment
- Forced consent ("click yes to continue")

Implications: even where not explicitly banned, regulators are watching. Better to be honest.

## Measuring urgency effectiveness

A/B test urgency variations:
- With vs without stock indicator
- "Only 3 left" vs "Low stock" vs no message
- Sale countdown size/position
- Free shipping threshold message

Watch:
- Conversion rate (immediate effect)
- Return rate (urgency-driven purchases more likely returned)
- Customer satisfaction (post-purchase survey)
- Repeat purchase rate (do they come back?)

Honest urgency can increase conversion 5-15%. Dishonest urgency can boost it 30% short-term but destroy LTV.

## Customer feedback

If users report:
- "Tricked by countdown"
- "Stock seemed wrong"
- "I felt pressured"

Audit. Fix. Compensate where appropriate.

## Anti-patterns

- ❌ Stock count that doesn't match real inventory
- ❌ Countdown that resets or extends
- ❌ "Last chance" on items that are restocked weekly
- ❌ Fake "X people viewing" counters
- ❌ Manufactured "X just bought" tickers
- ❌ Subscription auto-enrollment hidden as urgency
- ❌ All caps urgency screams
- ❌ Big red banners on every product
- ❌ Free shipping threshold revealed at checkout (not before)
- ❌ "Limited offer" that's been the offer for 6 months
- ❌ Cart expiration timer with no reason
- ❌ Multiple urgency cues overlapping (looks scammy)
- ❌ Different urgency claims per variant when shared inventory
- ❌ Email subject lines with fake urgency ("YOU'RE ABOUT TO LOSE 50% OFF!!!")
- ❌ Push notifications with urgency for non-cart users
- ❌ Same urgency message displayed for months (loses effect AND looks fake)
- ❌ Reactive urgency ("user about to leave" pop-ups with countdowns)
- ❌ Hiding "compare price" so original price seems higher
