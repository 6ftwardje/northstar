import { describe, expect, it } from "vitest";
import {
  CalendarConfirmationSchema,
  CalendarProposalInputSchema,
  CalendarSourceSettingsSchema,
} from "./schemas";

describe("calendar contracts", () => {
  it("accepts an explicit, bounded create proposal", () => {
    expect(
      CalendarProposalInputSchema.safeParse({
        action: "create",
        title: "Gym",
        startsAt: "2026-08-01T17:00:00.000Z",
        endsAt: "2026-08-01T18:00:00.000Z",
        timezone: "Europe/Brussels",
        location: null,
        rationale: "Beweging vooraf vastleggen.",
      }).success,
    ).toBe(true);
  });

  it("rejects updates without an exact event id", () => {
    expect(
      CalendarProposalInputSchema.safeParse({
        action: "update",
        title: "Focusblok",
        startsAt: "2026-08-01T17:00:00.000Z",
        endsAt: "2026-08-01T18:00:00.000Z",
        timezone: "Europe/Brussels",
        location: null,
        rationale: "Meer impact.",
      }).success,
    ).toBe(false);
  });

  it("requires a positive proposal version on confirmation", () => {
    expect(CalendarConfirmationSchema.safeParse({ version: 0 }).success).toBe(
      false,
    );
  });

  it("accepts a bounded calendar selection for server-side verification", () => {
    expect(
      CalendarSourceSettingsSchema.safeParse({
        selectedCalendarIds: ["primary"],
        writableCalendarId: "work",
      }).success,
    ).toBe(true);
  });
});
