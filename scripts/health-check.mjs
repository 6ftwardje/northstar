import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_TRANSCRIBE_MODEL",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "CRON_SECRET",
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`✗ Ontbrekende variabelen: ${missing.join(", ")}`);
  process.exit(1);
}

const checks = [];
let healthy = true;

async function check(name, action) {
  try {
    const detail = await action();
    checks.push({ name, ok: true, detail });
  } catch (error) {
    healthy = false;
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : JSON.stringify(error);
    checks.push({
      name,
      ok: false,
      detail,
    });
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

await check("Supabase-project", async () => {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  if (error) throw error;
  return `${data.total ?? data.users.length} gebruiker(s) bereikbaar`;
});

for (const table of [
  "profiles",
  "journal_entries",
  "daily_reviews",
  "memories",
  "context_runs",
  "notification_preferences",
  "push_subscriptions",
  "scheduled_actions",
  "notification_deliveries",
  "calendar_connections",
  "calendar_sources",
  "calendar_action_proposals",
  "calendar_action_executions",
]) {
  await check(`Tabel ${table}`, async () => {
    const { error } = await supabase
      .from(table)
      .select("*")
      .limit(1);
    if (error) throw error;
    return "schema beschikbaar";
  });
}

const calendarKeys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALENDAR_REDIRECT_URI",
  "CALENDAR_TOKEN_ENCRYPTION_KEY",
];
const calendarValues = calendarKeys.map((key) => process.env[key]).filter(Boolean);
if (calendarValues.length > 0) {
  await check("Google Calendar-configuratie", async () => {
    const missingCalendarKeys = calendarKeys.filter((key) => !process.env[key]);
    if (missingCalendarKeys.length) {
      throw new Error(`onvolledig: ${missingCalendarKeys.join(", ")}`);
    }
    const redirect = new URL(process.env.GOOGLE_CALENDAR_REDIRECT_URI);
    if (
      redirect.pathname !== "/api/integrations/google/callback" ||
      !["https:", "http:"].includes(redirect.protocol)
    ) {
      throw new Error("callback-URL ongeldig");
    }
    const key = Buffer.from(
      process.env.CALENDAR_TOKEN_ENCRYPTION_KEY,
      "base64",
    );
    if (key.length !== 32) throw new Error("encryptiesleutel is niet 32 bytes");
    return "OAuth en encryptiesleutel aanwezig";
  });
}

await check("Web Push-configuratie", async () => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || publicKey.length < 80) throw new Error("publieke VAPID-key ongeldig");
  if (!privateKey || privateKey.length < 40) throw new Error("private VAPID-key ongeldig");
  if (!subject?.startsWith("mailto:") && !subject?.startsWith("https://")) {
    throw new Error("VAPID_SUBJECT moet mailto: of https:// gebruiken");
  }
  return "sleutelpaar aanwezig";
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
await check("OpenAI coachmodel", async () => {
  const model = await openai.models.retrieve(process.env.OPENAI_MODEL);
  return model.id;
});
await check("OpenAI transcriptiemodel", async () => {
  const model = await openai.models.retrieve(
    process.env.OPENAI_TRANSCRIBE_MODEL,
  );
  return model.id;
});

for (const result of checks) {
  console.log(`${result.ok ? "✓" : "✗"} ${result.name}: ${result.detail}`);
}

if (!healthy) {
  process.exit(1);
}

console.log("\nNorthstar services zijn operationeel.");
