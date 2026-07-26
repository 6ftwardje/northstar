import { describe, expect, it } from "vitest";
import { memoryIdentity } from "./persistence";

describe("memoryIdentity", () => {
  it("normalizes case, accents and punctuation", () => {
    expect(memoryIdentity("goal", "Béter slapen!")).toBe(
      memoryIdentity("goal", "beter slapen"),
    );
  });

  it("keeps memory kinds isolated", () => {
    expect(memoryIdentity("goal", "Gym")).not.toBe(
      memoryIdentity("preference", "Gym"),
    );
  });
});
