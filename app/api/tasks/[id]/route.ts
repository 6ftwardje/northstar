import { NextResponse } from "next/server";
import { isTrustedActionRequest } from "@/lib/security/action-request";
import { createClient } from "@/lib/supabase/server";
import { TodoUpdateSchema } from "@/lib/tasks/schemas";
import { isConcreteTodoTitle } from "@/lib/tasks/quality";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTrustedActionRequest(request)) {
    return NextResponse.json({ error: "UNTRUSTED_ACTION" }, { status: 403 });
  }
  const parsed = TodoUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (
    !parsed.success ||
    (parsed.data.title && !isConcreteTodoTitle(parsed.data.title))
  ) {
    return NextResponse.json({ error: "INVALID_TASK" }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { id } = await params;
  const values: Record<string, unknown> = {};
  if ("title" in parsed.data) values.title = parsed.data.title;
  if ("desiredOutcome" in parsed.data) {
    values.desired_outcome = parsed.data.desiredOutcome;
  }
  if ("estimatedMinutes" in parsed.data) {
    values.estimated_minutes = parsed.data.estimatedMinutes;
  }
  if ("dueAt" in parsed.data) values.due_at = parsed.data.dueAt;
  if ("impactDomain" in parsed.data) {
    values.impact_domain = parsed.data.impactDomain;
  }
  if (parsed.data.status) {
    values.status = parsed.data.status;
    values.completed_at =
      parsed.data.status === "done" ? new Date().toISOString() : null;
  }
  const { data, error } = await supabase
    .from("commitments")
    .update(values)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "TASK_UPDATE_FAILED" }, { status: 404 });
  }
  return NextResponse.json({ task: data });
}
