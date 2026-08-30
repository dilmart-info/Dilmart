# Return Policy UX

A generous, visible, friction-less return policy increases sales. Counterintuitively, people buy MORE when returns are easier — because the risk is lower. This document covers how to design return policies and the UI that surrounds them so they actually build trust and conversion.

## Policy fundamentals

### Window length

| Policy | Effect on conversion | Effect on return rate |
|---|---|---|
| No returns | Cratering conversion | (no returns possible) |
| 7 days | Slight conversion gain | Low return rate |
| 14 days | Solid conversion gain | Some returns |
| 30 days | Optimal for most | Manageable returns |
| 60-90 days | Diminishing gains | More returns |
| Unconditional / forever | Best conversion | Manageable still |

For beauty marketplaces: **30 days minimum**. Industry standard.

For some categories (unopened cosmetics): can extend.
For others (hygiene products opened): may restrict.

### Conditions

**Open vs. unopened**:
- Unopened: full refund
- Opened, beauty: trickier. Most marketplaces allow if defective.

**Hygiene products**:
- Eyeliner, lip products, masks: sometimes only if defective once opened
- Hair tools: refund if defective or unused
- Skincare: many allow opened returns for skin reactions (common)

**Damaged in transit**: always refundable.

**Wrong item received**: always refundable, free return shipping.

**Defective**: always refundable, free return shipping.

### Free return shipping?

Yes, when:
- Defective
- Wrong item
- Damaged
- "Not as described"

Sometimes when:
- Buyer's remorse (some marketplaces eat the cost; others charge restocking)
- Out of policy (likely the customer pays)

Charging return shipping signals "we don't trust you" — hurts trust.

For high-end beauty marketplace: offer free returns always, build cost into product margin.

## Display: where and how

### PDP — prominent

```
[Product info section]

✓ Free returns within 30 days
✓ 100% authentic guaranteed
✓ Ships in 1-2 days

[Add to cart]
```

Above the fold. Three lines max. Each linkable to detail.

### Mini info on cart

```
Your order qualifies for:
✓ Free shipping over AED 100 (you're qualified!)
✓ Free returns within 30 days
✓ Authentic guarantee
```

### Persistent in checkout

```
[Order summary sidebar]

Total: AED 163.80

What's included:
✓ Free returns within 30 days
✓ Authentic guarantee
```

### Footer

Link to full policy page.

### Help center

Top-level article: "Returns and refunds."

## Policy page layout

```
Returns & Refunds
==================

You can return most items within 30 days.

[ Start a return ]   [ Track a return ]

How it works
─────────────
1. Initiate the return in your account
2. We'll send you a return label (free for eligible returns)
3. Drop off the package at any Aramex location
4. Refund within 5-7 days after we receive it

Quick facts
─────────────
- Free returns for most items
- 30-day window from delivery
- Full refund to original payment method
- Or store credit (faster)
- Original packaging preferred but not required

Some restrictions apply for hygiene products. [See details ↓]

[Categories with restrictions]
- Opened lipsticks: only if defective or wrong item
- Used eye products: only if defective
- Customized items: not returnable
- Final sale items: not returnable (clearly marked)

[FAQ]
- How long does refund take?
- Do I need original packaging?
- What if the item arrived damaged?
- ...

Need help? [ Contact us ]
```

Clear sections, clear answers. Don't bury in legalese.

## Return initiation flow

User's account → Orders → individual order → "Return items"

```
Return items from order ORD-...-A7F9
─────────────────────────────────────

Select items to return:

[ ] Anti-dandruff Shampoo  (AED 89)
[ ] Hair serum             (AED 78)

Reason for return:
[ Wrong item ]
[ Item damaged ]
[ Defective ]
[ Doesn't match description ]
[ Changed my mind ]
[ Other (specify) ]

Add details (optional):
[                                          ]

Photos (optional, recommended for damaged/defective):
[ Upload ]

[ Continue ]
```

Simple. No interrogation. Generous defaults.

## After initiation

```
Return initiated ✓

Return ID: RET-20260530-A7F9
For items: Anti-dandruff Shampoo
Estimated refund: AED 89

What happens next:
1. We'll send you a return shipping label by email within 1 hour
2. Print the label and attach to the package
3. Drop off at any Aramex location or schedule pickup
4. We'll process refund within 5-7 days of receiving

[ Track this return ]
[ View shipping label ]
```

Clear next steps.

## Refund timeline

```
[Return tracking page]

Return RET-...A7F9
─────────────────

✓ Return initiated         May 16
✓ Label sent              May 16
✓ Package shipped         May 18
✓ Package received        May 20
○ Refund processed        Within 5-7 days
○ Refund completed         

Estimated refund: AED 89
Method: Original payment (Visa ending 4242)
Or: [ Switch to store credit (instant) ]
```

User sees progress. Estimated refund visible.

## Store credit option

Faster refunds via store credit = win-win:

```
Choose refund method:
( ) Original payment method (Visa ending 4242)
    Refund in 5-7 business days

(•) Store credit
    Refund instantly (use anytime, no expiration)
    + 10% bonus  (you'd get AED 97.90 instead of AED 89)
```

Pros for marketplace:
- Customer stays in ecosystem
- Faster processing (you control)
- Often results in higher-value re-purchase

Pros for customer:
- Instant
- Bonus

10% bonus is a reasonable incentive. Don't make it required ("only store credit") — that's coercive.

## Common return scenarios

### Damaged in shipping

```
Customer reports damaged

Photo proof attached
─────────────────

✓ Refund initiated immediately
✓ Customer keeps damaged item (don't bother returning)
✓ Replacement offered free (if available)
✓ Shipping carrier filed claim
```

Don't make customer ship back damaged item. Saves their time, no real loss.

### Wrong item received

```
Customer reports wrong item

✓ Free return label sent
✓ Replacement shipped immediately (don't wait for return)
✓ Full apology
✓ Investigate with vendor
```

Treat customer as priority.

### Defective product

```
Customer reports defect

✓ Refund initiated
✓ Free return label
✓ Replacement offered
✓ Documentation request for warranty claim (if applicable)
✓ Vendor notified for QC investigation
```

### Buyer's remorse

```
Customer wants to return (just changed mind)

✓ Allow return (within 30 days)
✓ Free return shipping (for premium tier marketplaces)
✓ Original payment method or store credit (+ 10% bonus)
```

Generous policy here = customer trust.

### Hygiene exception

```
Customer wants to return opened lipstick

⚠ Hygiene products can't be returned once opened
   UNLESS defective.

[ Was this item defective? ]
[ Did it arrive damaged? ]

If yes → standard return process.
If no → not eligible for return. Explain clearly.
```

Be polite. Offer alternatives:
- Store credit (smaller amount, gesture of goodwill)
- Coupon for next purchase

## Vendor-side returns

When customer initiates return, vendor sees:

```
[Vendor dashboard → Returns]

Return RET-...A7F9
Order: ORD-...-A7F9
Customer: Sarah M.
Reason: Damaged in transit

Photos:
[customer's photos]

Action required: None — marketplace handling
Notification: Refund processed; product returned to your warehouse on May 22

Comments: 
The seal on the bottle was broken on arrival. Vendor should 
inspect carton sealing process.
```

Vendor sees customer feedback. Marketplace handles the refund payment to customer.

Vendor pays for return if vendor's fault (depending on policy):
- Damaged in vendor's warehouse: vendor pays
- Damaged in transit: shipping insurance / shared
- Buyer's remorse: marketplace eats it (for premium experience)
- Wrong item: vendor pays

Vendor inventory restocks if item is resaleable.

## Returns analytics

Marketplace tracks:
- **Return rate** per product
- **Return rate** per vendor
- **Return reasons** distribution
- **Time to refund**
- **Customer satisfaction** with return process

Vendor with high return rate (>15%) → investigation. May indicate:
- Poor product quality
- Misleading description
- Wrong items shipped
- Bad packaging

Product with high return rate → review listing, possibly remove.

## Restocking fees

For some categories, restocking fees can apply:

```
Restocking fee: AED 10 (clothing returned to like-new condition)
```

For beauty: avoid restocking fees. Confusing, hurts trust.

If you must use them:
- Disclose UPFRONT (on PDP, not at return time)
- Apply only to specific categories
- Clearly labeled

## Display restrictions clearly

If something can't be returned, mark it:

```
[Product card]
Final Sale — cannot be returned

[PDP]
⚠ This item is FINAL SALE.
  No returns or exchanges.
  Make sure this is what you want.
```

Don't bury this. Surface it during decision-making.

## RTL display

```
RTL Arabic UI:

سياسة الإرجاع
=============

يمكنك إرجاع معظم المنتجات خلال ٣٠ يوماً.

[ بدء عملية إرجاع ]   [ تتبع الإرجاع ]

كيف يعمل
─────────
١. ابدأ عملية الإرجاع من حسابك
٢. سنرسل لك ملصق الإرجاع (مجاناً للحالات المؤهلة)
٣. سلّم الطرد في أي فرع أرامكس
٤. سيصلك المبلغ خلال ٥-٧ أيام بعد استلامنا للطرد

✓ إرجاع مجاني لمعظم المنتجات
✓ نافذة ٣٠ يوماً من تاريخ الاستلام
✓ استرداد كامل للمبلغ بنفس طريقة الدفع
```

## Trust through visibility

The point of all this: even if a customer NEVER returns anything, knowing they CAN reduces purchase friction.

Display the policy:
- Multiple times in the flow
- In multiple forms (badge, link, sentence, full page)
- Translated
- Mobile-accessible

The 1-2% of customers who actually return: serve them well.

## Edge cases

### Customer claims didn't receive item

```
Investigation:
- Check tracking (delivered to address?)
- Check delivery photo (carrier should provide)
- Check signature requirement
- Customer's claim
```

Resolution:
- Investigate within 48 hours
- If tracking shows delivered + no irregularities: complicated
- Usually: refund customer, vendor protected by carrier insurance / marketplace fund

Don't accuse customer of lying. Investigate, decide, communicate.

### Customer returns wrong items

```
We received your return for Anti-dandruff Shampoo, but the 
package contained a different item: [item received]

Please contact support so we can sort this out.

[ Contact support ]
```

Patient resolution. Don't penalize unless pattern.

### Customer returns empty box

Photo evidence on return processing. If empty → no refund.

## Cultural considerations

In MENA, generous return policies are particularly trust-building because:
- Counterfeit fear addressed (returnable if fake)
- COD culture means user pays AFTER inspection
- Word-of-mouth driven (one good return story = ~10 sales)

Show off your return policy more aggressively in MENA than you might in the West.

## Email communications

Post-purchase email mentions return policy:

```
Subject: Order delivered ✓

Your order has been delivered.

Returns: Within 30 days, free returns. Easy to initiate from 
your account.

Need help? Reply to this email.
```

Mid-window email (day 20, if no return started):

```
Subject: How are you liking your order?

Just checking in! If anything isn't right, you have until [date] 
to return it. Free returns, hassle-free.

[ Need to return something? ]
```

Subtle, helpful. Not pushing returns; just being transparent.

## Anti-patterns

- ❌ Return policy buried in footer (3+ clicks to find)
- ❌ Legal jargon that scares users
- ❌ Confusing "case by case" policy (just commit)
- ❌ Restocking fees as a default
- ❌ Customer pays return shipping for damaged item
- ❌ Refund-via-store-credit only (forced)
- ❌ Long refund timeline (>10 days)
- ❌ Requiring original packaging strictly
- ❌ No tracking for the return (customer in dark)
- ❌ Difficult initiation (call support to start)
- ❌ Hostile interrogation about why returning
- ❌ Different policies per vendor (confusing)
- ❌ "All sales final" by default (kills conversion)
- ❌ Lost return = no refund (poor customer service)
- ❌ Refund minus "processing fee" (unexpected)
- ❌ No mobile-friendly return initiation
- ❌ Hiding return policy from non-logged-in users
- ❌ Cheap return shipping that takes 2 weeks
- ❌ No translation of return process to Arabic
- ❌ Punishing customers who return often (banning) — review patterns, but don't auto-ban
- ❌ Saying "30 days" but actually 30 calendar days from order date (should be from delivery)
