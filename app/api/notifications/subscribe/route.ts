import { NextResponse } from "next/server";
import { z } from "zod";
import { PushSubscriptionSchema } from "@/lib/notifications/schemas";
import { createClient } from "@/lib/supabase/server";

const UnsubscribeSchema = z.object({
  endpoint: z.string().url().max(4_000),
});

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function POST(request: Request) {
  const parsed = PushSubscriptionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_PUSH_SUBSCRIPTION" },
      { status: 400 },
    );
  }

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const subscription = parsed.data;
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      expiration_time: subscription.expirationTime ?? null,
      user_agent: request.headers.get("user-agent"),
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json(
      { error: "SUBSCRIPTION_SAVE_FAILED", message: error.message },
      { status: 500 },
    );
  }

  await supabase
    .from("notification_preferences")
    .update({ push_enabled: true })
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const parsed = UnsubscribeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_ENDPOINT" }, { status: 400 });
  }

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("endpoint", parsed.data.endpoint);
  if (error) {
    return NextResponse.json(
      { error: "UNSUBSCRIBE_FAILED", message: error.message },
      { status: 500 },
    );
  }

  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (!count) {
    await supabase
      .from("notification_preferences")
      .update({ push_enabled: false })
      .eq("user_id", user.id);
  }

  return NextResponse.json({ ok: true });
}
