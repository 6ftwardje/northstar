import { z } from "zod";

export const CoachRequestSchema = z.object({
  message: z.string().trim().min(1).max(12_000),
  channel: z.enum(["journal", "chat"]).default("journal"),
  occurredAt: z.string().datetime().nullable().default(null),
  clientEntryId: z.string().uuid().optional(),
});

export const MemoryCandidateSchema = z.object({
  kind: z.enum([
    "fact",
    "preference",
    "goal",
    "commitment",
    "pattern",
    "relationship",
    "project",
  ]),
  title: z.string().max(100),
  content: z.string().max(800),
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
  explicit: z.boolean(),
  tags: z.array(z.string().max(40)).max(8),
});

export const CoachOutputSchema = z.object({
  reply: z.string().min(1).max(2_500),
  intervention: z.enum([
    "acknowledge",
    "reflect",
    "question",
    "redirect",
    "challenge",
    "celebrate",
  ]),
  observation: z.string().max(500),
  suggestedAction: z
    .object({
      title: z.string().max(140),
      dueAt: z.string().datetime().nullable(),
      impactDomain: z
        .enum(["business", "sleep", "movement", "cannabis", "life"])
        .nullable(),
    })
    .nullable(),
  memoryCandidates: z.array(MemoryCandidateSchema).max(4),
});

export type CoachOutput = z.infer<typeof CoachOutputSchema>;
