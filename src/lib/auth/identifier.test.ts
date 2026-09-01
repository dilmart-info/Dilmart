import { describe, expect, it } from "vitest";
import {
  InvalidIraqiMobileError,
  isValidEmail,
  isValidIraqiMobile,
  looksLikeEmail,
  maskIdentifierForLogs,
  toIraqiE164,
  toIraqiLocalDisplay,
  getCustomerFacingEmail,
} from "./identifier";

/**
 * The shared case table. backend/tests/identifier-contract.test.mjs runs the same inputs
 * through toWhatsAppE164 and asserts the same outputs, so the two implementations cannot
 * drift apart without one of the suites failing.
 */
export const SHARED_PHONE_CASES = [
  { input: "07501234567", expected: "+9647501234567" },
  { input: "+9647501234567", expected: "+9647501234567" },
  { input: "9647501234567", expected: "+9647501234567" },
  { input: "009647501234567", expected: "+9647501234567" },
  { input: "7501234567", expected: "+9647501234567" },
  { input: "  07501234567  ", expected: "+9647501234567" },
];

export const SHARED_INVALID_PHONES = [
  "",
  "   ",
  "0750123456", // one digit short
  "075012345678", // one digit long
  "06501234567", // not a mobile prefix
  "not-a-number",
  "+15551234567", // wrong country
];

describe("toIraqiE164", () => {
  it.each(SHARED_PHONE_CASES)("normalises $input", ({ input, expected }) => {
    expect(toIraqiE164(input)).toBe(expected);
  });

  it.each(SHARED_INVALID_PHONES)("rejects %j", (input) => {
    expect(() => toIraqiE164(input)).toThrow(InvalidIraqiMobileError);
  });

  it("sanitises spacing and punctuation into a backend-accepted shape", () => {
    // Frontend-only input sanitisation. The backend util does not accept spaced input,
    // so this is deliberately NOT in the shared contract table — what matters is that
    // whatever leaves the client is already a shape the backend produces the same
    // result for.
    expect(toIraqiE164("0750 123 4567")).toBe("+9647501234567");
    expect(toIraqiE164("+964 750-123-4567")).toBe("+9647501234567");
  });

  it("never treats an email as a phone number", () => {
    expect(() => toIraqiE164("07501234567@example.com")).toThrow(InvalidIraqiMobileError);
    expect(() => toIraqiE164("name@example.com")).toThrow(InvalidIraqiMobileError);
  });

  it("rejects non-string input instead of coercing it", () => {
    expect(() => toIraqiE164(undefined as unknown as string)).toThrow(InvalidIraqiMobileError);
    expect(() => toIraqiE164(7501234567 as unknown as string)).toThrow(InvalidIraqiMobileError);
  });
});

describe("isValidIraqiMobile", () => {
  it("agrees with toIraqiE164", () => {
    for (const { input } of SHARED_PHONE_CASES) expect(isValidIraqiMobile(input)).toBe(true);
    for (const input of SHARED_INVALID_PHONES) expect(isValidIraqiMobile(input)).toBe(false);
  });
});

describe("email detection", () => {
  it("treats anything with @ as an email", () => {
    expect(looksLikeEmail("name@example.com")).toBe(true);
    expect(looksLikeEmail("07501234567")).toBe(false);
  });

  it("validates the basic email shape", () => {
    expect(isValidEmail("name@example.com")).toBe(true);
    expect(isValidEmail("name@example")).toBe(false);
    expect(isValidEmail("name.example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("display and logging", () => {
  it("shows the local form the user typed", () => {
    expect(toIraqiLocalDisplay("+9647501234567")).toBe("07501234567");
    expect(toIraqiLocalDisplay("07501234567")).toBe("07501234567");
  });

  it("never reveals a full number in logs", () => {
    const masked = maskIdentifierForLogs("+9647501234567");
    expect(masked).not.toContain("750123");
    expect(masked.endsWith("4567")).toBe(true);
    expect(maskIdentifierForLogs("123")).toBe("***");
  });
});

describe("getCustomerFacingEmail", () => {
  it("returns normal customer email", () => {
    expect(getCustomerFacingEmail("user@example.com")).toBe("user@example.com");
    expect(getCustomerFacingEmail("ali.karim@gmail.com")).toBe("ali.karim@gmail.com");
  });

  it("returns null for internal provisional domains without leaking implementation details", () => {
    expect(getCustomerFacingEmail("guest_123@provisional.dilmart.com")).toBeNull();
    expect(getCustomerFacingEmail("user@provisional.dilmart.org")).toBeNull();
    expect(getCustomerFacingEmail("temp@provisional.local")).toBeNull();
    expect(getCustomerFacingEmail("guest@sub.provisional.local")).toBeNull();
    expect(getCustomerFacingEmail("")).toBeNull();
    expect(getCustomerFacingEmail(null)).toBeNull();
    expect(getCustomerFacingEmail(undefined)).toBeNull();
  });
});
