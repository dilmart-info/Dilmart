# Payment Security Signals

The checkout page is the moment of maximum trust requirement. Users are typing credit card numbers. They've heard horror stories. Anything that feels off — slow load, weird URL, generic design, no security indicators — and they bail. Even when your security is rock-solid, you have to communicate it.

## Foundation: actual security

Before signaling: actually be secure.

### Required

- **HTTPS everywhere** — not just checkout
- **PCI DSS compliance** — for handling card data
- **Tokenization** — don't store raw card numbers
- **3-D Secure 2.0** — for additional auth
- **TLS 1.3** — modern cryptography
- **HSTS** — enforce HTTPS
- **Secure cookies** — `Secure; HttpOnly; SameSite=Lax`
- **CSP** — Content Security Policy headers
- **Rate limiting** — prevent brute-force
- **Fraud detection** — Stripe Radar, Cybersource, etc.

PCI compliance is non-negotiable for handling cards. Use payment providers (Stripe, Checkout.com, PayTabs) that maintain compliance for you — you handle far less data.

### Best practice

- Never log card numbers
- Use Stripe Elements / Checkout.com Frames (iframe-based; cards never touch your server)
- Validate inputs client + server
- Audit logs of all financial actions
- Encrypted at rest (database)
- Encrypted in transit (TLS)
- Regular security audits

## Signals that build trust

Communicate security visibly.

### URL bar (browser-provided)

```
🔒 beauty-marketplace.com
```

Users now look for the padlock. Without HTTPS, browsers show "Not secure" warnings — checkout converts to ~0%.

### SSL lock icon (in your UI)

```
┌──────────────────────────────────────────┐
│  🔒 Secure checkout                       │
│  Your payment information is encrypted     │
│  and never stored on our servers.          │
└──────────────────────────────────────────┘
```

Use a real lock icon, not the keyboard `🔒` emoji (rendering varies).

Place at the top of checkout.

### Trust seals (use carefully)

Logos that signal trust:

- Norton Secured / VeriSign (legacy but recognized)
- McAfee Secure
- TrustE
- BBB (US-centric)
- Visa Secure (3-D Secure)
- Mastercard ID Check
- PCI Compliance badge

For MENA:
- PayTabs (well-known regional payment processor)
- Mada (Saudi local card network)
- Tap Payments

Showing 6 trust badges = looks desperate or fake. Show 2-3 real ones.

### Payment method icons

Show accepted methods:

```
We accept:
[Visa] [Mastercard] [Amex] [Mada] [Apple Pay] [Tabby] [Tamara] [Cash on Delivery]
```

Recognized logos = familiarity = trust.

### "We don't store your card"

```
✓ Card information is encrypted by our payment provider
✓ We never store full card numbers
✓ Powered by Stripe (PCI DSS Level 1)
```

Explicit reassurance. Link to security policy.

### 3-D Secure indication

When 3DS challenge fires:

```
Verifying with your bank...

Your bank needs to verify this transaction. 
You may receive an SMS or app notification.

[Spinner / OTP form / redirect to bank]
```

Don't just show a spinner — explain what's happening.

After verification:

```
✓ Verified successfully
[Continue]
```

3DS reduces fraud and chargebacks. Communicate it as a feature, not a friction.

## Visual design of checkout

Beyond badges, the OVERALL design signals security.

### Polished, professional

- Consistent typography
- Aligned form fields
- Clear typography
- Proper spacing
- No broken images
- No typos

A janky-looking page screams "could be a scam." A polished page builds trust.

### Familiar layout

Use checkout conventions users already know:
- Order summary on right (LTR) / left (RTL)
- Forms on left (LTR) / right (RTL)
- Stack vertically on mobile
- Continue button at bottom

Innovation in checkout = trust loss. Be familiar.

### Branding consistent

Logo, colors, fonts match the rest of the site. Suddenly different = phishing concern.

## Specific patterns

### Address fields with clear labels

```
First Name *
[                                         ]
Phone *
[ +971 | ___________________________ ]
Address *
[                                         ]
City *
[                                         ]
```

Asterisk for required. Inline validation. Clear formatting expectations.

### Card form with security cues

```
Card Number *
[ 4242 4242 4242 4242    🔒 ]      ← lock icon inline

Expiration *      CVV *  ?
[ MM / YY ]      [ ___ ]      ← ? tooltip explains CVV

Name on card *
[                                       ]
```

- Card icon updates as user types (Visa, Mastercard, etc.)
- Lock icon inside card field
- CVV tooltip ("3 digits on back of card")
- Mask card number after first 4 digits (display only)

For iframe-based (Stripe Elements):

```
Payment Details
─────────────────────
[Stripe-rendered iframe]
🔒 Secured by Stripe
```

Show provider name. Reassures users.

### Save card option (clear and informed consent)

```
[ ✓ ] Save this card for next time
       Card details are securely stored by [provider] — 
       not on our servers.
       You can remove saved cards anytime in account settings.
```

Default: unchecked (user opts in). Don't pre-check.

### Order summary persistent

```
┌──────────────────────────┐
│  Your order               │
│                            │
│  Items:                    │
│  [thumb] Anti-dandruff      │
│          shampoo  AED 89    │
│                            │
│  [thumb] Hair serum         │
│          AED 67             │
│                            │
│  Subtotal:    AED 156      │
│  Shipping:    FREE          │
│  Tax (5%):    AED 7.80     │
│  ─────────────────────     │
│  Total:       AED 163.80   │
│                            │
└──────────────────────────┘
```

Visible throughout checkout. User always knows what they're paying. No surprises = trust.

### Total breakdown

Always show:
- Subtotal
- Discounts (with codes)
- Shipping
- Tax
- Total

Hidden fees revealed at last step = trust destroyer.

### Estimated delivery date

```
Estimated delivery: May 22-24
Delivered by Aramex
```

Specific dates. Specific courier. Builds confidence.

## "Pay" button design

The primary CTA must be obvious and confident:

```
┌──────────────────────────────────────┐
│       Pay AED 163.80                  │  ← amount in button
│       🔒 Secure checkout              │
└──────────────────────────────────────┘
```

Avoid:
- "Submit" (clinical)
- "Continue" (vague)
- "Proceed" (formal)

Use:
- "Pay AED X" (clear)
- "Place order — AED X"
- "Complete purchase"

Amount visible in button = user knows exactly what they're authorizing.

## Loading and error states

### Processing payment

```
Processing your payment...
[Spinner]

Please don't close this window.
We're verifying your card with your bank.
```

5-30 seconds is normal. Communicate to prevent double-clicks (which can cause double charges).

Disable the button after click:

```jsx
const [processing, setProcessing] = useState(false);

<button 
  onClick={pay} 
  disabled={processing}
>
  {processing ? <Spinner /> : `Pay AED ${total}`}
</button>
```

### Payment errors

Specific, actionable:

```
✗ Payment couldn't be processed

Your card was declined by your bank. 
Please try a different card or contact your bank.

[ Try different card ]   [ Contact support ]
```

Not just "Error." Tell user what happened and what to do.

Common errors:
- Card declined → try different card / contact bank
- Insufficient funds → try different card
- 3DS failed → try again, contact bank
- Wrong CVV → re-enter
- Expired card → use different / update card
- Network error → try again
- Fraud detection block → contact support

Never expose technical details (bank codes, gateway responses) to user.

## SMS / email confirmations

After successful payment:

### Email (immediate)

```
Subject: Order confirmed — ORD-...-A7F9

Hi Sarah,

Thank you for your order!

Order: ORD-20260516-A7F9K2
Total: AED 163.80
Estimated delivery: May 22-24

[items with images]

[ View order ]

Need help? Reply to this email or chat with us.
```

### SMS (immediate)

```
Beauty Marketplace: Order ORD-...A7F9 confirmed.
Total AED 163.80. Track at bma.io/o/A7F9.
```

These confirmations build trust by closing the transaction loop visibly.

## Cash on Delivery (COD)

Hugely important in MENA. Don't treat as second-class.

### Display equally

```
Payment Method:
( ) Credit/Debit Card
( ) Apple Pay
( ) Tabby (pay later)
( ) Cash on Delivery     ← same level
```

Not buried at the bottom or with extra fees prominently displayed.

### COD-specific trust

- "Pay when you receive your order"
- "Inspect before paying"
- "Available in [country list]"
- "Available for orders up to AED X"

### Fraud protection for COD

- Phone verification at checkout
- SMS OTP confirmation
- Limit on COD per new customer
- Vendor protections (insurance, dispute system)

## Trust during the entire flow

### Cart → Checkout transition

When user clicks "Checkout":
- Page loads quickly (no spinner-of-doom)
- URL changes to clear path (e.g., `/checkout` not `/c/?id=12345`)
- HTTPS visibly maintained
- Order summary persists

### Inside checkout

- Don't lose user's data on error
- Don't reset filters when navigating back
- Show progress (Step 1 of 3)
- Allow editing previous steps

### After payment

- Don't redirect away unexpectedly
- Confirmation page is reachable / bookmarkable
- Email confirmation arrives within minutes
- Order visible in account immediately

## Mobile-specific

### Mobile keyboard for cards

```html
<input type="text" inputmode="numeric" autocomplete="cc-number" pattern="[0-9 ]+" />
```

- `inputmode="numeric"` — numeric keyboard
- `autocomplete="cc-number"` — browser/iOS offers saved cards
- `pattern` — validation

For other fields:
- `autocomplete="cc-name"` — name on card
- `autocomplete="cc-exp"` — expiration
- `autocomplete="cc-csc"` — CVV
- `autocomplete="shipping street-address"` — address
- `autocomplete="tel"` — phone

iOS Wallet integration: cards auto-fill from Wallet.

### Apple Pay / Google Pay

Skip card entry entirely:

```
┌────────────────────────────────┐
│   [ Pay with Apple Pay 🍎 ]    │   ← single tap
└────────────────────────────────┘
       — or pay with card —
[card form]
```

Apple Pay handles all the security. User taps once, confirms with Face ID, done.

Major conversion booster in MENA (iPhone usage high).

## OTP for COD orders

Verify phone number for COD orders:

```
We'll send a one-time code to +971 50 *** 4567 to confirm 
your order.

[ Send code ]
```

User receives SMS, enters code, order confirmed. Reduces fraud.

For card payments, 3DS often handles this.

## Saving payment methods

For repeat customers:

```
Saved Payment Methods

[Visa ending in 4242] ← default
[Mada ending in 9876]
[+ Add new card]
```

Click default → checkout uses it.

Storage: NEVER on your servers. Use provider's vault (Stripe Customers, Checkout.com Vault, etc.).

## Refunds and disputes

Display refund policy in checkout:

```
Easy returns • 30-day money-back guarantee • Free returns
```

Link to full policy.

For refund processing:
- Acknowledged within 24 hours
- Processed within 5-7 business days
- Customer kept informed

Refund speed = trust. Slow refunds = lost customers.

## RTL considerations

Mirror layout:
```
LTR:                            RTL:
┌──────────┬──────────┐         ┌──────────┬──────────┐
│ Form     │ Summary   │         │ Summary   │ Form     │
└──────────┴──────────┘         └──────────┴──────────┘
```

Currency: same format ("AED 163.80" or "163.80 AED").

Security messages translated:
- "Secure checkout" → "دفع آمن"
- "Encrypted" → "مشفر"
- "We accept" → "نقبل"
- "Pay with" → "ادفع باستخدام"

## Testing

### Penetration testing

Hire pen testers annually. They find:
- XSS vulnerabilities
- Injection attacks
- Authentication bypasses
- Logic flaws

### Bug bounty

Public bug bounty program (HackerOne, Bugcrowd). Researchers report; you pay for confirmed bugs.

### Automated scanning

- OWASP ZAP
- Burp Suite
- Snyk (dependency vulnerabilities)
- npm audit / yarn audit

### Compliance audits

- Annual PCI DSS audit (Level 1 or 2)
- Annual SOC 2 audit (for B2B confidence)
- GDPR / regional data laws

## Incident response

If breach happens:
1. Stop the breach
2. Notify affected users
3. Notify regulators (within 72 hours for GDPR)
4. Public communication
5. Free credit monitoring (US/EU)
6. Post-mortem published

Better to disclose proactively than be discovered hiding.

## Anti-patterns

- ❌ HTTP (not HTTPS) — checkout doesn't work, period
- ❌ Generic security badges that aren't earned
- ❌ Storing raw card numbers in database
- ❌ Logging full card numbers
- ❌ Custom card form (instead of iframe-based) without PCI compliance
- ❌ No 3D Secure (high fraud risk)
- ❌ Unclear total breakdown (taxes/fees added at end)
- ❌ Submit button that doesn't disable after click (double charges)
- ❌ Errors that expose technical details
- ❌ Inconsistent design (looks unprofessional)
- ❌ No URL/origin clarity (could be phishing)
- ❌ Buried COD option (kills conversion in MENA)
- ❌ Saved cards stored insecurely
- ❌ "We don't store cards" claim that's actually false
- ❌ Trust seals that don't link to verification
- ❌ Old "VeriSign" logos from 2005
- ❌ Manually typed card numbers in checkout (use autofill)
- ❌ Asking for unnecessary data (passport, ID number) that arouses suspicion
- ❌ Forced account creation before checkout (allow guest)
- ❌ Different branding on checkout vs rest of site (looks like phishing)
