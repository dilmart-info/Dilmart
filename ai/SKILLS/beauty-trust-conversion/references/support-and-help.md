# Support & Help

When something goes wrong — and it will — the speed and quality of support determines whether the customer becomes a lifelong fan or a one-time buyer. In MENA, support expectations include WhatsApp, fast response times, and resolution that respects the customer.

## Support channel strategy

In order of preference for MENA users:

1. **WhatsApp** — most preferred, immediate, familiar
2. **Live chat** — synchronous, good
3. **Phone** — for serious issues
4. **Email** — slower but documented
5. **Self-service / FAQ** — fastest if it answers

Provide multiple channels. Don't force one.

## WhatsApp support

WhatsApp Business API enables:
- Verified business badge
- Templates for outbound messages
- Automated replies for common questions
- Handoff to human agents
- Order status checks
- Full chat history

### Setup

```
Visible from:
- Header (small WhatsApp icon)
- Footer
- Product pages ("Question? WhatsApp us")
- Cart page
- Order tracking page
- Help center
```

### Use cases

- Order status: "Where is order ORD-...?"
- Product questions: "Is this halal?"
- Authenticity concerns: "Is this real?"
- Return initiation: "I want to return"
- Sizing: "What size do I need?"
- Recommendations: "Help me choose"

### Response time

WhatsApp users expect FAST replies:
- During business hours: <5 minutes
- After hours: auto-response, then human within 12 hours

Auto-response template:
```
Thanks for reaching out! Our team is online Mon-Sun 9 AM - 11 PM.
We'll respond within minutes during business hours.
For urgent order issues, please share your order number.
```

### Privacy

- Customer's phone number visible to support agent
- Don't store WhatsApp conversations without consent
- Encrypt at rest
- Customer can request deletion

## Live chat widget

For website visitors:

```
┌────────────────────────────────────┐
│                                      │
│                                      │
│        [Site content]                │
│                                      │
│                                      │
│                              ┌──┐    │
│                              │💬│   │ ← chat bubble
│                              └──┘    │
└────────────────────────────────────┘
```

Click → opens chat panel:

```
┌────────────────────────────────────┐
│ Hi! How can we help?                 │
│                              [×]     │
├────────────────────────────────────┤
│                                      │
│ Common questions:                    │
│ - Order status                       │
│ - Return policy                      │
│ - Shipping times                     │
│                                      │
│ [Type a message...]                  │
└────────────────────────────────────┘
```

### Tools

- Intercom — full-featured, expensive
- Crisp — good MENA support
- Tawk.to — free, basic
- Drift — sales-focused
- Custom build — for full control

### Bot vs human

Start with bot:
- Common questions answered instantly
- Order lookup ("What's my order status?")
- FAQ retrieval
- Triage

Hand off to human when:
- User asks "talk to a person"
- Bot can't answer
- Sensitive issue (complaint, fraud)
- High-value customer

### Hide on certain pages

Don't show chat on:
- Checkout (distraction from completing payment)
- Order confirmation (just confirmed)
- Privacy/legal pages

Some marketplaces show contact form instead on these pages.

## Phone support

For high-stakes issues, phone matters. Especially in:
- Authentic verification disputes
- Lost packages
- Refund issues
- B2B customer service

```
Customer Support
─────────────────
📞 +971 800 BEAUTY
   Mon-Sun, 9 AM - 11 PM (GMT+4)

For salons / B2B: +971 4 XXX XXXX
```

Display in footer, help center, account settings.

### Cost

Phone support is expensive. Many marketplaces de-emphasize, but in MENA, it's expected. Find the balance.

## Email support

Slower but documented.

```
support@beauty.com — general inquiries
help@beauty.com — same, more user-facing
authenticity@beauty.com — fakes / counterfeits
vendor@beauty.com — for sellers
press@beauty.com — media inquiries
```

Response time:
- First response: <12 hours (24 max)
- Resolution: depends on issue

Auto-acknowledgment immediately:
```
Thanks for contacting Beauty Marketplace. We've received your 
message and will respond within 12 hours.

Ticket #12345
```

## Self-service FAQ / Help Center

Reduces support load. Done well, answers 50-70% of questions.

### Information architecture

```
Help Center
============

Quick Links:
- [ Track an order ]
- [ Initiate a return ]
- [ Contact us ]

Categories:
- Orders & Delivery
- Returns & Refunds
- Payment & Security
- Account & Settings
- Products & Authenticity
- Shipping
- For Vendors
```

### Article structure

Each article:
- Clear title (matches search query)
- Brief answer first
- Detailed explanation
- Related articles
- "Was this helpful?" feedback
- Contact support if not resolved

```
Article: How do I return an item?
─────────────────────────────────

You can return most items within 30 days of delivery.

Quick steps:
1. Go to "My Orders" in your account
2. Click "Return items" next to the order
3. Select items and reason
4. Print the return label we email you
5. Drop off at Aramex

[ Start a return now ]

For more details:
- Refund timeline
- Restrictions on certain items
- International returns

Was this helpful? [👍 Yes]  [👎 No]

Still need help? [ Contact us ]
```

### Search

```
Search the help center: [_______________]

Common searches:
- "track order"
- "return"
- "shipping fees"
- "authentic"
```

Type-ahead suggestions. Search results ranked by relevance + popularity.

### Translation

All articles translated to all supported languages. Native speakers, not auto-translate.

## Order tracking

A common support need. Make self-service excellent so users don't contact support:

```
Order ORD-...-A7F9
─────────────────

[Aramex tracking widget]

✓ Order placed         May 16
✓ Packed              May 17
✓ Shipped             May 18
✓ Out for delivery    May 20
○ Delivered           Expected today by 8 PM

Tracking: BD123456789AE
[ Track on Aramex ]

Update preferences: 
[ ✓ ] Email me when delivered
[ ✓ ] SMS me when out for delivery
```

Real-time, mobile-friendly. Push notifications.

## Order modification self-service

Reduce support calls:

```
Order ORD-...-A7F9
Status: Packed

[ Change delivery address ]    ← only if not yet shipped
[ Change delivery date ]        ← only if not yet shipped
[ Cancel order ]                ← only if not yet shipped
[ Add note to vendor ]
[ Track order ]
```

After shipped: most modifications not allowed. Direct to support.

## Returns self-service

```
[ Initiate a return ]
[ Track an existing return ]
[ Reschedule pickup ]
```

See `return-policy-ux.md` for details.

## Common FAQ topics

Beauty marketplaces need to answer:

### Orders
- How do I track my order?
- Can I change my address?
- Can I cancel?
- When will it arrive?
- What if I miss the delivery?

### Returns
- How long do I have?
- Free returns?
- How long for refund?
- Can I return opened items?
- What's not returnable?

### Payment
- What methods do you accept?
- Is COD available?
- Is it secure?
- Why was my payment declined?
- Can I save my card?

### Products
- Are these authentic?
- Where do these come from?
- Are the expiration dates valid?
- Is this halal/vegan/cruelty-free?
- How do I verify?

### Account
- How do I reset password?
- How do I delete my account?
- How do I update my address?
- How do I unsubscribe?

### Shipping
- How much does shipping cost?
- Free shipping threshold?
- Which countries?
- How long does it take?
- Can I get express delivery?

### Vendors
- How do I become a vendor?
- What are the fees?
- How do I get verified?
- Payouts?

Provide clear articles for each. Most users find them via search.

## Support training

Customer service agents need:
- Product knowledge (beauty basics)
- Cultural sensitivity (MENA expectations)
- Authority to resolve (don't need approval for refunds under $X)
- Multilingual (Arabic + English minimum)
- Empathy training

### Service standards

- Response time: <5 min during business hours
- First-contact resolution: 70%+ target
- CSAT (Customer Satisfaction): >4.5/5
- Tone: warm, professional, owner-mindset

### Escalation

Tier 1: General inquiries, easy returns, status updates
Tier 2: Complex issues, vendor disputes, large refunds
Tier 3: Legal, regulatory, executive escalation

Customers shouldn't have to repeat themselves between tiers. Ticket history visible.

## Compensation when things go wrong

Authority for tier 1 agents:
- Free shipping refund: any time
- Restocking fee waiver: any time
- 10% discount: any time
- Free expedited shipping: when failed
- Full refund without return: for small-value items (<AED 50)

Beyond these: escalate. But empower agents to resolve fast.

### When marketplace messes up

```
Customer's order was delayed by 5 days due to vendor delay.

Agent action:
- Apologize
- Refund shipping (even if was free)
- Give 20% off next order as gesture
- Note for vendor performance review
```

Don't nickel-and-dime. Win the customer.

## Reviews / feedback on support

After support interaction:

```
[After interaction closes]

How would you rate this support experience?

★★★★★ Excellent
★★★★ Good
★★★ Okay
★★ Poor
★ Very poor

Comments (optional):
[                                       ]

[ Submit ]
```

Track CSAT per agent, per channel, over time.

## Escalation paths

Customer unhappy → can escalate:

```
Need to escalate?
─────────────────
- Ask to speak with a supervisor
- Email escalation@beauty.com
- File a complaint at our office (UAE address)
- Contact UAE Consumer Protection Authority (for serious disputes)
```

External regulator escalation: usually triggers internal review. Most marketplaces want to avoid.

## Multilingual support

Hours-by-language:

```
English: 24/7
Arabic: 9 AM - 11 PM (GMT+4)
French: 9 AM - 11 PM (GMT+1)
```

Match customer's language. Don't make Arabic-speaking customers speak English.

## Vendor support

Vendors need their own support:

```
Vendor Support
─────────────
- Onboarding help
- Order management
- Payouts
- Account issues
- Policy questions

Channels:
- Vendor portal chat
- vendor@beauty.com
- +971 4 XXX XXXX (business hours)
```

Separate team, separate tooling. Vendors are business partners with different needs than consumers.

## B2B / Pro support

Pro/Salon tier customers (large orders) get premium support:

```
Pro Customer Support
─────────────────────
Dedicated account manager: [name]
Direct line: +971 50 XXX XXXX
Email: [name]@beauty.com
Hours: Sun-Thu 9 AM - 6 PM
```

Single point of contact. Higher service level.

## Support tooling

Tools to manage:
- Zendesk
- Intercom
- Freshdesk
- HubSpot Service
- Custom build

Integrations:
- Order data (lookup by order ID)
- Customer data (history, status)
- Vendor data (for disputes)
- Knowledge base

Features:
- Ticket assignment
- Internal notes
- Macro responses
- Escalation rules
- SLA tracking
- Analytics

## Communication best practices

### Acknowledge first

```
Bad:
"Per our policy, opened cosmetics can't be returned."

Better:
"I understand this is frustrating. Let me look into what we 
can do. Generally, opened cosmetics can't be returned, but 
there are exceptions for defects — was your issue related 
to a defect?"
```

### Be specific

```
Bad:
"We'll get back to you soon."

Better:
"I'll have an update for you by Thursday at the latest. 
You'll receive an email when I have news."
```

### Show effort

```
Bad:
"Sorry, that's not possible."

Better:
"I'd love to help with that. Let me check with the vendor 
and see what options we have. I'll be back in 24 hours."
```

### Take ownership

```
Bad:
"That's the vendor's responsibility."

Better:
"Let me work with the vendor on your behalf. Even if it 
takes them a moment, I'll make sure you're taken care of."
```

## Crisis handling

When things go viral or wrong publicly:
- Acknowledge publicly
- Apologize sincerely
- Detail the fix
- Compensate affected
- Follow up to confirm resolution

Examples:
- Counterfeit products discovered
- Data breach
- Service outage
- Major shipping delay
- Vendor scandal

PR + customer service + product team coordinated.

## Anti-patterns

- ❌ No phone number visible anywhere
- ❌ "Contact us" form with no response for days
- ❌ Bot loops with no human handoff
- ❌ Long IVR menus on phone
- ❌ Different answers from different agents
- ❌ Repeat questioning (customer must re-explain every time)
- ❌ "It's the vendor's problem" attitude
- ❌ Refusing refunds for clearly damaged items
- ❌ Auto-replies that don't actually answer anything
- ❌ Closing tickets without resolution
- ❌ FAQ that doesn't match current policies
- ❌ Outdated info ("we offer free returns!" when policy changed)
- ❌ Non-MENA-aware agents (not knowing UAE vs Saudi differences)
- ❌ Slow Arabic-language response (English much faster)
- ❌ Customer reviews on support visible only to marketplace (not vendors)
- ❌ Support that escalates everything to legal (slow, scary)
- ❌ Hiding support contact info to "encourage self-service" (frustrates users)
- ❌ Holiday hours not communicated (Eid, etc.)
- ❌ Auto-locking accounts after multiple support contacts (penalizes engaged customers)
- ❌ Treating B2B and consumer the same (very different needs)
