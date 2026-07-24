const RECORDER_MIME_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/flac": "flac",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mpga": "mpga",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
};

const SUPPORTED_EXTENSIONS = new Set([
  "flac",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "ogg",
  "wav",
  "webm",
]);

export function baseMimeType(mimeType: string) {
  return mimeType.split(";")[0].trim().toLowerCase();
}

export function chooseRecorderMimeType(
  isTypeSupported: (mimeType: string) => boolean,
) {
  return (
    RECORDER_MIME_TYPES.find((mimeType) => isTypeSupported(mimeType)) ?? ""
  );
}

export function getAudioExtension(mimeType: string, filename = "") {
  const fromMime = MIME_EXTENSIONS[baseMimeType(mimeType)];
  if (fromMime) {
    return fromMime;
  }

  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_EXTENSIONS.has(extension) ? extension : null;
}

export function getAudioFilename(mimeType: string, filename = "") {
  const extension = getAudioExtension(mimeType, filename);
  return extension ? `northstar-entry.${extension}` : null;
}
