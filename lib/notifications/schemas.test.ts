import { describe, expect, it } from "vitest";
import {
  NotificationPreferencesSchema,
  PushSubscriptionSchema,
} from "./schemas";

describe("PushSubscriptionSchema", () => {
  it("accepts a browser push subscription", () => {
    expect(
      PushSubscriptionSchema.safeParse({
        endpoint: "https://push.example.test/subscription/abc",
        expirationTime: null,
        keys: {
          p256dh: "a".repeat(65),
          auth: "b".repeat(16),
        },
      }).success,
    ).toBe(true);
  });

  it("rejects malformed endpoints and weak keys", () => {
    expect(
      PushSubscriptionSchema.safeParse({
        endpoint: "not-a-url",
        keys: { p256dh: "short", auth: "short" },
      }).success,
    ).toBe(false);
  });
});

describe("NotificationPreferencesSchema", () => {
  it("only accepts supported boolean preferences", () => {
    expect(
      NotificationPreferencesSchema.parse({
        morningEnabled: false,
        privateLockScreen: true,
        unknownSetting: "ignored",
      }),
    ).toEqual({
      morningEnabled: false,
      privateLockScreen: true,
    });
  });
});
