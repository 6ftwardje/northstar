import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), ".env.local");
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_TRANSCRIBE_MODEL",
  "CRON_SECRET",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
];
const placeholderMarkers = ["replace_with_", "YOUR_PROJECT_REF"];

let content = "";
try {
  content = readFileSync(file, "utf8");
} catch {
  console.error("✗ .env.local ontbreekt");
  process.exit(1);
}

const values = new Map(
  content
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      ];
    }),
);

let valid = true;
for (const key of required) {
  const value = values.get(key) ?? "";
  const configured =
    Boolean(value) &&
    !placeholderMarkers.some((marker) => value.includes(marker));
  console.log(`${configured ? "✓" : "✗"} ${key}`);
  valid &&= configured;
}

if (!valid) {
  console.error("\nVul de ontbrekende placeholders in en herstart npm run dev.");
  process.exit(1);
}

console.log("\nNorthstar is klaar voor de live integratietest.");
