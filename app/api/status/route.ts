import { NextResponse } from "next/server";
import { appConfig, featureStatus } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  let authenticated = false;
  let schemaReady = false;
  const issues: string[] = [];

  if (featureStatus.supabase) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authenticated = Boolean(user);

    if (authenticated) {
      const { error } = await supabase
        .from("journal_entries")
        .select("id")
        .limit(1);
      schemaReady = !error;
      if (error) {
        issues.push(
          error.code === "PGRST205" ? "DATABASE_SCHEMA_MISSING" : "DATABASE_UNAVAILABLE",
        );
      }
    }
  } else {
    issues.push("SUPABASE_NOT_CONFIGURED");
  }

  if (!featureStatus.openai) {
    issues.push("OPENAI_NOT_CONFIGURED");
  }
  if (featureStatus.supabase && !authenticated) {
    issues.push("AUTH_REQUIRED");
  }

  return NextResponse.json({
    supabase: featureStatus.supabase,
    openai: featureStatus.openai,
    authenticated,
    schemaReady,
    issues,
    ready:
      featureStatus.supabase &&
      featureStatus.openai &&
      authenticated &&
      schemaReady,
    model: featureStatus.openai ? appConfig.openaiModel : null,
  });
}
