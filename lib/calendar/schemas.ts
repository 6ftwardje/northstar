import { z } from "zod";

export const GoogleCallbackSchema = z.object({
  state: z.string().min(32).max(512),
  code: z.string().min(1).max(4096).optional(),
  error: z.string().max(120).optional(),
});

export const CalendarSourceSettingsSchema = z.object({
  selectedCalendarIds: z.array(z.string().min(1).max(1024)).max(25),
  writableCalendarId: z.string().min(1).max(1024).nullable(),
});

export const CalendarProposalInputSchema = z
  .object({
    action: z.enum(["create", "update"]),
    title: z.string().trim().min(1).max(160),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    timezone: z.string().trim().min(1).max(80),
    location: z.string().trim().max(200).nullable().default(null),
    rationale: z.string().trim().max(500),
    googleEventId: z.string().trim().min(1).max(1024).nullable().default(null),
    sourceEntryId: z.string().uuid().nullable().default(null),
  })
  .superRefine((value, context) => {
    const start = new Date(value.startsAt);
    const end = new Date(value.endsAt);
    if (end <= start) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Eindtijd moet na de starttijd liggen.",
      });
    }
    if (end.getTime() - start.getTime() > 12 * 60 * 60 * 1000) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Een voorstel mag maximaal twaalf uur duren.",
      });
    }
    if (value.action === "update" && !value.googleEventId) {
      context.addIssue({
        code: "custom",
        path: ["googleEventId"],
        message: "Een update vereist een bestaand event.",
      });
    }
  });

export const CalendarConfirmationSchema = z.object({
  version: z.number().int().positive(),
});

export const CoachCalendarProposalSchema = z
  .object({
    action: z.enum(["create", "update"]),
    title: z.string().trim().min(1).max(160),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    timezone: z.string().trim().min(1).max(80),
    location: z.string().trim().max(200).nullable(),
    existingEventId: z.string().max(1024).nullable(),
    rationale: z.string().trim().min(1).max(500),
  })
  .nullable();

export type CalendarProposalInput = z.infer<
  typeof CalendarProposalInputSchema
>;
