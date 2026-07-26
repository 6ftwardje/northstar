import { describe, expect, it } from "vitest";
import { localDateTimeToUtc } from "./local-time";

describe("24-hour calendar time", () => {
  it("keeps 18:30 as Brussels local time in summer", () => {
    expect(
      localDateTimeToUtc(
        "2026-07-27T18:30",
        "Europe/Brussels",
      ).toISOString(),
    ).toBe("2026-07-27T16:30:00.000Z");
  });

  it("keeps 18:30 as Brussels local time in winter", () => {
    expect(
      localDateTimeToUtc(
        "2026-12-27T18:30",
        "Europe/Brussels",
      ).toISOString(),
    ).toBe("2026-12-27T17:30:00.000Z");
  });

  it("rejects 12-hour clock output", () => {
    expect(() =>
      localDateTimeToUtc("2026-07-27T6:30 PM", "Europe/Brussels"),
    ).toThrow("LOCAL_DATE_TIME_INVALID");
  });

  it("rejects a nonexistent DST wall-clock time", () => {
    expect(() =>
      localDateTimeToUtc("2026-03-29T02:30", "Europe/Brussels"),
    ).toThrow("LOCAL_DATE_TIME_NONEXISTENT");
  });
});
