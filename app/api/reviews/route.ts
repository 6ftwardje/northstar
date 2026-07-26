import { NextResponse } from "next/server";
import { z } from "zod";
import { featureStatus } from "@/lib/config";
import { generateCoachResponse } from "@/lib/coach/generate";
import { localDateKey } from "@/lib/notifications/time";
import { isTrustedActionRequest } from "@/lib/security/action-request";
import { createClient } from "@/lib/supabase/server";

const ReviewSchema = z.object({
  reviewDate: z.string().date(),
  impactSummary: z.string().trim().max(5_000),
  movement: z.boolean().nullable(),
  cannabisUsed: z.boolean().nullable(),
  energy: z.number().int().min(1).max(10),
});

export async function POST(request: Request) {
  if (!featureStatus.supabase) {
    return NextResponse.json({ mode: "demo" });
  }

  if (!isTrustedActionRequest(request)) {
    return NextResponse.json({ error: "UNTRUSTED_ACTION" }, { status: 403 });
  }
  const parsed = ReviewSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REVIEW", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  const timezone = profile?.timezone ?? "Europe/Brussels";
  if (parsed.data.reviewDate !== localDateKey(new Date(), timezone)) {
    return NextResponse.json(
      { error: "REVIEW_DATE_NOT_TODAY" },
      { status: 400 },
    );
  }

  const { data: review, error } = await supabase.from("daily_reviews").upsert(
    {
      user_id: user.id,
      review_date: parsed.data.reviewDate,
      status: "completed",
      impact_summary: parsed.data.impactSummary,
      movement: parsed.data.movement,
      cannabis_used: parsed.data.cannabisUsed,
      energy: parsed.data.energy,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,review_date" },
  ).select("id, coach_summary").single();

  if (error) {
    return NextResponse.json(
      { error: "REVIEW_WRITE_FAILED", message: error.message },
      { status: 500 },
    );
  }

  const reviewContent = [
    `Avondcheck-in van ${parsed.data.reviewDate}.`,
    parsed.data.impactSummary
      ? `Echte impact: ${parsed.data.impactSummary}`
      : "Echte impact: niet ingevuld.",
    `Bewogen: ${
      parsed.data.movement === null
        ? "niet ingevuld"
        : parsed.data.movement
          ? "ja"
          : "nee"
    }.`,
    `Cannabis gebruikt: ${
      parsed.data.cannabisUsed === null
        ? "niet ingevuld"
        : parsed.data.cannabisUsed
          ? "ja"
          : "nee"
    }.`,
    `Energie bij afsluiten: ${parsed.data.energy}/10.`,
  ].join("\n");

  let { data: reviewEntry } = await supabase
    .from("journal_entries")
    .select("id, metadata")
    .eq("kind", "evening_review")
    .contains("metadata", { review_date: parsed.data.reviewDate })
    .maybeSingle();
  if (reviewEntry) {
    await supabase
      .from("journal_entries")
      .update({ content: reviewContent })
      .eq("id", reviewEntry.id);
  } else {
    const { data: insertedEntry, error: entryError } = await supabase
      .from("journal_entries")
      .insert({
        user_id: user.id,
        kind: "evening_review",
        content: reviewContent,
        metadata: {
          channel: "journal",
          review_date: parsed.data.reviewDate,
          daily_review_id: review.id,
        },
      })
      .select("id, metadata")
      .single();
    if (entryError || !insertedEntry) {
      return NextResponse.json(
        { error: "REVIEW_ENTRY_WRITE_FAILED" },
        { status: 500 },
      );
    }
    reviewEntry = insertedEntry;
  }

  if (review.coach_summary) {
    return NextResponse.json({
      ok: true,
      mode: "cloud",
      coach: { reply: review.coach_summary },
    });
  }

  try {
    const coach = await generateCoachResponse({
      userId: user.id,
      entryId: reviewEntry.id,
      message: reviewContent,
      channel: "journal",
    });
    await supabase
      .from("daily_reviews")
      .update({ coach_summary: coach.reply })
      .eq("id", review.id);
    return NextResponse.json({ ok: true, mode: "cloud", coach });
  } catch {
    return NextResponse.json({
      ok: true,
      mode: "cloud",
      coach: null,
      warning: "REVIEW_FEEDBACK_FAILED",
    });
  }
}
