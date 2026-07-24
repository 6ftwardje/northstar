import { afterEach, describe, expect, it, vi } from "vitest";

describe("calendar credential encryption", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("round-trips a token without storing it as plaintext", async () => {
    vi.stubEnv(
      "CALENDAR_TOKEN_ENCRYPTION_KEY",
      Buffer.alloc(32, 7).toString("base64"),
    );
    const { decryptCalendarSecret, encryptCalendarSecret } = await import(
      "./crypto"
    );
    const encrypted = encryptCalendarSecret("refresh-token-value");

    expect(encrypted).not.toContain("refresh-token-value");
    expect(decryptCalendarSecret(encrypted)).toBe("refresh-token-value");
  });

  it("rejects ciphertext that was modified", async () => {
    vi.stubEnv(
      "CALENDAR_TOKEN_ENCRYPTION_KEY",
      Buffer.alloc(32, 9).toString("base64"),
    );
    const { decryptCalendarSecret, encryptCalendarSecret } = await import(
      "./crypto"
    );
    const encrypted = encryptCalendarSecret("secret");
    const tampered = `${encrypted.slice(0, -1)}${
      encrypted.endsWith("a") ? "b" : "a"
    }`;

    expect(() => decryptCalendarSecret(tampered)).toThrow();
  });
});
