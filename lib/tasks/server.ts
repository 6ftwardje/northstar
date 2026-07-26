import { localDateTimeToUtc } from "../calendar/local-time";
import { createAdminSupabaseClient } from "../supabase/server";
import {
  type CoachTodoChange,
  TodoDraftSchema,
} from "./schemas";
import { isConcreteTodoTitle } from "./quality";

type CommitmentRow = {
  id: string;
  title: string;
  status: string;
  coachRevision: number;
};

export async function applyCoachTodoChanges({
  userId,
  sourceEntryId,
  timezone,
  changes,
  existingCommitments,
}: {
  userId: string;
  sourceEntryId: string;
  timezone: string;
  changes: CoachTodoChange[];
  existingCommitments: CommitmentRow[];
}) {
  const admin = createAdminSupabaseClient();
  const existing = new Map(
    existingCommitments.map((commitment) => [commitment.id, commitment]),
  );
  const appliedIds: string[] = [];

  for (const change of changes.slice(0, 4)) {
    if (change.operation === "create") {
      if (
        change.commitmentId ||
        !change.title ||
        !change.desiredOutcome ||
        !change.estimatedMinutes ||
        !isConcreteTodoTitle(change.title)
      ) {
        continue;
      }
      const dueAt = change.dueAtLocal
        ? localDateTimeToUtc(change.dueAtLocal, timezone).toISOString()
        : null;
      const parsed = TodoDraftSchema.safeParse({
        title: change.title,
        desiredOutcome: change.desiredOutcome,
        estimatedMinutes: change.estimatedMinutes,
        dueAt,
        impactDomain: change.impactDomain,
      });
      if (!parsed.success) continue;
      const { data } = await admin
        .from("commitments")
        .insert({
          user_id: userId,
          source_entry_id: sourceEntryId,
          title: parsed.data.title,
          desired_outcome: parsed.data.desiredOutcome,
          estimated_minutes: parsed.data.estimatedMinutes,
          due_at: parsed.data.dueAt,
          impact_domain: parsed.data.impactDomain,
          status: "open",
          source: "coach",
          coach_revision: 1,
          metadata: { coach_reason: change.reason },
        })
        .select("id")
        .single();
      if (data) appliedIds.push(data.id);
      continue;
    }

    if (!change.commitmentId) continue;
    const current = existing.get(change.commitmentId);
    if (!current || current.status !== "open") continue;

    if (change.operation === "complete" || change.operation === "cancel") {
      const status = change.operation === "complete" ? "done" : "cancelled";
      const { data } = await admin
        .from("commitments")
        .update({
          status,
          completed_at:
            status === "done" ? new Date().toISOString() : null,
          coach_revision: current.coachRevision + 1,
          metadata: { coach_reason: change.reason },
        })
        .eq("id", current.id)
        .eq("user_id", userId)
        .eq("status", "open")
        .select("id")
        .maybeSingle();
      if (data) appliedIds.push(data.id);
      continue;
    }

    if (
      !change.title ||
      !change.desiredOutcome ||
      !change.estimatedMinutes ||
      !isConcreteTodoTitle(change.title)
    ) {
      continue;
    }
    const dueAt = change.dueAtLocal
      ? localDateTimeToUtc(change.dueAtLocal, timezone).toISOString()
      : null;
    const parsed = TodoDraftSchema.safeParse({
      title: change.title,
      desiredOutcome: change.desiredOutcome,
      estimatedMinutes: change.estimatedMinutes,
      dueAt,
      impactDomain: change.impactDomain,
    });
    if (!parsed.success) continue;
    const { data } = await admin
      .from("commitments")
      .update({
        title: parsed.data.title,
        desired_outcome: parsed.data.desiredOutcome,
        estimated_minutes: parsed.data.estimatedMinutes,
        due_at: parsed.data.dueAt,
        impact_domain: parsed.data.impactDomain,
        coach_revision: current.coachRevision + 1,
        metadata: { coach_reason: change.reason },
      })
      .eq("id", current.id)
      .eq("user_id", userId)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (data) appliedIds.push(data.id);
  }
  return appliedIds;
}
