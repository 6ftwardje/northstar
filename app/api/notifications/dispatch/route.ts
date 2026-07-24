import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { appConfig, notificationFeatureStatus } from "@/lib/config";
import { dispatchDueNotifications } from "@/lib/notifications/dispatch";

export const runtime = "nodejs";

function secretsMatch(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  if (!notificationFeatureStatus.cron) {
    return NextResponse.json({ error: "CRON_NOT_CONFIGURED" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;
  if (!secretsMatch(token, appConfig.cronSecret)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    return NextResponse.json(await dispatchDueNotifications());
  } catch (error) {
    console.error("Notification dispatch failed", error);
    return NextResponse.json(
      { error: "NOTIFICATION_DISPATCH_FAILED" },
      { status: 500 },
    );
  }
}
