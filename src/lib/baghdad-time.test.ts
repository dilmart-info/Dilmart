import { describe, expect, it } from "vitest";
import { baghdadCalendarDateToInstant, formatBaghdadCalendarDate, instantToBaghdadCalendarDate } from "./baghdad-time";

describe("baghdadCalendarDateToInstant", () => {
  it("2026-01-15 -> Baghdad midnight is 21:00 UTC the previous day (UTC+3, no DST)", () => {
    expect(baghdadCalendarDateToInstant("2026-01-15")).toBe("2026-01-14T21:00:00.000Z");
  });

  it("2026-08-15 -> Baghdad midnight is 21:00 UTC the previous day (no seasonal DST assumed)", () => {
    expect(baghdadCalendarDateToInstant("2026-08-15")).toBe("2026-08-14T21:00:00.000Z");
  });

  it("never equals naive UTC-midnight parsing of the same date string", () => {
    const naiveUtc = new Date("2026-11-01T00:00:00.000Z").toISOString();
    expect(baghdadCalendarDateToInstant("2026-11-01")).not.toBe(naiveUtc);
    expect(baghdadCalendarDateToInstant("2026-11-01")).toBe("2026-10-31T21:00:00.000Z");
  });

  it("throws on an invalid date string instead of silently producing a bad instant", () => {
    expect(() => baghdadCalendarDateToInstant("not-a-date")).toThrow();
  });
});

describe("instantToBaghdadCalendarDate / formatBaghdadCalendarDate", () => {
  it("round-trips: the instant for Baghdad midnight on a date maps back to that same date", () => {
    const instant = baghdadCalendarDateToInstant("2026-11-01");
    expect(instantToBaghdadCalendarDate(instant)).toBe("2026-11-01");
  });

  it("reads the correct Iraqi calendar day even for an instant late in the Baghdad evening", () => {
    // 2026-01-15T20:00:00Z = 2026-01-15T23:00:00+03:00 — still Jan 15 in Baghdad.
    expect(instantToBaghdadCalendarDate("2026-01-15T20:00:00.000Z")).toBe("2026-01-15");
    // 2026-01-15T21:30:00Z = 2026-01-16T00:30:00+03:00 — already Jan 16 in Baghdad.
    expect(instantToBaghdadCalendarDate("2026-01-15T21:30:00.000Z")).toBe("2026-01-16");
  });

  it("formats using the Asia/Baghdad zone regardless of what date/time the instant carries", () => {
    // ar-IQ renders Eastern Arabic numerals (matches existing repo convention, e.g. finance-ui.ts's
    // fmt()) — assert on the day-of-month digit itself rather than an ASCII "2026".
    const label = formatBaghdadCalendarDate(baghdadCalendarDateToInstant("2026-08-15"), {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    expect(label).toContain("١٥"); // Eastern Arabic "15"
  });

  it("throws on an unparseable instant instead of returning the literal string 'Invalid Date'", () => {
    // toLocaleDateString on an Invalid Date silently returns "Invalid Date" rather than throwing —
    // callers rely on the throw to produce their own fallback (e.g. "—").
    expect(() => formatBaghdadCalendarDate("not-an-instant")).toThrow();
  });
});
