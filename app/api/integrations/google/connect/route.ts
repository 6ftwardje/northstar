import { NextResponse } from "next/server";
import { calendarFeatureStatus } from "@/lib/config";
import {
  createOAuthState,
  createPkceVerifier,
  googleAuthorizationUrl,
  hashOAuthState,
  pkceChallenge,
} from "@/lib/calendar/server";
import { isTrustedActionRequest } from "@/lib/security/action-request";
import {
  createAdminSupabaseClient,
  createClient,
} from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isTrustedActionRequest(request)) {
    return NextResponse.json({ error: "UNTRUSTED_ACTION" }, { status: 403 });
  }
  if (!calendarFeatureStatus.google) {
    return NextResponse.json(
      { error: "GOOGLE_CALENDAR_NOT_CONFIGURED" },
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

  const state = createOAuthState();
  const verifier = createPkceVerifier();
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("calendar_oauth_transactions").insert({
    user_id: user.id,
    state_hash: hashOAuthState(state),
    pkce_verifier: verifier,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) {
    return NextResponse.json({ error: "CONNECT_START_FAILED" }, { status: 500 });
  }

  return NextResponse.json({
    authorizationUrl: googleAuthorizationUrl(state, pkceChallenge(verifier)),
  });
}
