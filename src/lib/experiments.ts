import { storeConfig } from "@/config/store";
import { trackGrowthHookEvent } from "@/lib/growth-hooks";

/** Registered experiments — extend when adding new surfaces (one path per batch gate). */
export const EXPERIMENT_HOME_HERO_MESSAGING_V1 = "home_hero_messaging_v1" as const;

export type HomeHeroVariantId = "control" | "variant_b";

const ASSIGNMENTS_KEY = "DilMart-experiment-assignments-v1";
const EXPOSURE_SESSION_PREFIX = "DilMart-experiment-exposed:";

function readAssignments(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ASSIGNMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAssignments(next: Record<string, string>) {
  try {
    localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(next));
  } catch {
    // no-op
  }
}

function stableBucket0to99(): number {
  try {
    const key = "DilMart-anon-bucket-v1";
    let raw = localStorage.getItem(key);
    if (!raw) {
      raw =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, raw);
    }
    let h = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h) % 100;
  } catch {
    return 50;
  }
}

/**
 * Deterministic A/B assignment persisted per browser — safe for merchandising/copy tests.
 * `controlWeightPercent` is the share for the first variant (remainder goes to second).
 */
export function getPersistedVariant<E extends string>(experimentId: string, variants: readonly [E, E], controlWeightPercent = 50): E {
  const assignments = readAssignments();
  const existing = assignments[experimentId];
  if (existing === variants[0] || existing === variants[1]) return existing as E;

  const bucket = stableBucket0to99();
  const chosen = bucket < controlWeightPercent ? variants[0] : variants[1];
  assignments[experimentId] = chosen;
  writeAssignments(assignments);
  return chosen;
}

const HOME_HERO_COPY: Record<
  HomeHeroVariantId,
  { headline: string; subline: string; ctaLabel: string }
> = {
  control: {
    headline: "سوقك للعناية الرجالية والجمالية",
    subline: "",
    ctaLabel: "استكشف المنتجات",
  },
  variant_b: {
    headline: "عناية يومية بمعايير احترافية",
    subline: "تصفّح متاجر موثوقة وقطع مختارة للروتين الذي يناسبك — بدون تعقيد، مع دعم واضح.",
    ctaLabel: "ابدأ التصفّح",
  },
};

export function getHomeHeroMessagingExperiment(): {
  experimentId: typeof EXPERIMENT_HOME_HERO_MESSAGING_V1;
  variantId: HomeHeroVariantId;
  copy: { headline: string; subline: string; ctaLabel: string };
} {
  const variantId = getPersistedVariant(EXPERIMENT_HOME_HERO_MESSAGING_V1, ["control", "variant_b"] as const, 50);
  const base = HOME_HERO_COPY[variantId];
  const subline =
    variantId === "control"
      ? `اكتشف متاجر متعددة ومنتجات مختارة — تجربة تسوّق هادئة مع ${storeConfig.brand.ar}.`
      : base.subline;
  return {
    experimentId: EXPERIMENT_HOME_HERO_MESSAGING_V1,
    variantId,
    copy: { headline: base.headline, subline, ctaLabel: base.ctaLabel },
  };
}

/** One exposure per browser tab session when the hero is shown (avoids duplicate logs on re-renders). */
export function recordHomeHeroExperimentExposure(variantId: HomeHeroVariantId) {
  try {
    const sessionKey = `${EXPOSURE_SESSION_PREFIX}${EXPERIMENT_HOME_HERO_MESSAGING_V1}`;
    if (sessionStorage.getItem(sessionKey) === "1") return;
    sessionStorage.setItem(sessionKey, "1");
    trackGrowthHookEvent("experiment.exposed", {
      experimentId: EXPERIMENT_HOME_HERO_MESSAGING_V1,
      variantId,
      sourceSurface: "home_hero",
    });
  } catch {
    trackGrowthHookEvent("experiment.exposed", {
      experimentId: EXPERIMENT_HOME_HERO_MESSAGING_V1,
      variantId,
      sourceSurface: "home_hero",
    });
  }
}

export function trackHomeHeroPrimaryCtaOutcome(variantId: HomeHeroVariantId) {
  trackGrowthHookEvent("experiment.outcome", {
    experimentId: EXPERIMENT_HOME_HERO_MESSAGING_V1,
    variantId,
    sourceSurface: "home_hero",
    outcomeKey: "hero_primary_cta_click",
  });
}
