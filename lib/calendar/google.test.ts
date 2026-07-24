import { describe, expect, it } from "vitest";
import { deterministicGoogleEventId } from "./google";

describe("Google Calendar idempotency", () => {
  it("creates a stable Google-compatible event id", () => {
    const first = deterministicGoogleEventId(
      "3a828f59-e73e-46c8-8045-8ecdbccb9433",
    );
    const second = deterministicGoogleEventId(
      "3a828f59-e73e-46c8-8045-8ecdbccb9433",
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-v]{32}$/);
  });
});
