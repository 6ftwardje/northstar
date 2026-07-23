import { NextResponse } from "next/server";
import { z } from "zod";
import { featureStatus } from "@/lib/config";
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

  const parsed = ReviewSchema.safeParse(await request.json());
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

  const { error } = await supabase.from("daily_reviews").upsert(
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
  );

  if (error) {
    return NextResponse.json(
      { error: "REVIEW_WRITE_FAILED", message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, mode: "cloud" });
}
