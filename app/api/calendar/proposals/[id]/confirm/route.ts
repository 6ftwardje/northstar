import { NextResponse } from "next/server";
import { GoogleCalendarError } from "@/lib/calendar/google";
import { CalendarConfirmationSchema } from "@/lib/calendar/schemas";
import { executeCalendarProposal } from "@/lib/calendar/server";
import { isTrustedActionRequest } from "@/lib/security/action-request";
import { createClient } from "@/lib/supabase/server";

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
  const parsed = CalendarConfirmationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const { id } = await params;
  try {
    const proposal = await executeCalendarProposal(
      user.id,
      id,
      parsed.data.version,
    );
    return NextResponse.json({ proposal });
  } catch (error) {
    const status = error instanceof GoogleCalendarError ? error.status : 500;
    const code =
      error instanceof GoogleCalendarError
        ? error.code
        : "PROPOSAL_EXECUTION_FAILED";
    return NextResponse.json({ error: code }, { status });
  }
}
