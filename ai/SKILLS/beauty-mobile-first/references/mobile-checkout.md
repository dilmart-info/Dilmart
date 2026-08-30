# Mobile Checkout

Mobile checkout is where revenue is won or lost. 70%+ of mobile commerce traffic in MENA reaches checkout, but completion rates can drop 30% from the cart-to-order step on a bad checkout. Every interaction needs to feel like progress, not friction.

## The mobile checkout philosophy

1. **One page, scrollable** — not multi-step wizard
2. **Smart accordion sections** — only what's needed, when it's needed
3. **Sticky bottom CTA** with always-visible price
4. **Single-finger operable** entirely
5. **Pre-fill aggressively** — addresses, contact, payment method
6. **Show progress visually**, even without explicit steps
7. **Fail gracefully** — never lose data, always allow retry

See companion `beauty-checkout-flow/references/checkout-shell.md` for the desktop comparison; this doc is mobile-specific.

## Page structure

```
┌──────────────────────────┐
│ ← Back     Checkout    🔒 │  ← minimal header
├──────────────────────────┤
│                          │
│  1. Contact              │  ← collapsed once complete
│  ✓ sarah@example.com     │
│  ✓ +971 50 *** ****   ✏ │
│  ─────────                │
│                          │
│  2. Delivery             │  ← currently open
│  📍 Shipping to:          │
│  ▾ [Select address]      │
│                          │
│  Method:                 │
│  ⚪ Standard (3-5d) FREE  │
│  ⚪ Express (1-2d) AED 25 │
│                          │
│  ─────────                │
│                          │
│  3. Payment              │  ← not yet
│  ▾ Select method         │
│                          │
│  ─────────                │
│                          │
│  Order summary           │
│  [items thumbnails]      │
│  Subtotal      AED 267   │
│  Discount     -AED  27   │
│  Shipping      AED  25   │
│  Tax           AED  13   │
│  Total         AED 278   │
│                          │
├──────────────────────────┤
│  AED 278.62              │  ← sticky bottom
│  [    PLACE ORDER    ]   │
└──────────────────────────┘
```

## Header

```
┌──────────────────────────┐
│ ← Back     Checkout    🔒 │
└──────────────────────────┘
```

Components:
- **Back button** (left) — returns to cart
- **Title** "Checkout" (center)
- **Lock icon** (right) — visual trust signal, can be tapped to see security details

No bottom nav on checkout. Single-purpose page.

No top nav menu, no cart icon (you're already past the cart).

## Section behavior

Sections expand one at a time, others collapse to summary view.

### Open section (in progress)

```
2. Delivery
─────────

Shipping address:
┌────────────────────────────┐
│ Villa 42, Jumeirah         │
│ Dubai, UAE                 │
│ +971 50 *** ****           │
│                  [Change]  │
└────────────────────────────┘

Delivery method:
⚪ Standard (3-5 days)    FREE
⚪ Express (1-2 days)   AED 25
⚪ Same-day               AED 35

[Continue →]
```

### Collapsed section (complete)

```
1. Contact  ✓
sarah@example.com  ✏️
```

Tap pencil to re-edit. Tapping the row also re-opens.

### Disabled section (not yet reached)

```
3. Payment

Complete the previous steps to proceed.
```

Gray, no interaction.

## Order summary at the bottom

The order summary is at the bottom of the page (NOT collapsed at the top).

Why bottom?
- Trust: customer sees what they're paying for as they fill in details
- Reduces "but where does it show what I'm paying?" anxiety
- Always one quick scroll away

Tap to expand/collapse item list:

```
Order summary  ▾                    AED 278.62
─────────

[image] Product A × 2     AED 178
[image] Product B         AED  89
+1 more item

Subtotal           AED 267.00
Discount (NEW10) -AED  26.70
Shipping            FREE
VAT (5%)           AED  12.78
─────────
Total              AED 278.62
```

## Sticky bottom CTA

The most important part of mobile checkout.

```
┌──────────────────────────┐
│  AED 278.62              │
│  [    PLACE ORDER    ]   │  ← full-width, 56px tall
└──────────────────────────┘
```

### States

| State | Appearance |
|---|---|
| Disabled (sections incomplete) | Grayed button, label: "Complete checkout to place order" |
| Ready | Primary color, label: "Place order" |
| Processing | Spinner inside button, label: "Processing..." |
| Success | Brief green flash before redirect |

### Price label

- Total in large font, prominently visible
- "Including VAT, free shipping" (small) below if applicable
- Currency code: "AED" not just "د.إ" for clarity

### Loading state

```
┌──────────────────────────┐
│  AED 278.62              │
│  [   ⏳ Processing...   ] │  ← disabled, spinner
└──────────────────────────┘
```

User cannot tap again. Other UI can be slightly dimmed.

### Failure state

If payment fails:

```
┌──────────────────────────┐
│  AED 278.62              │
│  ⚠ Payment failed.        │
│  [    TRY AGAIN     ]    │
└──────────────────────────┘
```

Inline error message above CTA, retry button.

## Form patterns

### Address selection

If user has saved addresses:

```
Shipping to:
┌──────────────────────────┐
│  ◉ Sarah Mohammed         │
│    Villa 42, Jumeirah     │
│    Dubai, UAE             │
│    +971 50 *** ****       │
└──────────────────────────┘
┌──────────────────────────┐
│  ◯ Office                 │
│    Sheikh Zayed Rd        │
│    Dubai                  │
└──────────────────────────┘

+ Add new address
```

Tap row to select. Active row has subtle highlight + radio button filled.

### Add new address (bottom sheet)

```
┌──────────────────────────┐
│  ━━                      │ ← drag handle
│                          │
│  New address             │
│                          │
│  Full name *             │
│  [                     ] │
│                          │
│  Phone *                 │
│  [+971  ][              ]│
│                          │
│  Country *               │
│  [UAE ▾]                 │
│                          │
│  Emirate *               │
│  [Dubai ▾]               │
│                          │
│  Area *                  │
│  [Search area...      🔍]│  ← Google Places
│                          │
│  Building/Street *       │
│  [                     ] │
│                          │
│  [  Save & use this  ]   │
└──────────────────────────┘
```

- Opens as full-screen bottom sheet (not modal)
- Auto-detect country from IP, suggest current location
- See `beauty-checkout-flow/references/address-forms.md` for country-specific specs

### Payment method selector

```
Payment method
┌──────────────────────────┐
│  ⚪ Card                  │
│     💳 Visa ending 4242  │
│     [Add another card]    │
└──────────────────────────┘
┌──────────────────────────┐
│  ⚪ Apple Pay             │ ← shown only on iOS Safari
│     Touch ID required    │
└──────────────────────────┘
┌──────────────────────────┐
│  ⚪ Tabby                 │
│     Pay in 4 — interest-free│
└──────────────────────────┘
┌──────────────────────────┐
│  ⚪ Cash on delivery      │
│     Pay when courier arrives│
│     +AED 10 COD fee       │
└──────────────────────────┘
```

Each method is a tappable card. Selected → expand inline for additional input if needed.

### Card details (when "Card" selected)

```
Card number *
[1234  ____  ____  ____ ]
                    💳 Visa

Cardholder name *
[                            ]

Expiry        CVV
[MM/YY]      [___]   ⓘ
```

- Numeric keypad opens for number, expiry, CVV
- Auto-format card number (4-digit groups)
- Brand icon appears as user types
- Auto-advance to next field on completion

### Promo code (collapsed by default)

```
[+ Promo code]
```

Tap → expands:

```
Promo code:
[                ] [Apply]

Or use one of your saved codes:
[ WELCOME10 ]  [ NEW20 ]
```

Saved codes from notifications / account.

## Guest vs logged-in

### Logged-in user

- Email/phone pre-filled (not editable here)
- Address dropdown shows saved addresses
- Payment dropdown shows saved cards
- Skip "Contact" section

### Guest

- "Contact" section first
- "Continue as guest" + "Login for faster checkout" link

```
Contact

Email *
[                            ]

Phone *
[+971 ▾] [                  ]

[ ] Send order updates to my email
[ ] Save my details for next time (create account after)

──────

Already have an account? [Log in]
```

## Validation

### Real-time per field

- Email: validate format on blur, show ✓ or error
- Phone: validate format inline
- Card: validate Luhn check after 16 digits entered
- Postal codes: format-validate per country

### No global form validation on submit

User shouldn't tap "Place order" and see a list of 5 errors. Highlight as they go.

### Error display

```
Email *
[invalid-email           ]
⚠ Please enter a valid email
```

- Red border on field
- Error message below field
- Icon ⚠ for visual cue
- Announce via aria-live for screen readers

## Performance

| Surface | Target |
|---|---|
| Checkout page LCP | <2.0s |
| Section expand/collapse | <100ms |
| Address autocomplete | <300ms |
| Payment form load | <500ms |
| Submit → confirmation | <3s |

### Pre-load checkout

When user adds to cart, pre-fetch checkout page resources in background:
- Address data
- Payment processor SDK
- Saved cards

When user taps "Checkout" from cart, page is already half-loaded.

### Code-split payment SDKs

Stripe.js, Tabby SDK, Apple Pay polyfill — load only the SDK matching selected payment method:

```js
const loadPaymentSDK = async (method) => {
  switch (method) {
    case 'card':
      return import('@/payment/stripe');
    case 'tabby':
      return import('@/payment/tabby');
    case 'tamara':
      return import('@/payment/tamara');
  }
};
```

## Network resilience

### Keep entered data alive

User in middle of typing card details → loses signal → comes back. Their data should be intact.

```js
// Save to sessionStorage as user types (debounced)
saveCheckoutDraft({
  contact: { email, phone },
  address: { ... },
  paymentMethod,
  cardDetails: null // NEVER save card details
});
```

Restore on page load.

### Offline indication

If user goes offline mid-checkout:

```
⚠ You're offline
We've saved your details. Place your order when you're back online.

[ Retry ]
```

Show banner; disable Place Order button.

### Slow connection / lie-fi

Common in MENA outside major cities:

```
⏳ Slow connection detected
Place Order will work when ready. Don't refresh the page.
```

Stay patient, allow retry, don't error out prematurely.

## Trust signals throughout

Subtle reassurances during checkout:

```
🔒 Your payment is encrypted

Order summary
✓ 100% authentic guarantee
✓ Free returns within 30 days
✓ Customer support: WhatsApp +971...
```

Just enough to nudge, not enough to clutter.

## 3DS / OTP screens

Many card payments in MENA require 3DS:

```
Verify your payment

Your bank is sending an OTP to your phone.
Enter the 6-digit code:

[      ][      ][      ][      ][      ][      ]

Didn't receive? Resend (30s)

This page is provided by your bank.
```

- Auto-detect OTP from SMS (Android/iOS support `autocomplete="one-time-code"`)
- After verification, return to checkout
- If user closes 3DS window: handle gracefully (retry button)

## BNPL flow

Tabby / Tamara redirect outside the marketplace site:

```
Continue to Tabby

You'll be redirected to Tabby to complete your purchase.
You'll come back here when done.

[ Continue to Tabby → ]
```

After redirect-back:
- Order placed if approved
- Show denial reason if rejected (and prompt to use different method)

## Confirmation transition

After successful order:

1. Brief success animation (✓ icon scales in with subtle haptic vibration)
2. Replace checkout content with confirmation
3. Show: order number, ETA, "Track order" CTA
4. Cart cleared from local state
5. Send analytics event

See `beauty-checkout-flow/references/order-confirmation.md` for details.

## Accessibility on mobile checkout

### Screen reader flow

```
Heading: Checkout
Step 1 of 3: Contact (in progress)
Email, required, edit: ...
Phone, required, edit: ...
Continue button: enabled when contact complete

Step 2 of 3: Delivery (not started, complete previous step first)
...
```

Announce step transitions via aria-live.

### Keyboard

External keyboard users (rare on mobile but possible — accessibility keyboards):
- Tab order: top to bottom, left to right
- Enter to advance/submit
- Escape to close modals/sheets

### Voice control

iOS Voice Control / Android Voice Access:
- Every interactive element needs a clear name
- "Tap Place Order" should work

## Anti-patterns

- ❌ Multi-step wizard with progress bar but no way to skip back
- ❌ Hiding fees until last step (price surprise)
- ❌ Force account creation before checkout (guest checkout mandatory)
- ❌ Card details opening as a new page (interrupts flow)
- ❌ Auto-applying coupons that change total without notice
- ❌ Bottom CTA that floats over keyboard
- ❌ Section transitions that cause content jumps (CLS)
- ❌ "Use my current location" without explaining why
- ❌ Promo code field prominent and empty (encourages users to search for codes — they leave)
- ❌ Saved payment methods that don't actually work (must be valid at use)
- ❌ Different look from rest of marketplace (jarring; trust drops)
- ❌ Long forms that lose data on refresh
- ❌ Forced cross-sells in middle of checkout (annoying)
- ❌ Cart edit links in checkout (return to cart instead)
