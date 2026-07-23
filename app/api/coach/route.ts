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

  const parsed = CoachRequestSchema.safeParse(await request.json());
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

  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .insert({
      user_id: user.id,
      kind: parsed.data.channel === "chat" ? "text" : "text",
      content: parsed.data.message,
      occurred_at: parsed.data.occurredAt ?? new Date().toISOString(),
      metadata: { channel: parsed.data.channel },
    })
    .select("id, occurred_at")
    .single();

  if (entryError) {
    return NextResponse.json(
      { error: "ENTRY_WRITE_FAILED", message: entryError.message },
      { status: 500 },
    );
  }

  try {
    const coach = await generateCoachResponse({
      userId: user.id,
      entryId: entry.id,
      message: parsed.data.message,
    });

    return NextResponse.json({
      entry,
      coach,
    });
  } catch (error) {
    console.error("Coach generation failed", error);
    return NextResponse.json(
      {
        error: "COACH_GENERATION_FAILED",
        message:
          "Je entry is veilig opgeslagen, maar de coach kon niet antwoorden.",
      },
      { status: 502 },
    );
  }
}
