import { NextResponse } from "next/server";
import { featureStatus } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

function initialsFor(displayName: string) {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "NS";
}

export async function GET() {
  if (!featureStatus.supabase) {
    return NextResponse.json({ error: "CONFIG_REQUIRED" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, timezone, evening_check_in_time, coach_settings")
    .eq("id", user.id)
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: "PROFILE_READ_FAILED", message: error?.message },
      { status: 500 },
    );
  }

  const displayName =
    data.display_name?.trim() || user.email?.split("@")[0] || "Northstar";

  return NextResponse.json({
    displayName,
    initials: initialsFor(displayName),
    timezone: data.timezone,
    eveningCheckInTime: data.evening_check_in_time,
    coachSettings: data.coach_settings ?? {},
  });
}
