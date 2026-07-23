import { NextResponse } from "next/server";
import { appConfig, featureStatus } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  let authenticated = false;

  if (featureStatus.supabase) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authenticated = Boolean(user);
  }

  return NextResponse.json({
    supabase: featureStatus.supabase,
    openai: featureStatus.openai,
    authenticated,
    ready:
      featureStatus.supabase && featureStatus.openai && authenticated,
    model: featureStatus.openai ? appConfig.openaiModel : null,
  });
}
