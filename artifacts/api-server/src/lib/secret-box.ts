import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SealedSecret } from "@workspace/db";
import { env } from "../config";

/**
 * Encryption at rest for third-party credentials (Meta publishing KTD2).
 * AES-256-GCM with an app-level key from SOCIAL_TOKEN_KEY. Every sealed value
 * records the key version it was sealed under, so the key can rotate: the new
 * key seals, and the previous key (SOCIAL_TOKEN_KEY_PREVIOUS) still opens old
 * values until they are re-sealed.
 */

type Key = { version: number; key: Buffer };

export class SecretBoxError extends Error {}

function decodeKey(b64: string, label: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new SecretBoxError(`${label} must be 32 bytes, base64`);
  return key;
}

function currentKey(): Key {
  const b64 = env.SOCIAL_TOKEN_KEY();
  if (!b64) throw new SecretBoxError("SOCIAL_TOKEN_KEY is not set");
  const version = Number(env.SOCIAL_TOKEN_KEY_VERSION() ?? "1");
  if (!Number.isInteger(version) || version < 1) {
    throw new SecretBoxError("SOCIAL_TOKEN_KEY_VERSION must be a positive integer");
  }
  return { version, key: decodeKey(b64, "SOCIAL_TOKEN_KEY") };
}

function previousKey(): Key | null {
  const raw = env.SOCIAL_TOKEN_KEY_PREVIOUS();
  if (!raw) return null;
  const sep = raw.indexOf(":");
  if (sep < 1) throw new SecretBoxError("SOCIAL_TOKEN_KEY_PREVIOUS must be <version>:<base64>");
  const version = Number(raw.slice(0, sep));
  return { version, key: decodeKey(raw.slice(sep + 1), "SOCIAL_TOKEN_KEY_PREVIOUS") };
}

function keyFor(version: number): Buffer {
  const current = currentKey();
  if (current.version === version) return current.key;
  const prev = previousKey();
  if (prev && prev.version === version) return prev.key;
  throw new SecretBoxError(`no key for version ${version}`);
}

/** Whether a key is configured at all (publishing refuses to start without one). */
export function secretBoxConfigured(): boolean {
  return !!env.SOCIAL_TOKEN_KEY();
}

export function seal(plaintext: string): SealedSecret {
  const { version, key } = currentKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    v: version,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export function open(sealed: SealedSecret): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFor(sealed.v),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SecretBoxError("sealed value failed authentication");
  }
}

/** True when `sealed` is under an older key and should be re-sealed. */
export function needsReseal(sealed: SealedSecret): boolean {
  return sealed.v !== currentKey().version;
}
