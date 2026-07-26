import { describe, expect, it } from "vitest";
import { selectRelevantHistory } from "./retrieval";

const now = new Date("2026-07-26T12:00:00.000Z");

describe("selectRelevantHistory", () => {
  it("prioritizes yesterday when the user asks for it", () => {
    const selected = selectRelevantHistory({
      query: "Maak een plan op basis van mijn check-in van gisteren",
      now,
      limit: 1,
      items: [
        {
          id: "old",
          type: "review",
          occurredAt: "2026-07-10T20:00:00.000Z",
          content: "Oude check-in",
        },
        {
          id: "yesterday",
          type: "review",
          occurredAt: "2026-07-25T20:00:00.000Z",
          content: "Energie 4, niet bewogen",
        },
      ],
    });
    expect(selected[0]?.id).toBe("yesterday");
  });

  it("retrieves older topic matches over unrelated recent notes", () => {
    const selected = selectRelevantHistory({
      query: "Wat speelt er bij project Atlas?",
      now,
      limit: 1,
      items: [
        {
          id: "recent",
          type: "entry",
          occurredAt: "2026-07-26T08:00:00.000Z",
          content: "Ontbijt gemaakt",
        },
        {
          id: "atlas",
          type: "entry",
          occurredAt: "2026-06-20T08:00:00.000Z",
          content: "Project Atlas wacht op feedback van Maxim",
        },
      ],
    });
    expect(selected[0]?.id).toBe("atlas");
  });
});
