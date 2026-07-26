import { z } from "zod";
import { isLocalDateTime } from "../calendar/local-time";

export const ImpactDomainSchema = z
  .enum(["business", "sleep", "movement", "cannabis", "life"])
  .nullable();

export const TodoDraftSchema = z.object({
  title: z.string().trim().min(5).max(140),
  desiredOutcome: z.string().trim().min(5).max(280),
  estimatedMinutes: z.number().int().min(5).max(30),
  dueAt: z.string().datetime().nullable().default(null),
  impactDomain: ImpactDomainSchema.default(null),
});

export const TodoCreateSchema = TodoDraftSchema;

export const TodoUpdateSchema = z
  .object({
    title: z.string().trim().min(5).max(140).optional(),
    desiredOutcome: z.string().trim().min(5).max(280).optional(),
    estimatedMinutes: z.number().int().min(5).max(30).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    impactDomain: ImpactDomainSchema.optional(),
    status: z.enum(["open", "done", "cancelled"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

const LocalDateTimeSchema = z
  .string()
  .refine(isLocalDateTime, "Gebruik YYYY-MM-DDTHH:mm in 24-uurs tijd.");

export const CoachTodoChangeSchema = z.object({
  operation: z.enum(["create", "update", "complete", "cancel"]),
  commitmentId: z.string().uuid().nullable(),
  title: z.string().trim().min(5).max(140).nullable(),
  desiredOutcome: z.string().trim().min(5).max(280).nullable(),
  estimatedMinutes: z.number().int().min(5).max(30).nullable(),
  dueAtLocal: LocalDateTimeSchema.nullable(),
  impactDomain: ImpactDomainSchema,
  reason: z.string().trim().min(1).max(240),
});

export type CoachTodoChange = z.infer<typeof CoachTodoChangeSchema>;
