import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SupportError } from "@/server/errors";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function encryptionKey() {
  const value = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new SupportError("configuration_missing", "GMAIL_TOKEN_ENCRYPTION_KEY is not configured", { status: 500 });
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new SupportError("configuration_missing", "GMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes", { status: 500 });
  }
  return key;
}

export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptToken(payload: string) {
  const [version, ivEncoded, tagEncoded, encryptedEncoded] = payload.split(".");
  if (version !== VERSION || !ivEncoded || !tagEncoded || !encryptedEncoded) {
    throw new SupportError("oauth_expired", "Stored Gmail credential cannot be decoded", { status: 401 });
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivEncoded, "base64url"));
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedEncoded, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    throw new SupportError("oauth_expired", "Stored Gmail credential could not be decrypted", { status: 401, cause: error });
  }
}
