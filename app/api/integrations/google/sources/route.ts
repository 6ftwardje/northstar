import { NextResponse } from "next/server";
import { GoogleCalendarError } from "@/lib/calendar/google";
import { CalendarSourceSettingsSchema } from "@/lib/calendar/schemas";
import { syncCalendarSources } from "@/lib/calendar/server";
import { isTrustedActionRequest } from "@/lib/security/action-request";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  if (!isTrustedActionRequest(request)) {
    return NextResponse.json({ error: "UNTRUSTED_ACTION" }, { status: 403 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const parsed = CalendarSourceSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  try {
    await syncCalendarSources(
      user.id,
      parsed.data.selectedCalendarIds,
      parsed.data.writableCalendarId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof GoogleCalendarError ? error.status : 500;
    const code =
      error instanceof GoogleCalendarError
        ? error.code
        : "CALENDAR_SETTINGS_FAILED";
    return NextResponse.json({ error: code }, { status });
  }
}
