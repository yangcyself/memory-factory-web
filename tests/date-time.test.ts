import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  isValidTimeZone,
  zonedDayBoundaries,
  zonedLocalDateTimeToUtc,
} from "../lib/date-time";

describe("review time zones", () => {
  it("validates IANA zones", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Not/A_Zone")).toBe(false);
  });
  it("converts a local schedule time to UTC", () => {
    expect(
      zonedLocalDateTimeToUtc(
        "2026-08-26T09:30",
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-08-26T13:30:00.000Z");
  });
  it("uses DST-aware local day boundaries", () => {
    const bounds = zonedDayBoundaries(
      new Date("2026-03-08T16:00:00Z"),
      "America/New_York",
    );
    expect(bounds.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(bounds.tomorrow.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
  it("includes the configured time-zone abbreviation", () => {
    expect(
      formatDateTime("2026-08-26T13:30:00Z", "America/New_York"),
    ).toContain("EDT");
  });
});
