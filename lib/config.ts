const PLACEHOLDER_MARKERS = [
  "replace_with_",
  "YOUR_PROJECT_REF",
  "your-project",
];

function isUsable(value: string | undefined) {
  return Boolean(
    value &&
      value.trim() &&
      !PLACEHOLDER_MARKERS.some((marker) => value.includes(marker)),
  );
}

export const appConfig = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
  transcribeModel:
    process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidSubject:
    process.env.VAPID_SUBJECT ?? "https://northstar-ward.netlify.app",
  cronSecret: process.env.CRON_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCalendarRedirectUri:
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/integrations/google/callback`,
  calendarTokenEncryptionKey: process.env.CALENDAR_TOKEN_ENCRYPTION_KEY,
};

export const featureStatus = {
  supabase:
    isUsable(appConfig.supabaseUrl) &&
    isUsable(appConfig.supabaseAnonKey) &&
    isUsable(appConfig.supabaseServiceRoleKey),
  openai: isUsable(appConfig.openaiApiKey),
};

export const publicFeatureStatus = {
  supabase:
    isUsable(appConfig.supabaseUrl) && isUsable(appConfig.supabaseAnonKey),
  push: isUsable(appConfig.vapidPublicKey),
};

export const notificationFeatureStatus = {
  push:
    isUsable(appConfig.vapidPublicKey) &&
    isUsable(appConfig.vapidPrivateKey) &&
    isUsable(appConfig.vapidSubject),
  cron: isUsable(appConfig.cronSecret),
};

export const calendarFeatureStatus = {
  google:
    isUsable(appConfig.googleClientId) &&
    isUsable(appConfig.googleClientSecret) &&
    isUsable(appConfig.googleCalendarRedirectUri) &&
    isUsable(appConfig.calendarTokenEncryptionKey),
};

export function assertSupabaseConfigured() {
  if (!featureStatus.supabase) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
}

export function assertOpenAIConfigured() {
  if (!featureStatus.openai) {
    throw new Error("OPENAI_NOT_CONFIGURED");
  }
}
