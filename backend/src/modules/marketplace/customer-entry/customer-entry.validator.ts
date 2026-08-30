/**
 * DilMart-CUSTOMER-STORE-STORE-PR2 — Target-path allowlist for the Customer Gateway.
 *
 * As of STORE-PR3 this module DELEGATES to the single canonical Store target-path
 * validator (`store-integration/customer-handoff/customer-handoff-target.validator`),
 * restricted to the discovery-only subset (master spec §12). There is exactly one
 * allowlist in the Store backend — do not add a second one.
 *
 * Discovery-safe subset returned by this endpoint:
 *   /  /products  /offers  /stores  /category/:slug  /product/:slug  /store/:slug
 *
 * Everything else — external/absolute/protocol-relative URLs, javascript:/data:
 * schemes, admin/merchant/agent routes, cart/checkout/account routes, control
 * characters, traversal — is rejected (returns null). Callers drop the item.
 */

import {
  DISCOVERY_TARGET_SUBSET,
  brandTarget as canonicalBrandTarget,
  isValidSlug as canonicalIsValidSlug,
  validateHandoffTargetPath,
} from "../../store-integration/customer-handoff/customer-handoff-target.validator";

export function isValidSlug(slug: unknown): slug is string {
  return canonicalIsValidSlug(slug);
}

/**
 * Returns the path if it is an allowlisted, internal, discovery-safe target;
 * otherwise null. Never returns an external, absolute, protocol-relative, or
 * privileged (admin/merchant/agent) path, nor a cart/checkout/account route.
 */
export function validateTargetPath(path: unknown): string | null {
  return validateHandoffTargetPath(path, DISCOVERY_TARGET_SUBSET);
}

/** Builds a validated `/category/:slug` target, or null if the slug is unsafe. */
export function categoryTarget(slug: unknown): string | null {
  return isValidSlug(slug) ? validateTargetPath(`/category/${slug}`) : null;
}

/** Builds a validated `/product/:slug` target, or null if the slug is unsafe. */
export function productTarget(slug: unknown): string | null {
  return isValidSlug(slug) ? validateTargetPath(`/product/${slug}`) : null;
}

/**
 * Builds a validated `/products?brand=<encoded>` target, or null if the brand cannot
 * produce a safe target (caller drops the brand rather than shipping an unchecked target).
 * Delegates to the canonical builder — the brand is never concatenated raw here.
 */
export function brandTarget(name: unknown): string | null {
  return canonicalBrandTarget(name);
}
