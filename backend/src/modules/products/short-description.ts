/**
 * Shared short_description normalization + validation.
 * Hard constraint: 40–280 Unicode code points after trim. Empty → null.
 * Length uses [...s].length so Arabic + emoji match Postgres char_length for BMP/emoji.
 */

export const SHORT_DESCRIPTION_MIN = 40;
export const SHORT_DESCRIPTION_MAX = 280;

export const ShortDescriptionErrors = {
  SHORT_DESCRIPTION_REQUIRED: "SHORT_DESCRIPTION_REQUIRED",
  SHORT_DESCRIPTION_TOO_SHORT: "SHORT_DESCRIPTION_TOO_SHORT",
  SHORT_DESCRIPTION_TOO_LONG: "SHORT_DESCRIPTION_TOO_LONG",
  SHORT_DESCRIPTION_INVALID: "SHORT_DESCRIPTION_INVALID",
} as const;

export type ShortDescriptionErrorCode =
  (typeof ShortDescriptionErrors)[keyof typeof ShortDescriptionErrors];

const HTML_TAG_RE = /<\/?[a-z][\s\S]*>/i;

/** Unicode code-point length (parity with Postgres char_length for typical Arabic/emoji). */
export function codePointLength(value: string): number {
  return [...value].length;
}

/** Trim; empty/whitespace-only → null. Does not reject length. */
export function normalizeShortDescription(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return codePointLength(trimmed) === 0 ? null : trimmed;
}

export function validateShortDescription(
  value: string | null | undefined,
  opts?: { required?: boolean },
): { ok: true; value: string | null } | { ok: false; code: ShortDescriptionErrorCode; message: string } {
  const normalized = normalizeShortDescription(value);

  if (normalized === null) {
    if (opts?.required) {
      return {
        ok: false,
        code: ShortDescriptionErrors.SHORT_DESCRIPTION_REQUIRED,
        message: "short_description is required.",
      };
    }
    return { ok: true, value: null };
  }

  if (HTML_TAG_RE.test(normalized)) {
    return {
      ok: false,
      code: ShortDescriptionErrors.SHORT_DESCRIPTION_INVALID,
      message: "short_description must not contain HTML.",
    };
  }

  const length = codePointLength(normalized);
  if (length < SHORT_DESCRIPTION_MIN) {
    return {
      ok: false,
      code: ShortDescriptionErrors.SHORT_DESCRIPTION_TOO_SHORT,
      message: `short_description must be at least ${SHORT_DESCRIPTION_MIN} characters.`,
    };
  }
  if (length > SHORT_DESCRIPTION_MAX) {
    return {
      ok: false,
      code: ShortDescriptionErrors.SHORT_DESCRIPTION_TOO_LONG,
      message: `short_description must be at most ${SHORT_DESCRIPTION_MAX} characters.`,
    };
  }

  return { ok: true, value: normalized };
}
