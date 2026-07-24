import { zodTextFormat } from "openai/helpers/zod";
import { appConfig } from "@/lib/config";
import {
  createCalendarProposal,
  upcomingCalendarContext,
} from "@/lib/calendar/server";
import { compileCoachContext, type MemoryRecord } from "@/lib/context";
import { createOpenAIClient } from "@/lib/openai/client";
import {
  localDateKey,
  zonedDateTimeToUtc,
} from "@/lib/notifications/time";
import { createAdminSupabaseClient, createClient } from "@/lib/supabase/server";
import { COACH_INSTRUCTIONS } from "./prompt";
import { CoachOutputSchema, type CoachOutput } from "./schemas";

type GenerateCoachInput = {
  userId: string;
  entryId: string;
  message: string;
  channel: "journal" | "chat";
};

type MemoryRow = {
  id: string;
  kind: MemoryRecord["kind"];
  title: string;
  content: string;
  confidence: number;
  importance: number;
  status: MemoryRecord["status"];
  valid_from: string;
  valid_until: string | null;
  last_confirmed_at: string | null;
  tags: string[];
};

function toMemory(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    confidence: Number(row.confidence),
    importance: Number(row.importance),
    status: row.status,
    validFrom: row.valid_from,
    validUntil: row.valid_until ?? undefined,
    lastConfirmedAt: row.last_confirmed_at ?? undefined,
    sourceEntryIds: [],
    tags: row.tags ?? [],
  };
}

export async function generateCoachResponse({
  userId,
  entryId,
  message,
  channel,
}: GenerateCoachInput): Promise<CoachOutput> {
  const supabase = await createClient();
  const admin = createAdminSupabaseClient();
  const profileResult = await supabase
    .from("profiles")
    .select("display_name, timezone, coach_settings")
    .eq("id", userId)
    .single();
  const timezone = profileResult.data?.timezone ?? "Europe/Brussels";
  const startOfToday = zonedDateTimeToUtc(
    localDateKey(new Date(), timezone),
    "00:00",
    timezone,
  );

  const [
    entriesResult,
    memoriesResult,
    commitmentsResult,
    reviewsResult,
    calendarContext,
  ] =
    await Promise.all([
      supabase
        .from("journal_entries")
        .select("id, occurred_at, content")
        .gte("occurred_at", startOfToday.toISOString())
        .order("occurred_at", { ascending: true })
        .limit(30),
      supabase
        .from("memories")
        .select(
          "id, kind, title, content, confidence, importance, status, valid_from, valid_until, last_confirmed_at, tags",
        )
        .eq("status", "active")
        .order("importance", { ascending: false })
        .limit(30),
      supabase
        .from("commitments")
        .select("id, title, due_at, status, impact_domain, created_at")
        .eq("status", "open")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(12),
      supabase
        .from("daily_reviews")
        .select("review_date, coach_summary, impact_summary")
        .not("coach_summary", "is", null)
        .order("review_date", { ascending: false })
        .limit(7),
      upcomingCalendarContext(userId),
    ]);

  const memories = ((memoriesResult.data ?? []) as MemoryRow[]).map(toMemory);
  const commitments: MemoryRecord[] = (commitmentsResult.data ?? []).map(
    (commitment) => ({
      id: commitment.id,
      kind: "commitment",
      title: commitment.title,
      content: [
        commitment.impact_domain
          ? `Domein: ${commitment.impact_domain}.`
          : "",
        commitment.due_at ? `Deadline: ${commitment.due_at}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      confidence: 1,
      importance: 0.9,
      status: "active",
      validFrom: commitment.created_at,
      validUntil: commitment.due_at ?? undefined,
      sourceEntryIds: [],
      tags: commitment.impact_domain ? [commitment.impact_domain] : [],
    }),
  );

  const context = compileCoachContext({
    profile: {
      displayName: profileResult.data?.display_name ?? "Northstar-gebruiker",
      timezone: profileResult.data?.timezone ?? "Europe/Brussels",
      coachSettings:
        (profileResult.data?.coach_settings as Record<string, unknown>) ?? {},
    },
    currentEntry: message,
    todaysEntries: (entriesResult.data ?? []).map((entry) => ({
      id: entry.id,
      createdAt: entry.occurred_at,
      content: entry.content,
    })),
    recentSummaries: (reviewsResult.data ?? [])
      .reverse()
      .map((review) => ({
        date: review.review_date,
        content: [review.impact_summary, review.coach_summary]
          .filter(Boolean)
          .join("\n"),
      })),
    activeMemories: memories.filter((memory) => memory.kind !== "pattern"),
    activeCommitments: commitments,
    relevantMemories: memories,
  });

  const openai = createOpenAIClient();
  const response = await openai.responses.parse({
    model: appConfig.openaiModel,
    instructions: COACH_INSTRUCTIONS,
    input: JSON.stringify({
      ...context,
      calendar: {
        connected: calendarContext.length > 0,
        upcomingSevenDays: calendarContext,
      },
    }),
    reasoning: { effort: "medium" },
    text: {
      verbosity: "low",
      format: zodTextFormat(CoachOutputSchema, "northstar_coach_response"),
    },
  });

  const output = response.output_parsed;
  if (!output) {
    throw new Error("OPENAI_EMPTY_STRUCTURED_OUTPUT");
  }

  let calendarProposalId: string | null = null;
  if (output.calendarProposal && calendarContext.length > 0) {
    try {
      const calendarProposal = await createCalendarProposal(userId, {
        action: output.calendarProposal.action,
        title: output.calendarProposal.title,
        startsAt: output.calendarProposal.startsAt,
        endsAt: output.calendarProposal.endsAt,
        timezone: output.calendarProposal.timezone,
        location: output.calendarProposal.location,
        rationale: output.calendarProposal.rationale,
        googleEventId: output.calendarProposal.existingEventId,
        sourceEntryId: entryId,
      });
      calendarProposalId = calendarProposal.id;
    } catch {
      // Coaching remains useful when a calendar suggestion fails validation.
    }
  }

  const { data: coachEntry, error: coachEntryError } = await admin
    .from("journal_entries")
    .insert({
      user_id: userId,
      kind: "coach_message",
      content: output.reply,
      metadata: {
        intervention: output.intervention,
        observation: output.observation,
        in_response_to: entryId,
        channel,
        calendar_proposal_id: calendarProposalId,
      },
    })
    .select("id")
    .single();

  if (coachEntryError) throw coachEntryError;

  if (output.memoryCandidates.length > 0) {
    const { data: insertedMemories, error: memoryError } = await admin
      .from("memories")
      .insert(
        output.memoryCandidates.map((memory) => ({
          user_id: userId,
          kind: memory.kind,
          status: "candidate",
          title: memory.title,
          content: memory.content,
          confidence: memory.confidence,
          importance: memory.importance,
          explicit: memory.explicit,
          tags: memory.tags,
          metadata: {
            extractor_model: appConfig.openaiModel,
            response_id: response.id,
          },
        })),
      )
      .select("id");

    if (memoryError) throw memoryError;

    if (insertedMemories?.length) {
      const { error: sourceError } = await admin.from("memory_sources").insert(
        insertedMemories.map((memory) => ({
          memory_id: memory.id,
          entry_id: entryId,
          evidence_excerpt: message.slice(0, 500),
        })),
      );
      if (sourceError) throw sourceError;
    }
  }

  const { error: contextError } = await admin.from("context_runs").insert({
    user_id: userId,
    entry_id: entryId,
    memory_ids: context.activeState
      .concat(context.relevantHistory)
      .filter((contextMemory) =>
        memories.some((memory) => memory.id === contextMemory.id),
      )
      .map((memory) => memory.id),
    commitment_ids: commitments.map((commitment) => commitment.id),
    context_manifest: {
      entry_count: context.today.length,
      summary_count: context.recentSummaries.length,
      active_memory_count: context.activeState.length,
      relevant_memory_count: context.relevantHistory.length,
      coach_entry_id: coachEntry.id,
      response_id: response.id,
      calendar_proposal_id: calendarProposalId,
    },
    model: appConfig.openaiModel,
    prompt_version: "northstar-coach-v1",
  });

  if (contextError) throw contextError;
  return output;
}
