import { NextResponse } from "next/server";
import { notificationFeatureStatus } from "@/lib/config";
import { dispatchDueNotifications } from "@/lib/notifications/dispatch";
import {
  createAdminSupabaseClient,
  createClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  if (!notificationFeatureStatus.push) {
    return NextResponse.json(
      { error: "WEB_PUSH_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("scheduled_actions").insert({
    user_id: user.id,
    kind: "test",
    due_at: now.toISOString(),
    title: "Northstar is actief",
    body: "Test geslaagd. Ik kan je bereiken wanneer het telt.",
    deep_link: "/",
    dedupe_key: `test:${crypto.randomUUID()}`,
  });
  if (error) {
    return NextResponse.json(
      { error: "TEST_NOTIFICATION_FAILED", message: error.message },
      { status: 500 },
    );
  }

  const result = await dispatchDueNotifications(now);
  return NextResponse.json({ ok: result.sent > 0, ...result });
}
