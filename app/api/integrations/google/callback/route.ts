import { NextResponse } from "next/server";
import { appConfig, calendarFeatureStatus } from "@/lib/config";
import {
  encryptCalendarSecret,
} from "@/lib/calendar/crypto";
import {
  exchangeGoogleCode,
  getGoogleUser,
  listGoogleCalendars,
} from "@/lib/calendar/google";
import { GoogleCallbackSchema } from "@/lib/calendar/schemas";
import { hashOAuthState } from "@/lib/calendar/server";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

function complete(status: "connected" | "cancelled" | "failed") {
  const url = new URL("/integrations/google/complete", appConfig.appUrl);
  url.searchParams.set("status", status);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  if (!calendarFeatureStatus.google) return complete("failed");
  const url = new URL(request.url);
  const parsed = GoogleCallbackSchema.safeParse({
    state: url.searchParams.get("state"),
    code: url.searchParams.get("code") ?? undefined,
    error: url.searchParams.get("error") ?? undefined,
  });
  if (!parsed.success) return complete("failed");
  if (parsed.data.error || !parsed.data.code) return complete("cancelled");

  const admin = createAdminSupabaseClient();
  const { data: transaction } = await admin
    .from("calendar_oauth_transactions")
    .select("id, user_id, pkce_verifier, expires_at, consumed_at")
    .eq("state_hash", hashOAuthState(parsed.data.state))
    .maybeSingle();
  if (
    !transaction ||
    transaction.consumed_at ||
    new Date(transaction.expires_at) <= new Date()
  ) {
    return complete("failed");
  }

  const { data: claimed } = await admin
    .from("calendar_oauth_transactions")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", transaction.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return complete("failed");

  let connectionId: string | null = null;
  try {
    const token = await exchangeGoogleCode(
      parsed.data.code,
      transaction.pkce_verifier,
    );
    const [identity, calendars] = await Promise.all([
      getGoogleUser(token.access_token),
      listGoogleCalendars(token.access_token),
    ]);
    const { data: existing } = await admin
      .from("calendar_connections")
      .select("id")
      .eq("user_id", transaction.user_id)
      .maybeSingle();
    const connectionValues = {
      user_id: transaction.user_id,
      google_subject: identity.sub,
      google_email: identity.email,
      display_name: identity.name ?? null,
      status: "active",
      granted_scopes: token.scope?.split(" ") ?? [],
      token_expires_at: new Date(
        Date.now() + token.expires_in * 1000,
      ).toISOString(),
      last_connected_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error_code: null,
    };
    const connectionResult = existing
      ? await admin
          .from("calendar_connections")
          .update(connectionValues)
          .eq("id", existing.id)
          .select("id")
          .single()
      : await admin
          .from("calendar_connections")
          .insert(connectionValues)
          .select("id")
          .single();
    if (connectionResult.error || !connectionResult.data) {
      throw connectionResult.error ?? new Error("CONNECTION_WRITE_FAILED");
    }
    connectionId = connectionResult.data.id;
    const { data: previousCredential } = await admin
      .from("calendar_credentials")
      .select("refresh_token_ciphertext")
      .eq("connection_id", connectionId)
      .maybeSingle();
    const refreshCiphertext = token.refresh_token
      ? encryptCalendarSecret(token.refresh_token)
      : previousCredential?.refresh_token_ciphertext;
    if (!refreshCiphertext) throw new Error("REFRESH_TOKEN_MISSING");

    const { error: credentialError } = await admin
      .from("calendar_credentials")
      .upsert({
        connection_id: connectionId,
        access_token_ciphertext: encryptCalendarSecret(token.access_token),
        refresh_token_ciphertext: refreshCiphertext,
      });
    if (credentialError) throw credentialError;

    const primary =
      calendars.find((calendar) => calendar.primary) ??
      calendars.find((calendar) =>
        ["writer", "owner"].includes(calendar.accessRole),
      );
    await admin
      .from("calendar_sources")
      .delete()
      .eq("connection_id", connectionId);
    if (calendars.length) {
      const { error: sourceError } = await admin
        .from("calendar_sources")
        .insert(
          calendars.map((calendar) => ({
            connection_id: connectionId,
            user_id: transaction.user_id,
            google_calendar_id: calendar.id,
            summary: calendar.summary.slice(0, 120),
            timezone: calendar.timeZone ?? null,
            access_role: calendar.accessRole,
            primary_calendar: calendar.primary ?? false,
            selected: calendar.id === primary?.id,
            write_enabled: calendar.id === primary?.id,
          })),
        );
      if (sourceError) throw sourceError;
    }
    return complete("connected");
  } catch {
    if (connectionId) {
      await admin
        .from("calendar_connections")
        .update({
          status: "reconnect_required",
          last_error_code: "OAUTH_SETUP_INCOMPLETE",
        })
        .eq("id", connectionId);
    }
    return complete("failed");
  }
}
