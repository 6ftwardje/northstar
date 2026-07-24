import "server-only";

import webPush from "web-push";
import { appConfig, notificationFeatureStatus } from "@/lib/config";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import {
  localDateKey,
  minutesAfter,
  zonedDateTimeToUtc,
  zonedParts,
} from "./time";

type NotificationKind =
  | "morning_impact"
  | "evening_review"
  | "evening_followup"
  | "commitment"
  | "weekly_review"
  | "test";

type PreferenceRow = {
  user_id: string;
  timezone: string;
  push_enabled: boolean;
  morning_enabled: boolean;
  morning_time: string;
  evening_enabled: boolean;
  evening_time: string;
  evening_followup_enabled: boolean;
  evening_followup_minutes: number;
  weekly_enabled: boolean;
  weekly_day: number;
  weekly_time: string;
  private_lock_screen: boolean;
};

type ScheduledActionRow = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  due_at: string;
  title: string;
  body: string;
  deep_link: string;
  payload: Record<string, unknown>;
  attempt_count: number;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
};

type ActionInsert = {
  user_id: string;
  kind: NotificationKind;
  due_at: string;
  title: string;
  body: string;
  deep_link: string;
  dedupe_key: string;
  payload: { local_date: string };
};

const ACTION_GRACE_MINUTES: Record<NotificationKind, number> = {
  morning_impact: 120,
  evening_review: 180,
  evening_followup: 120,
  commitment: 180,
  weekly_review: 360,
  test: 30,
};

function actionTemplate(
  preference: PreferenceRow,
  kind: NotificationKind,
  localDate: string,
  dueAt: Date,
): ActionInsert {
  const templates: Record<
    Exclude<NotificationKind, "commitment" | "test">,
    Pick<ActionInsert, "title" | "body" | "deep_link">
  > = {
    morning_impact: {
      title: "Goedemorgen",
      body: "Wat is vandaag je belangrijkste zet?",
      deep_link: "/?compose=1",
    },
    evening_review: {
      title: "Tijd om af te sluiten",
      body: "Je avondcheck-in staat klaar.",
      deep_link: "/?view=evening",
    },
    evening_followup: {
      title: "Nog vijf minuten",
      body: "Sluit je dag bewust af voor je verdergaat.",
      deep_link: "/?view=evening",
    },
    weekly_review: {
      title: "Wekelijkse review",
      body: "Kijk terug, kies wat telt en bepaal je volgende zet.",
      deep_link: "/?view=progress",
    },
  };
  const template =
    kind === "commitment" || kind === "test"
      ? {
          title: "Northstar",
          body: "Je hebt een open actie om te bekijken.",
          deep_link: "/",
        }
      : templates[kind];

  return {
    user_id: preference.user_id,
    kind,
    due_at: dueAt.toISOString(),
    title: template.title,
    body: template.body,
    deep_link: template.deep_link,
    dedupe_key: `${kind}:${localDate}`,
    payload: { local_date: localDate },
  };
}

export async function seedRecurringNotificationActions(now = new Date()) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("notification_preferences")
    .select(
      "user_id, timezone, push_enabled, morning_enabled, morning_time, evening_enabled, evening_time, evening_followup_enabled, evening_followup_minutes, weekly_enabled, weekly_day, weekly_time, private_lock_screen",
    )
    .eq("push_enabled", true);

  if (error) throw error;

  const inserts: ActionInsert[] = [];
  for (const preference of (data ?? []) as PreferenceRow[]) {
    const localDate = localDateKey(now, preference.timezone);
    const localWeekday = zonedParts(now, preference.timezone).weekday;
    const candidates: Array<{
      enabled: boolean;
      kind: Exclude<NotificationKind, "commitment" | "test">;
      time: string;
    }> = [
      {
        enabled: preference.morning_enabled,
        kind: "morning_impact",
        time: preference.morning_time,
      },
      {
        enabled: preference.evening_enabled,
        kind: "evening_review",
        time: preference.evening_time,
      },
      {
        enabled:
          preference.evening_enabled &&
          preference.evening_followup_enabled,
        kind: "evening_followup",
        time: minutesAfter(
          preference.evening_time,
          preference.evening_followup_minutes,
        ),
      },
      {
        enabled:
          preference.weekly_enabled &&
          preference.weekly_day === localWeekday,
        kind: "weekly_review",
        time: preference.weekly_time,
      },
    ];

    for (const candidate of candidates) {
      if (!candidate.enabled) continue;
      const dueAt = zonedDateTimeToUtc(
        localDate,
        candidate.time,
        preference.timezone,
      );
      const staleAfter =
        ACTION_GRACE_MINUTES[candidate.kind] * 60 * 1_000;
      if (dueAt.getTime() < now.getTime() - staleAfter) continue;
      if (dueAt.getTime() > now.getTime() + 26 * 60 * 60 * 1_000) continue;
      inserts.push(
        actionTemplate(preference, candidate.kind, localDate, dueAt),
      );
    }
  }

  if (!inserts.length) return 0;

  const { error: insertError } = await admin
    .from("scheduled_actions")
    .upsert(inserts, {
      onConflict: "user_id,dedupe_key",
      ignoreDuplicates: true,
    });
  if (insertError) throw insertError;
  return inserts.length;
}

async function shouldSkipAction(
  action: ScheduledActionRow,
  preference: PreferenceRow | undefined,
  now: Date,
) {
  if (!preference?.push_enabled) return "PUSH_DISABLED";

  const enabledByKind: Partial<Record<NotificationKind, boolean>> = {
    morning_impact: preference.morning_enabled,
    evening_review: preference.evening_enabled,
    evening_followup:
      preference.evening_enabled &&
      preference.evening_followup_enabled,
    weekly_review: preference.weekly_enabled,
  };
  if (enabledByKind[action.kind] === false) return "REMINDER_DISABLED";

  const graceMinutes = ACTION_GRACE_MINUTES[action.kind];
  if (
    new Date(action.due_at).getTime() <
    now.getTime() - graceMinutes * 60 * 1_000
  ) {
    return "REMINDER_STALE";
  }

  if (
    action.kind === "evening_review" ||
    action.kind === "evening_followup"
  ) {
    const reviewDate =
      typeof action.payload.local_date === "string"
        ? action.payload.local_date
        : localDateKey(new Date(action.due_at), preference.timezone);
    const admin = createAdminSupabaseClient();
    const { data } = await admin
      .from("daily_reviews")
      .select("id")
      .eq("user_id", action.user_id)
      .eq("review_date", reviewDate)
      .eq("status", "completed")
      .maybeSingle();
    if (data) return "REVIEW_ALREADY_COMPLETED";
  }

  return null;
}

function configureWebPush() {
  if (!notificationFeatureStatus.push) {
    throw new Error("WEB_PUSH_NOT_CONFIGURED");
  }
  webPush.setVapidDetails(
    appConfig.vapidSubject,
    appConfig.vapidPublicKey!,
    appConfig.vapidPrivateKey!,
  );
}

export async function dispatchDueNotifications(now = new Date()) {
  configureWebPush();
  const admin = createAdminSupabaseClient();
  await seedRecurringNotificationActions(now);

  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_due_notification_actions",
    { batch_size: 25 },
  );
  if (claimError) throw claimError;

  const actions = (claimed ?? []) as ScheduledActionRow[];
  if (!actions.length) {
    return { claimed: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const userIds = [...new Set(actions.map((action) => action.user_id))];
  const [{ data: preferenceData }, { data: subscriptionData }] =
    await Promise.all([
      admin
        .from("notification_preferences")
        .select(
          "user_id, timezone, push_enabled, morning_enabled, morning_time, evening_enabled, evening_time, evening_followup_enabled, evening_followup_minutes, weekly_enabled, weekly_day, weekly_time, private_lock_screen",
        )
        .in("user_id", userIds),
      admin
        .from("push_subscriptions")
        .select(
          "id, user_id, endpoint, p256dh, auth, expiration_time",
        )
        .in("user_id", userIds)
        .is("revoked_at", null),
    ]);
  const preferences = new Map(
    ((preferenceData ?? []) as PreferenceRow[]).map((preference) => [
      preference.user_id,
      preference,
    ]),
  );
  const subscriptions = (subscriptionData ?? []) as PushSubscriptionRow[];

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const action of actions) {
    const preference = preferences.get(action.user_id);
    const skipReason = await shouldSkipAction(action, preference, now);
    const userSubscriptions = subscriptions.filter(
      (subscription) => subscription.user_id === action.user_id,
    );

    if (skipReason || !userSubscriptions.length) {
      await admin
        .from("scheduled_actions")
        .update({
          status: "skipped",
          last_error: skipReason ?? "NO_ACTIVE_SUBSCRIPTION",
        })
        .eq("id", action.id);
      skipped += 1;
      continue;
    }

    let successfulDeliveries = 0;
    let temporaryFailures = 0;
    for (const subscription of userSubscriptions) {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expiration_time,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            title: action.title,
            body: action.body,
            url: action.deep_link,
            tag: `northstar-${action.kind}`,
            actionId: action.id,
          }),
          {
            TTL: action.kind === "morning_impact" ? 7_200 : 10_800,
            urgency:
              action.kind === "evening_followup" ? "high" : "normal",
          },
        );
        successfulDeliveries += 1;
        await admin.from("notification_deliveries").insert({
          action_id: action.id,
          subscription_id: subscription.id,
          channel: "push",
          status: "sent",
          attempt: action.attempt_count,
        });
      } catch (error) {
        const statusCode =
          error && typeof error === "object" && "statusCode" in error
            ? Number(error.statusCode)
            : null;
        const expired = statusCode === 404 || statusCode === 410;
        if (expired) {
          await admin
            .from("push_subscriptions")
            .update({ revoked_at: now.toISOString() })
            .eq("id", subscription.id);
        } else {
          temporaryFailures += 1;
        }
        await admin.from("notification_deliveries").insert({
          action_id: action.id,
          subscription_id: subscription.id,
          channel: "push",
          status: expired ? "expired" : "failed",
          attempt: action.attempt_count,
          error_code: statusCode ? `HTTP_${statusCode}` : "PUSH_FAILED",
        });
      }
    }

    if (successfulDeliveries > 0) {
      await admin
        .from("scheduled_actions")
        .update({
          status: "sent",
          sent_at: now.toISOString(),
          last_error: null,
        })
        .eq("id", action.id);
      sent += 1;
    } else if (temporaryFailures > 0 && action.attempt_count < 3) {
      await admin
        .from("scheduled_actions")
        .update({
          status: "pending",
          due_at: new Date(now.getTime() + 5 * 60 * 1_000).toISOString(),
          last_error: "TEMPORARY_PUSH_FAILURE",
        })
        .eq("id", action.id);
      failed += 1;
    } else {
      await admin
        .from("scheduled_actions")
        .update({
          status: "failed",
          last_error: "PUSH_DELIVERY_FAILED",
        })
        .eq("id", action.id);
      failed += 1;
    }
  }

  return { claimed: actions.length, sent, skipped, failed };
}
