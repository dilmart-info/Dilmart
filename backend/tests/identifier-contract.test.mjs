/**
 * Cross-boundary contract: the frontend identifier helper and the backend phone util must
 * agree on every accepted Iraqi mobile shape.
 *
 * The case table is duplicated here on purpose — the backend cannot import from src/ — but
 * it is duplicated *verbatim* from src/lib/auth/identifier.test.ts. If either side changes
 * its behaviour, one of the two suites fails, which is the whole point.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { toWhatsAppE164, maskPhoneForLogs } = await import("../dist/modules/auth/otp-phone.util.js");

const SHARED_PHONE_CASES = [
  { input: "07501234567", expected: "+9647501234567" },
  { input: "+9647501234567", expected: "+9647501234567" },
  { input: "9647501234567", expected: "+9647501234567" },
  { input: "009647501234567", expected: "+9647501234567" },
  { input: "7501234567", expected: "+9647501234567" },
  { input: "  07501234567  ", expected: "+9647501234567" },
];

const SHARED_INVALID_PHONES = [
  "",
  "   ",
  "0750123456",
  "075012345678",
  "06501234567",
  "not-a-number",
  "+15551234567",
];

test("backend normalisation matches the frontend case table", () => {
  for (const { input, expected } of SHARED_PHONE_CASES) {
    assert.equal(toWhatsAppE164(input), expected, `mismatch for ${JSON.stringify(input)}`);
  }
});

test("backend rejects every input the frontend rejects", () => {
  for (const input of SHARED_INVALID_PHONES) {
    assert.throws(() => toWhatsAppE164(input), `expected rejection for ${JSON.stringify(input)}`);
  }
});

test("backend does not accept spaced input — the client sanitises before sending", () => {
  // Documented boundary, not a bug. src/lib/auth/identifier.ts strips spacing and
  // punctuation before producing an E.164 string, so a spaced number never reaches the
  // backend in that form. Asserting it here keeps the division of labour explicit.
  assert.throws(() => toWhatsAppE164("0750 123 4567"));
  assert.equal(toWhatsAppE164("07501234567"), "+9647501234567");
});

test("masking never reveals the full number", () => {
  const masked = maskPhoneForLogs("+9647501234567");
  assert.ok(!masked.includes("750123"));
  assert.ok(masked.endsWith("4567"));
});
