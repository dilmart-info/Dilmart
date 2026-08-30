/**
 * M10.7 — Merchant-directed WhatsApp contact is superseded.
 * Intents are preserved as platform infrastructure for future ops intake,
 * but they no longer route the customer to the merchant's WhatsApp number.
 *
 * The flow now redirects to the platform checkout/order page.
 */
import { apiClient } from "@/lib/api-client";

const SESSION_KEY = "wa_assisted_session_id";

function getOrCreateSessionId() {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
}

type StartIntentArgs = {
  merchantId: string;
  merchantName: string;
  sourceSurface: "product" | "store" | "cart";
  product?: { id: string; name: string };
  cart?: Array<{ product_id: string; product_name: string; quantity: number; price: number }>;
  completionLink: string;
};

export async function startTrackedWhatsAppIntent(args: StartIntentArgs) {
  const intent = await apiClient.createWhatsAppIntent({
    merchant_id: args.merchantId,
    product_id: args.product?.id,
    cart: args.cart,
    source_surface: args.sourceSurface,
    session_id: getOrCreateSessionId(),
  });

  await apiClient.markWhatsAppIntentOpened(intent.intent_id);

  // M10.7: Redirect to platform checkout — not to merchant WhatsApp.
  // whatsapp_phone is no longer returned by the backend.
  window.location.href = args.completionLink;

  return {
    cancelled: false as const,
    intentId: intent.intent_id,
    intentToken: intent.intent_token,
  };
}
