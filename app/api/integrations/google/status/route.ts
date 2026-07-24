import { NextResponse } from "next/server";
import { calendarFeatureStatus } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!calendarFeatureStatus.google) {
    return NextResponse.json(
      {
        configured: false,
        connected: false,
        status: "not_configured",
        connection: null,
        calendars: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const [{ data: connection }, { data: calendars }] = await Promise.all([
    supabase
      .from("calendar_connections")
      .select("google_email, display_name, status, last_connected_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("calendar_sources")
      .select(
        "google_calendar_id, summary, timezone, access_role, primary_calendar, selected, write_enabled",
      )
      .eq("user_id", user.id)
      .order("primary_calendar", { ascending: false })
      .order("summary"),
  ]);

  return NextResponse.json(
    {
      configured: true,
      connected: connection?.status === "active",
      status: connection?.status ?? "disconnected",
      connection: connection
        ? {
            email: connection.google_email,
            displayName: connection.display_name,
            lastConnectedAt: connection.last_connected_at,
          }
        : null,
      calendars: calendars ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
