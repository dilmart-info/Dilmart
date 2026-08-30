/**
 * Iraq commercial-date semantics for Merchant Commercial Agreement effective dates.
 *
 * A bare calendar date (e.g. "2026-11-01") picked by an admin means "00:00 on that date in
 * Asia/Baghdad" — never UTC midnight (`new Date("2026-11-01").toISOString()`, which is 03:00
 * Baghdad time) and never the operator's own browser-local midnight. Iraq has no seasonal DST in
 * our business logic, so the fixed UTC+3 offset below is applied explicitly and deliberately, not
 * derived from browser locale.
 *
 * The reverse direction (an instant → the Iraqi calendar date it represents, for display) uses the
 * IANA "Asia/Baghdad" zone via the platform's Intl support, which needs no offset math of our own.
 *
 * Mirrored (kept in sync manually, not imported — separate build targets) in
 * backend/scripts/set-ard-al-khaleej-commercial-agreement.mjs.
 */

export const BAGHDAD_UTC_OFFSET = "+03:00";
export const BAGHDAD_TIME_ZONE = "Asia/Baghdad";

/** "YYYY-MM-DD" → ISO instant for 00:00:00 on that date in Asia/Baghdad. */
export function baghdadCalendarDateToInstant(dateOnly: string): string {
  const instant = new Date(`${dateOnly}T00:00:00${BAGHDAD_UTC_OFFSET}`);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Invalid calendar date: "${dateOnly}"`);
  }
  return instant.toISOString();
}

/** The Iraqi commercial calendar day (YYYY-MM-DD) an instant falls on. */
export function instantToBaghdadCalendarDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BAGHDAD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Formats an instant as the Iraqi commercial calendar date it represents, for display. Throws on
 *  an unparseable instant instead of letting toLocaleDateString silently return the literal string
 *  "Invalid Date" — callers (e.g. MerchantCommercialAgreement's formatDate) rely on the throw to
 *  produce their own "—" fallback. */
export function formatBaghdadCalendarDate(iso: string, options: Intl.DateTimeFormatOptions = {}): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Invalid instant: "${iso}"`);
  }
  return instant.toLocaleDateString("ar-IQ", { timeZone: BAGHDAD_TIME_ZONE, ...options });
}
