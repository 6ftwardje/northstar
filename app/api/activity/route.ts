import { NextResponse } from "next/server";
import { z } from "zod";
import {
  localDateKey,
  zonedDateTimeToUtc,
} from "@/lib/notifications/time";
import { createClient } from "@/lib/supabase/server";

const QuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

function nextMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, value, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

export async function GET(request: Request) {
  const parsed = QuerySchema.safeParse({
    month: new URL(request.url).searchParams.get("month"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_MONTH" }, { status: 400 });
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
  const fromDate = `${parsed.data.month}-01`;
  const untilMonth = nextMonth(parsed.data.month);
  const untilDate = `${untilMonth}-01`;
  const from = zonedDateTimeToUtc(fromDate, "00:00", timezone);
  const until = zonedDateTimeToUtc(untilDate, "00:00", timezone);
  const [entriesResult, reviewsResult] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("id, kind, content, occurred_at")
      .neq("kind", "coach_message")
      .gte("occurred_at", from.toISOString())
      .lt("occurred_at", until.toISOString())
      .order("occurred_at", { ascending: false })
      .limit(500),
    supabase
      .from("daily_reviews")
      .select(
        "id, review_date, status, impact_summary, coach_summary, movement, cannabis_used, energy, completed_at",
      )
      .gte("review_date", fromDate)
      .lt("review_date", untilDate)
      .order("review_date", { ascending: false }),
  ]);
  if (entriesResult.error || reviewsResult.error) {
    return NextResponse.json(
      { error: "ACTIVITY_READ_FAILED" },
      { status: 500 },
    );
  }

  const days = new Map<
    string,
    {
      date: string;
      entryCount: number;
      reviewCompleted: boolean;
      entries: Array<{
        id: string;
        kind: string;
        text: string;
        occurredAt: string;
      }>;
      review: (typeof reviewsResult.data)[number] | null;
    }
  >();
  for (const entry of entriesResult.data ?? []) {
    const date = localDateKey(new Date(entry.occurred_at), timezone);
    const day = days.get(date) ?? {
      date,
      entryCount: 0,
      reviewCompleted: false,
      entries: [],
      review: null,
    };
    day.entryCount += 1;
    day.entries.push({
      id: entry.id,
      kind: entry.kind,
      text: entry.content.slice(0, 280),
      occurredAt: entry.occurred_at,
    });
    days.set(date, day);
  }
  for (const review of reviewsResult.data ?? []) {
    const day = days.get(review.review_date) ?? {
      date: review.review_date,
      entryCount: 0,
      reviewCompleted: false,
      entries: [],
      review: null,
    };
    day.reviewCompleted = review.status === "completed";
    day.review = review;
    days.set(review.review_date, day);
  }

  return NextResponse.json(
    {
      month: parsed.data.month,
      timezone,
      days: [...days.values()].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
