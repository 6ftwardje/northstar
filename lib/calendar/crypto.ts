import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { appConfig } from "../config";

const VERSION = "v1";

function encryptionKey() {
  const encoded = appConfig.calendarTokenEncryptionKey;
  if (!encoded) throw new Error("CALENDAR_ENCRYPTION_NOT_CONFIGURED");

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("CALENDAR_ENCRYPTION_KEY_INVALID");
  return key;
}

export function encryptCalendarSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptCalendarSecret(payload: string) {
  const [version, ivValue, tagValue, ciphertextValue, extra] =
    payload.split(".");
  if (
    version !== VERSION ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra
  ) {
    throw new Error("CALENDAR_SECRET_FORMAT_INVALID");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
