/**
 * Frontend defense-in-depth mirror of backend/src/modules/store-integration/barber-handoff/
 * barber-handoff-target.validator.ts's first-slice allowlist ('/' and '/store/:slug' only).
 * The backend is authoritative and already validated this target before returning it in the
 * redeem response — this is a second, independent check before `navigate()` ever runs, so a
 * compromised/buggy backend response can never send the browser somewhere unexpected.
 */
const SLUG_RE = /^[a-z0-9؀-ۿ]+(?:-[a-z0-9؀-ۿ]+)*$/;

export function validateBarberTarget(input: unknown): string | null {
  if (typeof input !== "string" || input.length === 0 || input.length > 200) return null;
  if (input === "/") return "/";
  if (input[0] !== "/" || input.startsWith("//")) return null;

  const segments = input.slice(1).split("/");
  if (segments.length === 2 && segments[0] === "store") {
    const slug = segments[1];
    if (slug.length > 0 && slug.length <= 120 && SLUG_RE.test(slug)) {
      return input;
    }
  }
  return null;
}
