import { NextResponse } from "next/server";
import { notificationFeatureStatus, publicFeatureStatus } from "@/lib/config";
import { NotificationPreferencesSchema } from "@/lib/notifications/schemas";
import { createClient } from "@/lib/supabase/server";

const PREFERENCE_COLUMNS =
  "timezone, push_enabled, morning_enabled, morning_time, evening_enabled, evening_time, evening_followup_enabled, evening_followup_minutes, weekly_enabled, weekly_day, weekly_time, private_lock_screen";

function toResponse(
  row: Record<string, unknown>,
  subscriptionCount: number,
) {
  return {
    configured: publicFeatureStatus.push && notificationFeatureStatus.push,
    subscriptionCount,
    preferences: {
      timezone: row.timezone,
      pushEnabled: row.push_enabled,
      morningEnabled: row.morning_enabled,
      morningTime: row.morning_time,
      eveningEnabled: row.evening_enabled,
      eveningTime: row.evening_time,
      eveningFollowupEnabled: row.evening_followup_enabled,
      eveningFollowupMinutes: row.evening_followup_minutes,
      weeklyEnabled: row.weekly_enabled,
      weeklyDay: row.weekly_day,
      weeklyTime: row.weekly_time,
      privateLockScreen: row.private_lock_screen,
    },
    vapidPublicKey: publicFeatureStatus.push
      ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      : null,
  };
}

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedClient();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const [{ data: preference, error }, { count }] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select(PREFERENCE_COLUMNS)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("revoked_at", null),
  ]);

  if (error || !preference) {
    return NextResponse.json(
      {
        error: "NOTIFICATION_SCHEMA_MISSING",
        message: error?.message,
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    toResponse(preference as Record<string, unknown>, count ?? 0),
  );
}

export async function PATCH(request: Request) {
  const parsed = NotificationPreferencesSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_PREFERENCES", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const values = parsed.data;
  const update = {
    ...(values.morningEnabled === undefined
      ? {}
      : { morning_enabled: values.morningEnabled }),
    ...(values.eveningEnabled === undefined
      ? {}
      : { evening_enabled: values.eveningEnabled }),
    ...(values.eveningFollowupEnabled === undefined
      ? {}
      : { evening_followup_enabled: values.eveningFollowupEnabled }),
    ...(values.weeklyEnabled === undefined
      ? {}
      : { weekly_enabled: values.weeklyEnabled }),
    ...(values.privateLockScreen === undefined
      ? {}
      : { private_lock_screen: values.privateLockScreen }),
  };

  const { data, error } = await supabase
    .from("notification_preferences")
    .update(update)
    .eq("user_id", user.id)
    .select(PREFERENCE_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "PREFERENCES_UPDATE_FAILED", message: error?.message },
      { status: 500 },
    );
  }

  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("revoked_at", null);

  return NextResponse.json(
    toResponse(data as Record<string, unknown>, count ?? 0),
  );
}
