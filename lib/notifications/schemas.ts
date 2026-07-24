import { z } from "zod";

export const PushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(4_000),
  expirationTime: z.number().int().positive().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(20).max(1_000),
    auth: z.string().min(8).max(500),
  }),
});

export const NotificationPreferencesSchema = z.object({
  morningEnabled: z.boolean().optional(),
  eveningEnabled: z.boolean().optional(),
  eveningFollowupEnabled: z.boolean().optional(),
  weeklyEnabled: z.boolean().optional(),
  privateLockScreen: z.boolean().optional(),
});

export type NotificationPreferencesInput = z.infer<
  typeof NotificationPreferencesSchema
>;
