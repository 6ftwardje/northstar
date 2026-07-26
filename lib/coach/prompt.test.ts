import { describe, expect, it } from "vitest";
import { COACH_INSTRUCTIONS } from "./prompt";

describe("coach identity", () => {
  it("does not hardcode one user's identity or goals", () => {
    expect(COACH_INSTRUCTIONS).not.toContain("Ward");
    expect(COACH_INSTRUCTIONS).toContain("huidige gebruiker");
    expect(COACH_INSTRUCTIONS).toContain("Als business een focus is");
    expect(COACH_INSTRUCTIONS).toContain("Als cannabis aan bod komt");
    expect(COACH_INSTRUCTIONS).toContain("24-uurs tijd");
    expect(COACH_INSTRUCTIONS).toContain("Iedere todo begint");
  });
});
