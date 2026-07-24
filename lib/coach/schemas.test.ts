import { describe, expect, it } from "vitest";
import { CoachOutputSchema, CoachRequestSchema } from "./schemas";

describe("coach contracts", () => {
  it("accepts a journal entry with an idempotency id", () => {
    const result = CoachRequestSchema.safeParse({
      message: "Vandaag heb ik de belangrijkste offerte verstuurd.",
      channel: "journal",
      clientEntryId: "be87c218-8666-4e9f-9ce8-0788b72a86d1",
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty entries", () => {
    expect(
      CoachRequestSchema.safeParse({ message: "   ", channel: "journal" })
        .success,
    ).toBe(false);
  });

  it("keeps coach output concise and structured", () => {
    const result = CoachOutputSchema.safeParse({
      reply: "Goed. Wat is nu de volgende stap met echte impact?",
      intervention: "question",
      observation: "De belangrijkste actie is afgerond.",
      suggestedAction: null,
      memoryCandidates: [],
      calendarProposal: null,
    });

    expect(result.success).toBe(true);
  });
});
