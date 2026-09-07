import { describe, expect, it } from "vitest";
import {
  maskIraqiPhoneForDisplay,
  InvalidIraqiMobileError,
} from "./identifier";

describe("maskIraqiPhoneForDisplay — Authoritative Iraqi Phone Display Masking", () => {
  it("masks standard local 07XXXXXXXXX format", () => {
    expect(maskIraqiPhoneForDisplay("07701234567")).toBe("+964 7XX *** 4567");
    expect(maskIraqiPhoneForDisplay("07809876543")).toBe("+964 7XX *** 6543");
    expect(maskIraqiPhoneForDisplay("07501112233")).toBe("+964 7XX *** 2233");
  });

  it("masks +964 format correctly", () => {
    expect(maskIraqiPhoneForDisplay("+9647701234567")).toBe("+964 7XX *** 4567");
    expect(maskIraqiPhoneForDisplay("+9647809876543")).toBe("+964 7XX *** 6543");
  });

  it("masks 00964 international prefix format", () => {
    expect(maskIraqiPhoneForDisplay("009647701234567")).toBe("+964 7XX *** 4567");
  });

  it("masks bare 964 and bare 7 format", () => {
    expect(maskIraqiPhoneForDisplay("9647701234567")).toBe("+964 7XX *** 4567");
    expect(maskIraqiPhoneForDisplay("7701234567")).toBe("+964 7XX *** 4567");
  });

  it("handles spaces, dashes, and parentheses gracefully", () => {
    expect(maskIraqiPhoneForDisplay("0770 123 4567")).toBe("+964 7XX *** 4567");
    expect(maskIraqiPhoneForDisplay("0770-123-4567")).toBe("+964 7XX *** 4567");
    expect(maskIraqiPhoneForDisplay("(0770) 123 4567")).toBe("+964 7XX *** 4567");
    expect(maskIraqiPhoneForDisplay("+964 (770) 123-4567")).toBe("+964 7XX *** 4567");
  });

  it("never exposes carrier code (77/78/75) or middle 5 digits", () => {
    const masked = maskIraqiPhoneForDisplay("07701234567");
    expect(masked).not.toContain("77");
    expect(masked).not.toContain("0123");
    expect(masked).toBe("+964 7XX *** 4567");
  });

  it("fails safely and throws InvalidIraqiMobileError for invalid inputs without returning raw input", () => {
    const invalidInputs = [
      "",
      "   ",
      "0770123456", // too short (10 digits)
      "077012345678", // too long (12 digits)
      "01234567890", // non-mobile 01 prefix
      "+12025550123", // US number
      "+964123456789", // Baghdad landline
      "not-a-number",
      "user@example.com",
      "0770abc4567",
    ];

    for (const input of invalidInputs) {
      expect(() => maskIraqiPhoneForDisplay(input)).toThrow(InvalidIraqiMobileError);
    }
  });
});
