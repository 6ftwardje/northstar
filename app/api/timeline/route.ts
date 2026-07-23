import { NextResponse } from "next/server";
import { featureStatus } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  if (!featureStatus.supabase) {
    return NextResponse.json({ entries: [], mode: "demo" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("journal_entries")
    .select("id, kind, content, occurred_at, metadata")
    .gte("occurred_at", startOfToday.toISOString())
    .order("occurred_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: "TIMELINE_READ_FAILED", message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ entries: data ?? [], mode: "cloud" });
}
