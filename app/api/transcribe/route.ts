import { NextResponse } from "next/server";
import { appConfig, featureStatus } from "@/lib/config";
import { getAudioFilename } from "@/lib/audio";
import { createOpenAIClient } from "@/lib/openai/client";
import { createClient } from "@/lib/supabase/server";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MIN_AUDIO_BYTES = 256;

export const runtime = "nodejs";

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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_FORM_DATA" }, { status: 400 });
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "AUDIO_REQUIRED" }, { status: 400 });
  }
  if (audio.size < MIN_AUDIO_BYTES) {
    return NextResponse.json({ error: "AUDIO_EMPTY" }, { status: 422 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "AUDIO_TOO_LARGE" }, { status: 413 });
  }

  const filename = getAudioFilename(audio.type, audio.name);
  if (!filename) {
    return NextResponse.json({ error: "INVALID_AUDIO_TYPE" }, { status: 415 });
  }

  try {
    const normalizedAudio = new File([await audio.arrayBuffer()], filename, {
      type: audio.type,
    });
    const openai = createOpenAIClient();
    const transcription = await openai.audio.transcriptions.create({
      file: normalizedAudio,
      model: appConfig.transcribeModel,
      language: "nl",
      prompt:
        "Natuurlijk Nederlands met Engelse business- en health-termen. Gebruik correcte interpunctie.",
    });

    return NextResponse.json({
      text: transcription.text,
      format: filename.split(".").pop(),
    });
  } catch (error) {
    const requestId =
      error && typeof error === "object" && "requestID" in error
        ? String(error.requestID)
        : null;
    console.error("Transcription failed", {
      requestId,
      mimeType: audio.type,
      filename,
      bytes: audio.size,
    });

    return NextResponse.json(
      {
        error: "TRANSCRIPTION_FAILED",
        message:
          "De opname kon niet worden gelezen. Neem opnieuw op en spreek minstens één seconde.",
        requestId,
      },
      { status: 422 },
    );
  }
}
