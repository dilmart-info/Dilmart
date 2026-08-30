# WhatsApp Assisted Commerce Policy (Iraq)

## Purpose
Define a practical model for WhatsApp usage that preserves marketplace revenue, order traceability, and merchant conversion quality in the Iraqi market.

## Guiding Principle
WhatsApp remains an assisted conversion channel, not an off-platform sales bypass. Any buyer conversation started from platform surfaces must remain attributable to a tracked order intent.

## Channel Model
- **In-platform checkout (`web_checkout`)**: customer completes order inside the platform flow.
- **WhatsApp assisted (`whatsapp_assisted`)**: customer opens WhatsApp from product/store surfaces using a prefilled tracked message.
- **Prohibited (`off_platform_untracked`)**: merchant executes untracked orders that originated from platform traffic.

## Customer Journey Rules
1. WhatsApp CTA is allowed on store/product pages.
2. CTA must include a prefilled message with:
   - merchant identifier
   - product/cart summary
   - generated tracking token (`intent_id`)
   - short link to complete order on platform
3. If customer confirms on WhatsApp, merchant/agent must register the order in platform (manual order flow allowed).
4. Payment method can remain flexible (COD-first), but order record must be created in platform before fulfillment.

## Merchant Visibility Rules
- Merchant phone is not shown as raw public contact in catalog surfaces without tracked CTA mediation.
- Platform-provided WhatsApp buttons are the default channel entry.
- Optional direct phone display is a gated privilege for high-compliance merchants only.

## Commission and Incentives
- **`web_checkout`**: base commission (lowest).
- **`whatsapp_assisted`**: base commission + assisted handling margin (or same commission with stricter SLA).
- Monthly compliance bonus:
  - higher tracked-order ratio => better ranking weight + campaign eligibility.
- Leakage penalty:
  - repeated untracked platform-origin sales => ranking demotion, temporary WhatsApp CTA restriction, then account review.

## Compliance KPIs (Monthly)
- `tracked_order_ratio` = tracked orders / total platform-origin conversations.
- `checkout_completion_ratio` (intent -> order).
- `untracked_leakage_signals` (customer complaints, tokenless conversations, mismatch audits).
- `merchant_response_sla` (first reply time on assisted chats).

## Enforcement Ladder
1. **Warning**: first verified leakage pattern.
2. **Soft penalty**: ranking downgrade + loss of featured slots.
3. **Channel restriction**: WhatsApp CTA limited to business hours / disabled temporarily.
4. **Commercial action**: stricter commission tier or suspension for repeated abuse.

## UX Requirements
- WhatsApp button label should set expectation clearly:
  - "Chat with store (tracked order)" not "Direct untracked order".
- Confirm screen before redirect:
  - "Your chat will be linked to your order intent."
- Merchant panel should show:
  - assisted intents
  - conversion status
  - missing intents needing order registration.

## Operational Notes for Iraq
- Keep WhatsApp enabled: it is conversion-critical.
- Keep COD supported, but never without platform order record.
- Prioritize merchant education: "Tracked WhatsApp improves ranking and exposure."
- Use simple Arabic UX copy and low-friction flows for merchants and agents.

## Immediate Implementation Scope (M9 Candidate)
1. Add tracked WhatsApp intent token generation on product/store CTA.
2. Add `channel` field to order creation (`web_checkout`, `whatsapp_assisted`, `manual_assisted`).
3. Add merchant compliance dashboard card (tracked ratio + leakage risk).
4. Add ranking multiplier tied to compliance KPIs.

