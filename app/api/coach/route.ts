import { NextResponse } from "next/server";
import { featureStatus } from "@/lib/config";
import { generateCoachResponse } from "@/lib/coach/generate";
import { CoachRequestSchema } from "@/lib/coach/schemas";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!featureStatus.supabase || !featureStatus.openai) {
    return NextResponse.json(
      {
        error: "CONFIG_REQUIRED",
        message: "Vul de Supabase- en OpenAI-placeholders in .env.local in.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = CoachRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let entry:
    | {
        id: string;
        occurred_at: string;
        metadata: Record<string, unknown>;
      }
    | null = null;

  if (parsed.data.clientEntryId) {
    const { data: existingEntry, error: existingError } = await supabase
      .from("journal_entries")
      .select("id, occurred_at, metadata")
      .contains("metadata", { client_entry_id: parsed.data.clientEntryId })
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error:
            existingError.code === "PGRST205"
              ? "DATABASE_SCHEMA_MISSING"
              : "ENTRY_READ_FAILED",
          message: existingError.message,
        },
        { status: 503 },
      );
    }
    entry = existingEntry;
  }

  if (!entry) {
    const { data: insertedEntry, error: entryError } = await supabase
      .from("journal_entries")
      .insert({
        user_id: user.id,
        kind: "text",
        content: parsed.data.message,
        occurred_at: parsed.data.occurredAt ?? new Date().toISOString(),
        metadata: {
          channel: parsed.data.channel,
          client_entry_id: parsed.data.clientEntryId,
          coach_status: "pending",
        },
      })
      .select("id, occurred_at, metadata")
      .single();

    if (entryError?.code === "23505" && parsed.data.clientEntryId) {
      const { data: concurrentEntry, error: concurrentReadError } =
        await supabase
          .from("journal_entries")
          .select("id, occurred_at, metadata")
          .contains("metadata", {
            client_entry_id: parsed.data.clientEntryId,
          })
          .single();

      if (concurrentReadError) {
        return NextResponse.json(
          {
            error: "ENTRY_READ_FAILED",
            message: concurrentReadError.message,
          },
          { status: 503 },
        );
      }
      entry = concurrentEntry;
    } else if (entryError) {
      return NextResponse.json(
        {
          error:
            entryError.code === "PGRST205"
              ? "DATABASE_SCHEMA_MISSING"
              : "ENTRY_WRITE_FAILED",
          message: entryError.message,
        },
        { status: entryError.code === "PGRST205" ? 503 : 500 },
      );
    } else {
      entry = insertedEntry;
    }
  }

  if (!entry) {
    return NextResponse.json({ error: "ENTRY_WRITE_FAILED" }, { status: 500 });
  }

  const { data: existingCoach } = await supabase
    .from("journal_entries")
    .select("content, metadata")
    .eq("kind", "coach_message")
    .contains("metadata", { in_response_to: entry.id })
    .maybeSingle();

  if (existingCoach) {
    return NextResponse.json({
      entry,
      coach: {
        reply: existingCoach.content,
        intervention: existingCoach.metadata?.intervention ?? "reflect",
      },
    });
  }

  try {
    const coach = await generateCoachResponse({
      userId: user.id,
      entryId: entry.id,
      message: parsed.data.message,
      channel: parsed.data.channel,
    });

    await supabase
      .from("journal_entries")
      .update({
        metadata: {
          ...entry.metadata,
          coach_status: "complete",
        },
      })
      .eq("id", entry.id);

    return NextResponse.json({
      entry,
      coach,
    });
  } catch (error) {
    const responseId =
      error && typeof error === "object" && "requestID" in error
        ? String(error.requestID)
        : null;
    console.error("Coach generation failed", {
      entryId: entry.id,
      responseId,
      error,
    });

    await supabase
      .from("journal_entries")
      .update({
        metadata: {
          ...entry.metadata,
          coach_status: "failed",
        },
      })
      .eq("id", entry.id);

    return NextResponse.json(
      {
        entry,
        coach: null,
        warning: "COACH_GENERATION_FAILED",
        message: "Je entry is veilig opgeslagen. Coachfeedback volgt later.",
      },
      { status: 200 },
    );
  }
}
