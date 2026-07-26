import { describe, expect, it } from "vitest";
import { CoachTodoChangeSchema, TodoDraftSchema } from "./schemas";

describe("todo contracts", () => {
  it("accepts a small concrete task", () => {
    expect(
      TodoDraftSchema.safeParse({
        title: "Bel de arts voor een afspraak",
        desiredOutcome: "Een consultatie staat ingepland.",
        estimatedMinutes: 10,
        dueAt: null,
        impactDomain: "life",
      }).success,
    ).toBe(true);
  });

  it("rejects project-sized work", () => {
    expect(
      TodoDraftSchema.safeParse({
        title: "Bouw de volledige website",
        desiredOutcome: "Website staat online.",
        estimatedMinutes: 180,
      }).success,
    ).toBe(false);
  });

  it("requires 24-hour local time from the coach", () => {
    expect(
      CoachTodoChangeSchema.safeParse({
        operation: "create",
        commitmentId: null,
        title: "Stuur offerte naar klant",
        desiredOutcome: "De klant heeft de offerte ontvangen.",
        estimatedMinutes: 20,
        dueAtLocal: "2026-07-27T18:00",
        impactDomain: "business",
        reason: "Dit is de eerstvolgende omzetactie.",
      }).success,
    ).toBe(true);
  });
});
