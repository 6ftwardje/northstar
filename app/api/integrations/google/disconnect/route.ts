import { NextResponse } from "next/server";
import { decryptCalendarSecret } from "@/lib/calendar/crypto";
import { revokeGoogleToken } from "@/lib/calendar/google";
import { isTrustedActionRequest } from "@/lib/security/action-request";
import {
  createAdminSupabaseClient,
  createClient,
} from "@/lib/supabase/server";

export async function POST(request: Request) {
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
  const admin = createAdminSupabaseClient();
  const { data: connection } = await admin
    .from("calendar_connections")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection) return NextResponse.json({ ok: true });
  const { data: credentials } = await admin
    .from("calendar_credentials")
    .select("refresh_token_ciphertext, access_token_ciphertext")
    .eq("connection_id", connection.id)
    .maybeSingle();
  if (credentials) {
    const encrypted =
      credentials.refresh_token_ciphertext ??
      credentials.access_token_ciphertext;
    try {
      await revokeGoogleToken(decryptCalendarSecret(encrypted));
    } catch {
      // Local disconnect still succeeds when Google is temporarily unavailable.
    }
  }
  await admin
    .from("calendar_credentials")
    .delete()
    .eq("connection_id", connection.id);
  await admin
    .from("calendar_sources")
    .delete()
    .eq("connection_id", connection.id);
  await admin
    .from("calendar_action_proposals")
    .update({ status: "cancelled", last_error_code: "CONNECTION_DISCONNECTED" })
    .eq("connection_id", connection.id)
    .eq("user_id", user.id)
    .eq("status", "pending_confirmation");
  await admin
    .from("calendar_connections")
    .update({ status: "disconnected", last_error_code: null })
    .eq("id", connection.id);
  return NextResponse.json({ ok: true });
}
