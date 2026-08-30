/**
 * Authoritative product readiness definition (DilMart-STORE-PRODUCT-READINESS-INVARIANT-001).
 *
 * This module is the SINGLE source of truth for "is this product allowed to be
 * active / published / public?". Every server-side mutation path that can turn a product
 * on (normal create, normal update, status activation, merchant Quick Add, merchant bulk
 * activate, duplicate, CSV import preview) must import from here instead of re-implementing
 * or copying the rules. Adding a rule here must be enough to tighten every path at once.
 *
 * The module is intentionally pure (no Nest, no Supabase, no I/O) so it can be unit tested
 * directly and reused from the import path, which validates rows before any product row exists.
 *
 * Invariant enforced by callers:
 *   A product that is active / published / public MUST satisfy every activation check below.
 */

export interface ProductReadinessCheck {
  key: string;
  label: string;
  passed: boolean;
}

export interface ProductReadinessResult {
  score: number;
  passed_checks: number;
  total_checks: number;
  is_ready: boolean;
  checklist: ProductReadinessCheck[];
}

/** Shape any caller can satisfy — a DB row, an upsert payload, or a normalized import row. */
export interface ProductReadinessInput {
  name?: unknown;
  slug?: unknown;
  price?: unknown;
  category_id?: unknown;
  images?: unknown;
  stock?: unknown;
  discount_price?: unknown;
  description?: unknown;
  is_active?: unknown;
  [key: string]: unknown;
}

/** Structured error code returned by every path that refuses to activate an unready product. */
export const PRODUCT_NOT_READY_CODE = "PRODUCT_NOT_READY";

/** The `is_active` checklist entry is a state marker, never an activation blocker. */
const ACTIVATION_STATE_CHECK_KEY = "is_active";

/**
 * Full readiness checklist (also surfaced to the merchant UI through list/detail responses).
 * Keys and Arabic labels are part of the API contract — do not rename without a UI change.
 */
export function buildProductReadiness(product: ProductReadinessInput | null | undefined): ProductReadinessResult {
  const text = (value: unknown) => String(value ?? "").trim();
  const num = (value: unknown) => Number(value ?? 0);
  const images = product?.images;
  const price = num(product?.price);
  const discountPrice = product?.discount_price;

  const checks: ProductReadinessCheck[] = [
    { key: "name_completed", label: "اسم المنتج", passed: Boolean(text(product?.name)) },
    { key: "slug_completed", label: "الرابط (slug)", passed: Boolean(text(product?.slug)) },
    { key: "price_valid", label: "سعر البيع", passed: price > 0 },
    { key: "category_linked", label: "ربط القسم", passed: Boolean(product?.category_id) },
    {
      key: "image_present",
      label: "صورة واحدة على الأقل",
      passed: Array.isArray(images) && images.length > 0,
    },
    { key: "stock_valid", label: "المخزون", passed: num(product?.stock) >= 0 },
    {
      key: "discount_valid",
      label: "صلاحية الخصم",
      passed: discountPrice == null || (num(discountPrice) > 0 && num(discountPrice) < price),
    },
    { key: "description_present", label: "وصف المنتج", passed: Boolean(text(product?.description)) },
    { key: ACTIVATION_STATE_CHECK_KEY, label: "المنتج مفعل", passed: Boolean(product?.is_active) },
  ];

  const passed_checks = checks.filter((item) => item.passed).length;
  const total_checks = checks.length;
  const score = Math.round((passed_checks / total_checks) * 100);
  return {
    score,
    passed_checks,
    total_checks,
    is_ready: checks.every((item) => item.passed),
    checklist: checks,
  };
}

/**
 * Checks that block activation for this candidate state. `is_active` is evaluated as if the
 * product were already on, so the caller never has to special-case the state marker itself.
 */
export function getBlockingActivationChecks(product: ProductReadinessInput | null | undefined): ProductReadinessCheck[] {
  return buildProductReadiness({ ...(product ?? {}), is_active: true }).checklist.filter(
    (item) => item.key !== ACTIVATION_STATE_CHECK_KEY && !item.passed,
  );
}

export function isReadyForActivation(product: ProductReadinessInput | null | undefined): boolean {
  return getBlockingActivationChecks(product).length === 0;
}

/** Serializable `missing_checks` payload shared by every PRODUCT_NOT_READY error. */
export function toMissingChecks(blocking: ProductReadinessCheck[]): Array<{ key: string; label: string }> {
  return blocking.map((item) => ({ key: item.key, label: item.label }));
}

/**
 * Readiness checks an edit would newly break on an ALREADY active product.
 *
 * A product that is already deficient (legacy rows created before this invariant existed) must
 * stay editable — otherwise the merchant could never fix it. What is forbidden is an edit that
 * takes a passing check and breaks it while the product stays active/published/public.
 */
export function findNewlyBrokenActivationChecks(
  previous: ProductReadinessInput | null | undefined,
  next: ProductReadinessInput | null | undefined,
): ProductReadinessCheck[] {
  const alreadyBroken = new Set(getBlockingActivationChecks(previous).map((item) => item.key));
  return getBlockingActivationChecks(next).filter((item) => !alreadyBroken.has(item.key));
}

export type ProductVisibilityStatus = "public" | "private" | "archived";

export interface ProductPublicationState {
  is_active: boolean;
  is_published: boolean;
  visibility_status: ProductVisibilityStatus;
}

/**
 * The only place that decides the (is_active, is_published, visibility_status) triple for a
 * CREATE-shaped write, so the three fields can never drift apart:
 *   archived  → inactive, unpublished, archived (archival always wins)
 *   active    → active, published, public
 *   otherwise → inactive, unpublished, private
 *
 * Ordinary edits of an existing product do NOT go through here: an already active product may
 * legitimately sit at active+private (private catalog) and that state must be preserved.
 */
export function resolveProductPublicationState(input: {
  requestedActive: boolean;
  archived?: boolean;
}): ProductPublicationState {
  if (input.archived) {
    return { is_active: false, is_published: false, visibility_status: "archived" };
  }
  if (input.requestedActive) {
    return { is_active: true, is_published: true, visibility_status: "public" };
  }
  return { is_active: false, is_published: false, visibility_status: "private" };
}

/** Current (or requested) publication triple, in the loose shape a DB row / DTO provides. */
export interface ProductPublicationInput {
  is_active?: unknown;
  is_published?: unknown;
  visibility_status?: unknown;
}

function normalizeVisibility(value: unknown, fallback: ProductVisibilityStatus): ProductVisibilityStatus {
  return value === "public" || value === "private" || value === "archived" ? value : fallback;
}

/**
 * Canonical publication triple for an UPDATE of an existing product.
 *
 * `is_active`, `is_published` and `visibility_status` arrive from the client on
 * `UpsertProductDto` and must never be persisted verbatim — that is how contradictory rows such
 * as `is_active=false + is_published=true + public` were reachable. Callers resolve the target
 * state here and write only this result. `undefined` on the request means "unchanged".
 *
 * Rules, in order:
 *  1. archived requested (or an archived product whose visibility is not explicitly changed) →
 *     inactive + unpublished + archived. Archival always wins over a contradictory `is_active`.
 *  2. not active → inactive + unpublished + private. A product that is off is never exposed,
 *     regardless of the `is_published` / `visibility_status` the client sent.
 *  3. inactive → active (activation transition) → active + published + public, matching the
 *     long-standing behavior of this path (the caller runs the full readiness gate first).
 *  4. an already-active product keeps its own publication axes: `active + private`
 *     (private catalog) and `active + unpublished` are legitimate states and are preserved
 *     unless the request explicitly changes them.
 */
export function resolveUpdatePublicationState(
  existing: ProductPublicationInput | null | undefined,
  requested: ProductPublicationInput,
): ProductPublicationState {
  const existingActive = existing?.is_active === true;
  const existingVisibility = normalizeVisibility(existing?.visibility_status, "private");
  const requestedVisibility =
    requested.visibility_status === undefined
      ? existingVisibility
      : normalizeVisibility(requested.visibility_status, "private");

  if (requestedVisibility === "archived") {
    return resolveProductPublicationState({ requestedActive: false, archived: true });
  }

  // Archive is sticky in BOTH directions. A generic edit that merely carries a
  // `visibility_status` of "private" or "public" (as a payload echoing a form would) must not
  // take a product out of the archive as a side effect — un-archiving requires an explicit
  // `is_active: true` here, or the dedicated `updateProductStatus` restore path.
  if (existingVisibility === "archived" && requested.is_active !== true) {
    return resolveProductPublicationState({ requestedActive: false, archived: true });
  }

  const active = requested.is_active === undefined ? existingActive : requested.is_active === true;
  if (!active) {
    return resolveProductPublicationState({ requestedActive: false });
  }

  // Active from here on. `is_published` and `visibility_status` are two axes of ONE exposure
  // decision, so they are never carried independently once the request touches either of them:
  // the product is publicly exposed only when both say so, and any explicit request that
  // disagrees with the other axis resolves to the LESS exposed of the two. When the request
  // touches neither axis, an existing row is left exactly as it is — an unrelated edit must not
  // silently expose (or hide) a legacy product.
  const activationTransition = !existingActive;
  const requestedPublished = requested.is_published === undefined ? undefined : requested.is_published === true;
  const requestedPublic = requested.visibility_status === undefined ? undefined : requestedVisibility === "public";

  if (requestedPublished === undefined && requestedPublic === undefined) {
    // Activation defaults to published + public (long-standing behavior of this path); an
    // already-active product keeps whatever it had.
    return activationTransition
      ? resolveProductPublicationState({ requestedActive: true })
      : {
          is_active: true,
          is_published: existing?.is_published === true,
          visibility_status: existingVisibility,
        };
  }

  const exposed =
    (requestedPublished ?? (activationTransition ? true : existing?.is_published === true)) &&
    (requestedPublic ?? (activationTransition ? true : existingVisibility === "public"));

  return {
    is_active: true,
    is_published: exposed,
    visibility_status: exposed ? "public" : "private",
  };
}

/**
 * True when the target state exposes the product more than the current one — activating,
 * publishing, or making it public. Every such transition must pass the FULL readiness gate,
 * never the "did this edit newly break something" comparison, so a legacy active-but-unready
 * product can be repaired and edited but never newly exposed.
 */
export function increasesPublicExposure(
  existing: ProductPublicationInput | null | undefined,
  target: ProductPublicationState,
): boolean {
  return (
    (existing?.is_active !== true && target.is_active) ||
    (existing?.is_published !== true && target.is_published) ||
    (existing?.visibility_status !== "public" && target.visibility_status === "public")
  );
}

/**
 * True when the REQUEST asks for more exposure than the product currently has, even if the
 * canonical resolution ends up not granting it (e.g. `is_published: true` on an `active +
 * private` product resolves back to private because both axes must agree). Asking to expose an
 * unready product is refused with PRODUCT_NOT_READY rather than silently downgraded to a no-op,
 * so the caller learns why the product is not going public.
 */
export function requestsMorePublicExposure(
  existing: ProductPublicationInput | null | undefined,
  requested: ProductPublicationInput,
): boolean {
  if (requested.visibility_status === "archived") return false;
  return (
    (requested.is_active === true && existing?.is_active !== true) ||
    (requested.is_published === true && existing?.is_published !== true) ||
    (requested.visibility_status === "public" && existing?.visibility_status !== "public")
  );
}
