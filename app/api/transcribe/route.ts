import { NextResponse } from "next/server";
import { appConfig, featureStatus } from "@/lib/config";
import { createOpenAIClient } from "@/lib/openai/client";
import { createClient } from "@/lib/supabase/server";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  if (!featureStatus.supabase || !featureStatus.openai) {
    return NextResponse.json({ error: "CONFIG_REQUIRED" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const formData = await request.formData();
  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "AUDIO_REQUIRED" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "AUDIO_TOO_LARGE" }, { status: 413 });
  }
  if (!audio.type.startsWith("audio/")) {
    return NextResponse.json({ error: "INVALID_AUDIO_TYPE" }, { status: 415 });
  }

  const openai = createOpenAIClient();
  const transcription = await openai.audio.transcriptions.create({
    file: audio,
    model: appConfig.transcribeModel,
    language: "nl",
  });

  return NextResponse.json({ text: transcription.text });
}
