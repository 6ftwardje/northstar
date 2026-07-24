import { NextResponse } from "next/server";
import { GoogleCalendarError } from "@/lib/calendar/google";
import { CalendarProposalInputSchema } from "@/lib/calendar/schemas";
import {
  createCalendarProposal,
  proposalDto,
} from "@/lib/calendar/server";
import { isTrustedActionRequest } from "@/lib/security/action-request";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("calendar_action_proposals")
    .select("*")
    .in("status", ["pending_confirmation", "executing"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    return NextResponse.json(
      { error: "PROPOSALS_READ_FAILED" },
      { status: 500 },
    );
  }
  return NextResponse.json(
    { proposals: (data ?? []).map((proposal) => proposalDto(proposal)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

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
  const parsed = CalendarProposalInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  try {
    const proposal = await createCalendarProposal(user.id, parsed.data);
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    const status = error instanceof GoogleCalendarError ? error.status : 500;
    const code =
      error instanceof GoogleCalendarError
        ? error.code
        : "PROPOSAL_CREATE_FAILED";
    return NextResponse.json({ error: code }, { status });
  }
}
