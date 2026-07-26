import { NextResponse } from "next/server";
import { TodoCreateSchema } from "@/lib/tasks/schemas";
import { isConcreteTodoTitle } from "@/lib/tasks/quality";
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
    .from("commitments")
    .select(
      "id, title, desired_outcome, estimated_minutes, due_at, status, impact_domain, source, coach_revision, created_at, updated_at",
    )
    .in("status", ["open", "done"])
    .order("status", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(80);
  if (error) {
    return NextResponse.json({ error: "TASKS_READ_FAILED" }, { status: 500 });
  }
  return NextResponse.json(
    { tasks: data ?? [] },
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
  const parsed = TodoCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success || !isConcreteTodoTitle(parsed.data.title)) {
    return NextResponse.json({ error: "TASK_NOT_CONCRETE" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("commitments")
    .insert({
      user_id: user.id,
      title: parsed.data.title,
      desired_outcome: parsed.data.desiredOutcome,
      estimated_minutes: parsed.data.estimatedMinutes,
      due_at: parsed.data.dueAt,
      impact_domain: parsed.data.impactDomain,
      source: "manual",
      status: "open",
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: "TASK_CREATE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ task: data }, { status: 201 });
}
