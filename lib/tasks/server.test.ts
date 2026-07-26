import { describe, expect, it } from "vitest";
import { isConcreteTodoTitle } from "./quality";

describe("todo title quality", () => {
  it("accepts verb-first actions", () => {
    expect(isConcreteTodoTitle("Bel de arts voor een afspraak")).toBe(true);
    expect(isConcreteTodoTitle("Stuur de offerte naar Sofie")).toBe(true);
  });

  it("rejects vague labels and projects", () => {
    expect(isConcreteTodoTitle("Arts")).toBe(false);
    expect(isConcreteTodoTitle("Werken aan website")).toBe(false);
    expect(isConcreteTodoTitle("Project lancering")).toBe(false);
  });
});
