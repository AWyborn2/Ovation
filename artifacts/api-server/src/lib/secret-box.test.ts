import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seal, open, needsReseal, SecretBoxError } from "./secret-box";

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");
const saved = { ...process.env };

function useKeys(current: string, version: string, previous?: string) {
  process.env.SOCIAL_TOKEN_KEY = current;
  process.env.SOCIAL_TOKEN_KEY_VERSION = version;
  if (previous) process.env.SOCIAL_TOKEN_KEY_PREVIOUS = previous;
  else delete process.env.SOCIAL_TOKEN_KEY_PREVIOUS;
}

describe("secret-box", () => {
  beforeEach(() => useKeys(KEY_A, "1"));
  afterEach(() => {
    process.env = { ...saved };
  });

  it("round-trips a secret and never stores it in the clear", () => {
    const sealed = seal("EAAtoken123");
    expect(sealed.v).toBe(1);
    expect(JSON.stringify(sealed)).not.toContain("EAAtoken123");
    expect(open(sealed)).toBe("EAAtoken123");
  });

  it("uses a fresh IV per seal", () => {
    expect(seal("same").iv).not.toBe(seal("same").iv);
  });

  it("rejects a tampered ciphertext", () => {
    const sealed = seal("EAAtoken123");
    const data = Buffer.from(sealed.data, "base64");
    data[0] ^= 0xff;
    expect(() => open({ ...sealed, data: data.toString("base64") })).toThrow(SecretBoxError);
  });

  it("rejects an unknown key version", () => {
    const sealed = seal("x");
    expect(() => open({ ...sealed, v: 9 })).toThrow(/no key for version 9/);
  });

  it("opens values sealed under the previous key after rotation", () => {
    const old = seal("EAAold");
    useKeys(KEY_B, "2", `1:${KEY_A}`);
    expect(needsReseal(old)).toBe(true);
    expect(open(old)).toBe("EAAold");
    const fresh = seal("EAAnew");
    expect(fresh.v).toBe(2);
    expect(needsReseal(fresh)).toBe(false);
  });

  it("refuses to seal without a key", () => {
    delete process.env.SOCIAL_TOKEN_KEY;
    expect(() => seal("x")).toThrow(/SOCIAL_TOKEN_KEY is not set/);
  });
});
