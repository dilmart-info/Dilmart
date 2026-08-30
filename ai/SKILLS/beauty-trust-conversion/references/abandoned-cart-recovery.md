# Abandoned Cart Recovery

70% of online carts are abandoned. Beauty marketplaces, especially in MENA, see higher abandonment because users compare prices, ask family, wait for sales, hesitate on payment, or get distracted. A solid recovery program brings 8-15% of abandoned carts back to purchase. Here's how to build it.

## Define abandonment

Cart abandonment: user added items, didn't complete checkout, hasn't returned in N minutes/hours.

Checkout abandonment: user reached checkout but didn't pay.

Both deserve recovery. Treat slightly differently.

## Why people abandon

Common reasons:
1. **Shipping costs revealed at checkout** — highest cause
2. **Forced account creation**
3. **Long/complicated checkout**
4. **Price comparison** ("let me check competitors")
5. **Distraction** ("kid woke up", "phone died")
6. **Payment concerns** ("not sure about this site")
7. **Discount code search** ("there must be a code")
8. **Saving for later** ("not ready to buy now")
9. **High total** ("more than I wanted to spend")
10. **Stock anxiety** ("worried about authenticity")

Recovery campaigns address #5-10 well. #1-4 must be fixed in the flow itself.

## The recovery sequence

### Timeline

```
T+0: Cart abandoned
T+1h: First reminder email
T+24h: Second email (with light incentive)
T+72h: Third email (final, may include discount)
T+7d: Stop
```

Frequency caps:
- Max 3 cart-recovery emails per cart
- After purchase: stop (obvious but verify)
- After explicit unsubscribe: stop forever

### Email 1: Gentle reminder (1 hour)

```
Subject: You left something behind

Hi Sarah,

You added these items to your cart — they're saved for you.

[items with images, names, prices]

[ Complete your order ]

Why shop with Beauty Marketplace:
✓ Free returns within 30 days
✓ 100% authentic
✓ Fast MENA-wide delivery

Need help? Reply to this email.
```

Tone: helpful, not pushy. No discount yet — many buyers complete without incentive.

### Email 2: Address concerns (24 hours)

```
Subject: Still thinking about [product name]?

We get it — life happens. Your cart is still here.

[items]

Common questions:
Q: Is shipping really free over AED 100?
A: Yes! Your order qualifies.

Q: How long for delivery?
A: 2-5 business days to UAE, Saudi, Egypt.

Q: What if I don't like it?
A: 30-day free returns.

[ Complete your order ]
```

Tone: answer objections proactively.

### Email 3: Discount (72 hours)

```
Subject: 10% off your cart — for the next 48 hours

We saved your cart and added something extra: 10% off.

Use code: SAVE10
Expires in 48 hours.

[items with discount applied]

[ Use the code ]
```

Discount: 5-15% typically. More for higher-value carts.

After this: stop. Don't pursue indefinitely (annoying, ineffective).

## SMS recovery (MENA-specific)

SMS is HUGE in MENA. Higher open rates than email (>90%).

```
Beauty Marketplace: Your cart is waiting. Free shipping included. 
Complete: bma.io/c/A7F9
```

Keep under 70 chars (1 SMS message).

When to use SMS:
- High-value cart (>AED 200) abandoned
- User explicitly opted into SMS marketing
- 24 hours after abandonment
- Once (no SMS spam)

## WhatsApp recovery (massive in MENA)

WhatsApp Business API allows official messages:

```
[Beauty Marketplace logo]

Hi Sarah! 👋

You left items in your cart. Need help completing your order?

🛍 [Anti-dandruff Shampoo] - AED 89
🛍 [Hair serum] - AED 78

[ Complete order ]   [ Chat with us ]

Reply STOP to opt out.
```

Compliance:
- Pre-approved templates (Meta requires)
- 24-hour customer service window for free replies
- Opt-out mechanism

Conversion rate for WhatsApp: 25-40% vs 5-10% email. Massive.

## Push notifications

For PWA / native app users:

```
[Beauty Marketplace icon]
Your cart is waiting
Anti-dandruff Shampoo + 1 more item ready for checkout
```

Tap → opens cart.

Frequency: same as email (max 3 per cart, then stop).

Don't push notification users who haven't engaged in 30+ days (they'll uninstall).

## In-app recovery

When user returns to site after abandoning:

```
Banner at top:
"Welcome back! Your cart has 2 items waiting. [ View cart ]"
```

Less intrusive than email but timely.

If user has notification permission, optionally show:

```
Slide-down notification:
"Picking up where you left off? Your cart: [items]"
```

## Exit-intent popups (use carefully)

When user moves mouse toward browser close/back button:

```
┌────────────────────────────────────┐
│  Wait! Don't leave with empty hands │
│                                      │
│  Get 10% off your first order       │
│  Code: WELCOME10                     │
│                                      │
│  [ Use the code ]   [ No thanks ]   │
└────────────────────────────────────┘
```

Caveats:
- Once per session (not on every page)
- Doesn't work on mobile (no mouse to track)
- Some users find them annoying
- A/B test if effective for your audience

In MENA: less effective than email/WhatsApp. Don't over-rely.

## Personalization

### Show abandoned items prominently

In recovery email:
- Include images
- Show current price (in case it dropped)
- Show stock status (if low, mention)
- Show savings if discount is offered

### Recommend alternatives

If item is OOS:
```
The shampoo you wanted is out of stock. Here are similar options:
[grid of similar products]
```

### Adjusted messaging based on cart value

Low cart (<AED 100):
```
"Almost there — add one more item for free shipping"
```

Mid cart (AED 100-300):
```
"Your cart is ready"
```

High cart (>AED 300):
```
"VIP customer service available — chat with us anytime"
```

## Stock-based urgency

If items in cart are low-stock or selling out:

```
⚠ One item in your cart is selling fast:
[Anti-dandruff Shampoo — only 3 left]

[ Complete order ]
```

Honest stock alerts work. Don't fake low stock.

## Price drop alerts

If price drops on item in abandoned cart:

```
Subject: Price drop — your wishlist item just got cheaper

Anti-dandruff Shampoo
Was: AED 89
Now: AED 67 (24% off — sale ends Sunday)

[ Buy now ]
```

Reactivate users who wanted the item but balked at price.

## Restocking notifications

When an OOS item user wanted is restocked:

```
Subject: Back in stock — Anti-dandruff Shampoo

Get it before it sells out again!

[ Buy now ]
```

User signed up: receive notification.

## Save for later

In cart, offer "Save for later":

```
[Items in cart]

Move items to wishlist:
[ Save Anti-dandruff Shampoo for later ]

[ Continue shopping ]
[ Checkout ]
```

Some users don't want to abandon — they want to "pause."

Wishlist becomes saved-for-later list. Notifications when:
- Price drops
- Goes on sale
- Stock alert
- Reminded to buy

## Win-back campaigns (long-tail abandonment)

After T+7 days, stop cart-specific outreach. Move user to general win-back:

Email 30 days after abandonment:

```
Subject: Sarah, we miss you

It's been a while. Here are some new arrivals we think you'll love:

[curated grid based on past behavior]

[ Shop now ]
```

Not about the specific cart — about staying connected.

## Recovery analytics

Track:
- **Abandonment rate** (% of carts that don't convert within 24h)
- **Recovery rate** (% of abandoned carts that ultimately purchase)
- **Email open rate, click rate, conversion rate**
- **SMS / WhatsApp rates**
- **Cost per recovered order**
- **Time-to-recovery distribution**

By segment:
- New customer vs returning
- Low cart value vs high
- Mobile vs desktop
- By traffic source

Optimize: which messages work? Which intervals? Which incentives?

## A/B testing

Test:
- Subject lines ("You left something" vs "Complete your order")
- Timing (1h vs 4h for first email)
- Incentive levels (0%, 5%, 10%, 15%)
- Channels (email-only vs email+SMS)
- Tone (helpful vs urgent)
- Image vs text-heavy

## Compliance

### GDPR / Privacy

Recovery emails are "legitimate interest" usually, BUT:
- Must give clear opt-out
- Honor opt-out immediately
- Don't sell email data

For MENA:
- UAE Data Protection Law: similar to GDPR
- Saudi PDPL: explicit consent required for marketing
- Always provide easy unsubscribe

### Consent for SMS / WhatsApp

Requires explicit opt-in (separate from email).

```
[ ] Send me SMS updates about my orders
[ ] Send me marketing SMS (optional)
```

WhatsApp: requires opt-in AND 24-hour customer service window or template approval.

### Suppression

After unsubscribe:
- Suppression list, never email again
- No "but we sent only transactional" arguments
- Easy resubscribe option if user comes back

### Frequency cap

Across all channels:
- Max 1 marketing message per day
- Max 5 per week
- Reset after purchase or active engagement

## Technical implementation

### Trigger detection

```ts
// Watch for cart abandonment
async function checkAbandonedCarts() {
  const abandonedCarts = await db.cart.findMany({
    where: {
      itemCount: { gt: 0 },
      updatedAt: { lt: oneHourAgo },
      user: { 
        emailVerified: true,
        marketingConsent: true,
      },
      // Haven't sent recovery email yet for this state
      lastRecoveryAt: { 
        OR: [
          null,
          { lt: cart.updatedAt }
        ]
      }
    },
    include: { user: true, items: { include: { product: true } } }
  });
  
  for (const cart of abandonedCarts) {
    await sendRecoveryEmail(cart);
    await db.cart.update({
      where: { id: cart.id },
      data: { lastRecoveryAt: new Date() }
    });
  }
}

// Run every 30 minutes
setInterval(checkAbandonedCarts, 30 * 60 * 1000);
```

### Email service

Use a transactional + marketing email service:
- SendGrid
- Mailgun
- Postmark
- Resend
- Amazon SES

For marketing automation:
- Klaviyo (e-commerce focused)
- Customer.io
- Iterable
- Braze
- Active Campaign

Integrate with marketplace via APIs / webhooks.

### Identifier requirement

Anonymous users (no email): can't recover. Solutions:
- Encourage email capture early (newsletter signup, wishlist)
- "Save my cart" with email
- Use cookies for in-app recovery banner (no email needed)

### Cross-device

User adds on mobile, abandons, opens desktop. Cart should sync:
- Logged-in users: server-side cart, syncs automatically
- Anonymous users: can't sync; offer to log in to sync

## Vendor coordination

If cart includes items from multiple vendors:
- Single recovery message covers all
- Discount applies to whole cart (or specific items)
- Track per-vendor recovery rate

## Cultural sensitivity in MENA

### Tone

- Warm, helpful, not pushy
- Avoid pressure tactics
- Use Arabic in Arabic-locale customers
- Address by first name only

### Timing

- Avoid prayer times (5 daily prayers; varies by country)
- Avoid Ramadan late-night (people break fast, eat, sleep)
- Avoid Friday morning (prayer)
- Best times: 10 AM - 1 PM and 7 PM - 10 PM local

### Content

- Family-oriented framing where appropriate ("perfect gift for mom")
- Halal references where relevant
- No imagery offensive in religious context
- Modest copywriting

## Anti-patterns

- ❌ Spammy frequency (5+ emails per cart)
- ❌ Aggressive discount escalation ("first 5%, then 10%, then 20%!")
- ❌ Recovery emails to users who already purchased
- ❌ Recovery emails to users who unsubscribed
- ❌ Stale recovery (items shown but now out of stock or price changed)
- ❌ Generic "your cart" emails without showing what's in it
- ❌ Fake urgency ("only 1 left!" when there's 100)
- ❌ Exit popups that prevent navigation (some browsers block)
- ❌ SMS without explicit consent
- ❌ WhatsApp messages without approved template
- ❌ Different recovery offers to similar users (looks unfair when shared)
- ❌ No way to unsubscribe from recovery emails
- ❌ Continuing recovery campaigns after long period (>2 weeks)
- ❌ Recovery emails that aren't mobile-friendly
- ❌ Tracking that follows users to email and back without disclosure
- ❌ Not handling timezone correctly (4 AM emails to MENA users)
- ❌ Same discount code used by all users (some pass it around indefinitely)
- ❌ Discount code that doesn't actually work
- ❌ Recovery via push notification when user has app open (use in-app instead)
- ❌ Marketing emails from address that doesn't accept replies
