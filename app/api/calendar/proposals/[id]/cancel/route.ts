import { NextResponse } from "next/server";
import { isTrustedActionRequest } from "@/lib/security/action-request";
import {
  createAdminSupabaseClient,
  createClient,
} from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { id } = await params;
  const { data, error } = await supabase
    .from("calendar_action_proposals")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "PROPOSAL_NOT_FOUND" }, { status: 404 });
  }
  if (data.status !== "pending_confirmation") {
    return NextResponse.json({ error: "PROPOSAL_CHANGED" }, { status: 409 });
  }

  const admin = createAdminSupabaseClient();
  const { data: cancelled } = await admin
    .from("calendar_action_proposals")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending_confirmation")
    .select("id")
    .maybeSingle();
  if (!cancelled) {
    return NextResponse.json({ error: "PROPOSAL_CHANGED" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
