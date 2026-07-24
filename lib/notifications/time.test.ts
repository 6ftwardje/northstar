import { describe, expect, it } from "vitest";
import {
  localDateKey,
  minutesAfter,
  zonedDateTimeToUtc,
  zonedParts,
} from "./time";

describe("notification time helpers", () => {
  it("converts Brussels summer time to UTC", () => {
    expect(
      zonedDateTimeToUtc(
        "2026-07-24",
        "21:00:00",
        "Europe/Brussels",
      ).toISOString(),
    ).toBe("2026-07-24T19:00:00.000Z");
  });

  it("handles Brussels winter time", () => {
    expect(
      zonedDateTimeToUtc(
        "2026-12-24",
        "21:00:00",
        "Europe/Brussels",
      ).toISOString(),
    ).toBe("2026-12-24T20:00:00.000Z");
  });

  it("builds local date and weekday values", () => {
    const date = new Date("2026-07-26T10:00:00.000Z");
    expect(localDateKey(date, "Europe/Brussels")).toBe("2026-07-26");
    expect(zonedParts(date, "Europe/Brussels").weekday).toBe(0);
  });

  it("adds the evening follow-up delay", () => {
    expect(minutesAfter("21:00:00", 45)).toBe("21:45");
  });
});
