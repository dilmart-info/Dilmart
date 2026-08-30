export const RECENTLY_VIEWED_MAX_ITEMS = 20;

export type GrowthHookEventName =
  | "wishlist.added"
  | "wishlist.removed"
  | "wishlist.opened"
  | "product.viewed"
  | "store.viewed"
  | "cart.added"
  | "checkout.previewed"
  | "checkout.submitted"
  | "reentry.link_opened"
  | "reentry.source_captured"
  | "experiment.exposed"
  | "experiment.outcome";

type GrowthHookPayload = {
  sourceSurface?: string;
  productId?: string;
  merchantId?: string;
  path?: string;
  campaignSource?: string;
  campaignMedium?: string;
  campaignId?: string;
  /** M4.7 — experimentation baseline */
  experimentId?: string;
  variantId?: string;
  outcomeKey?: string;
};

type GrowthHookEvent = {
  name: GrowthHookEventName;
  occurredAt: string;
  payload: GrowthHookPayload;
};

type MerchantNudge = {
  key: string;
  label: string;
  detail: string;
  to: string;
  priority: "high" | "medium" | "low";
  status: "new" | "active" | "resolved";
};

const EVENT_LOG_KEY = "DilMart-growth-hooks-log-v1";
const EVENT_LOG_MAX_ITEMS = 200;
const SERVER_INGEST_ENDPOINT = `${import.meta.env.VITE_STORE_API_BASE_URL ?? "http://localhost:4000/api"}/analytics/events/ingest`;
const REENTRY_CONTEXT_KEY = "DilMart-reentry-context-v1";
const REENTRY_CAPTURED_FLAG = "DilMart-reentry-captured-v1";
const NUDGES_STATE_KEY = "DilMart-merchant-nudges-state-v1";

type ReentryContext = {
  campaignSource?: string;
  campaignMedium?: string;
  campaignId?: string;
  entryPath?: string;
  capturedAt: string;
};

function readEventLog(): GrowthHookEvent[] {
  try {
    const raw = localStorage.getItem(EVENT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEventLog(events: GrowthHookEvent[]) {
  localStorage.setItem(EVENT_LOG_KEY, JSON.stringify(events.slice(0, EVENT_LOG_MAX_ITEMS)));
}

function compactPayload(payload: GrowthHookPayload): GrowthHookPayload {
  const next: GrowthHookPayload = {};
  if (payload.sourceSurface) next.sourceSurface = payload.sourceSurface;
  if (payload.productId) next.productId = payload.productId;
  if (payload.merchantId) next.merchantId = payload.merchantId;
  if (payload.path) next.path = payload.path;
  if (payload.campaignSource) next.campaignSource = payload.campaignSource;
  if (payload.campaignMedium) next.campaignMedium = payload.campaignMedium;
  if (payload.campaignId) next.campaignId = payload.campaignId;
  if (payload.experimentId) next.experimentId = payload.experimentId;
  if (payload.variantId) next.variantId = payload.variantId;
  if (payload.outcomeKey) next.outcomeKey = payload.outcomeKey;
  return next;
}

export function trackGrowthHookEvent(name: GrowthHookEventName, payload: GrowthHookPayload = {}) {
  try {
    const event: GrowthHookEvent = {
      name,
      occurredAt: new Date().toISOString(),
      payload: compactPayload(payload),
    };
    const current = readEventLog();
    writeEventLog([event, ...current]);
    void sendEventToServer(event);
  } catch {
    // Non-blocking foundation hook; never break user flow.
  }
}

/** M5.1 dual-write baseline: local log remains source for UX while server ingestion is best-effort. */
async function sendEventToServer(event: GrowthHookEvent) {
  try {
    await fetch(SERVER_INGEST_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            name: event.name,
            occurred_at: event.occurredAt,
            source_surface: event.payload.sourceSurface,
            product_id: event.payload.productId,
            merchant_id: event.payload.merchantId,
            path: event.payload.path,
            campaign_source: event.payload.campaignSource,
            campaign_medium: event.payload.campaignMedium,
            campaign_id: event.payload.campaignId,
            experiment_id: event.payload.experimentId,
            variant_id: event.payload.variantId,
            outcome_key: event.payload.outcomeKey,
            payload: event.payload,
          },
        ],
      }),
      keepalive: true,
    });
  } catch {
    // keep local-only fallback
  }
}

export function captureReentrySource(input: { path: string; search: string; referrer?: string }) {
  try {
    if (sessionStorage.getItem(REENTRY_CAPTURED_FLAG) === "1") return;
    const params = new URLSearchParams(input.search);
    const campaignSource = params.get("utm_source") ?? undefined;
    const campaignMedium = params.get("utm_medium") ?? undefined;
    const campaignId = params.get("utm_campaign") ?? undefined;
    const hasSource = !!campaignSource || !!campaignMedium || !!campaignId || !!input.referrer;
    if (!hasSource) return;

    const context: ReentryContext = {
      campaignSource,
      campaignMedium,
      campaignId,
      entryPath: input.path,
      capturedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(REENTRY_CONTEXT_KEY, JSON.stringify(context));
    sessionStorage.setItem(REENTRY_CAPTURED_FLAG, "1");

    trackGrowthHookEvent("reentry.source_captured", {
      sourceSurface: "app_entry",
      path: input.path,
      campaignSource,
      campaignMedium,
      campaignId,
    });
  } catch {
    // no-op
  }
}

export function trackReentryLinkOpened(path: string, sourceSurface: string) {
  try {
    const raw = sessionStorage.getItem(REENTRY_CONTEXT_KEY);
    const context = raw ? (JSON.parse(raw) as ReentryContext) : null;
    trackGrowthHookEvent("reentry.link_opened", {
      sourceSurface,
      path,
      campaignSource: context?.campaignSource,
      campaignMedium: context?.campaignMedium,
      campaignId: context?.campaignId,
    });
  } catch {
    trackGrowthHookEvent("reentry.link_opened", { sourceSurface, path });
  }
}

export type RecentlyViewedItem = {
  productId: string;
  slug: string;
  name: string;
  merchantId: string | null;
  viewedAt: string;
};

const RECENTLY_VIEWED_KEY = "DilMart-recently-viewed-v1";

export function addRecentlyViewedItem(input: Omit<RecentlyViewedItem, "viewedAt">) {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    const current = raw ? (JSON.parse(raw) as RecentlyViewedItem[]) : [];
    const filtered = current.filter((item) => item.productId !== input.productId);
    const next: RecentlyViewedItem[] = [
      {
        ...input,
        viewedAt: new Date().toISOString(),
      },
      ...filtered,
    ].slice(0, RECENTLY_VIEWED_MAX_ITEMS);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch {
    // no-op
  }
}

/**
 * M4.7 — Aggregate experiment.exposed / experiment.outcome by variant for a single experiment (local event log).
 */
export function getExperimentRollup(options: { experimentId: string; windowDays?: number }) {
  const windowDays = options.windowDays ?? 7;
  const minTs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const events = readEventLog().filter((e) => {
    const ts = Date.parse(e.occurredAt);
    if (Number.isNaN(ts) || ts < minTs) return false;
    return e.payload.experimentId === options.experimentId;
  });

  const byVariant: Record<string, { exposed: number; outcomes: Record<string, number> }> = {};

  for (const e of events) {
    const vid = e.payload.variantId ?? "_unknown";
    if (!byVariant[vid]) byVariant[vid] = { exposed: 0, outcomes: {} };
    if (e.name === "experiment.exposed") {
      byVariant[vid].exposed += 1;
    } else if (e.name === "experiment.outcome" && e.payload.outcomeKey) {
      const k = e.payload.outcomeKey;
      byVariant[vid].outcomes[k] = (byVariant[vid].outcomes[k] ?? 0) + 1;
    }
  }

  return { experimentId: options.experimentId, windowDays, byVariant };
}

export function getGrowthHookFunnelSummary(options?: { merchantId?: string; windowDays?: number }) {
  const windowDays = options?.windowDays ?? 7;
  const merchantId = options?.merchantId;
  const minTs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const events = readEventLog().filter((e) => {
    const ts = Date.parse(e.occurredAt);
    if (Number.isNaN(ts) || ts < minTs) return false;
    if (merchantId && e.payload.merchantId && e.payload.merchantId !== merchantId) return false;
    return true;
  });

  const productViews = events.filter((e) => e.name === "product.viewed").length;
  const addToCart = events.filter((e) => e.name === "cart.added").length;
  const checkoutPreview = events.filter((e) => e.name === "checkout.previewed").length;
  const checkoutSubmit = events.filter((e) => e.name === "checkout.submitted").length;

  return {
    windowDays,
    productViews,
    addToCart,
    checkoutPreview,
    checkoutSubmit,
    rates: {
      viewToCart: productViews > 0 ? Math.round((addToCart / productViews) * 100) : 0,
      cartToPreview: addToCart > 0 ? Math.round((checkoutPreview / addToCart) * 100) : 0,
      previewToSubmit: checkoutPreview > 0 ? Math.round((checkoutSubmit / checkoutPreview) * 100) : 0,
    },
  };
}

export function evaluateMerchantNudges(input: {
  merchantId: string;
  readinessScore: number;
  isStoreReady: boolean;
  notReadyProducts: number;
  inactiveProducts: number;
  lowStockProducts: number;
  delayedOrders: number;
}) {
  const current = [
    !input.isStoreReady
      ? {
          key: "store-readiness",
          label: "استكمال جاهزية المتجر",
          detail: `${input.readinessScore}% مكتمل`,
          to: "/merchant/settings",
          priority: "high" as const,
        }
      : null,
    input.notReadyProducts > 0
      ? {
          key: "products-readiness",
          label: "إكمال بيانات المنتجات غير الجاهزة",
          detail: `${input.notReadyProducts} منتج`,
          to: "/merchant/products",
          priority: "high" as const,
        }
      : null,
    input.delayedOrders > 0
      ? {
          key: "delayed-orders",
          label: "متابعة الطلبات المتأخرة",
          detail: `${input.delayedOrders} طلب`,
          to: "/merchant/orders",
          priority: "high" as const,
        }
      : null,
    input.lowStockProducts > 0
      ? {
          key: "low-stock",
          label: "تحديث مخزون المنتجات المنخفضة",
          detail: `${input.lowStockProducts} منتج`,
          to: "/merchant/products",
          priority: "medium" as const,
        }
      : null,
    input.inactiveProducts > 0
      ? {
          key: "inactive-products",
          label: "مراجعة المنتجات المعطلة",
          detail: `${input.inactiveProducts} منتج`,
          to: "/merchant/products",
          priority: "low" as const,
        }
      : null,
  ].filter(Boolean) as Array<Omit<MerchantNudge, "status">>;

  const merchantStateKey = `${NUDGES_STATE_KEY}:${input.merchantId}`;
  let previousActiveKeys = new Set<string>();
  try {
    const raw = localStorage.getItem(merchantStateKey);
    const parsed = raw ? (JSON.parse(raw) as { activeKeys?: string[] }) : null;
    previousActiveKeys = new Set(parsed?.activeKeys ?? []);
  } catch {
    previousActiveKeys = new Set<string>();
  }

  const currentKeys = new Set(current.map((n) => n.key));
  const resolved = Array.from(previousActiveKeys)
    .filter((key) => !currentKeys.has(key))
    .map((key) => ({
      key,
      label: `تمت معالجة: ${key}`,
      detail: "أُغلقت تلقائياً بعد تحسن المؤشرات",
      to: "/merchant",
      priority: "low" as const,
      status: "resolved" as const,
    }));

  const active = current.map((n) => ({
    ...n,
    status: previousActiveKeys.has(n.key) ? ("active" as const) : ("new" as const),
  }));

  try {
    localStorage.setItem(merchantStateKey, JSON.stringify({ activeKeys: Array.from(currentKeys), updatedAt: new Date().toISOString() }));
  } catch {
    // no-op
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  active.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  return { active, resolved: resolved.slice(0, 3) };
}
