/**
 * Honour-display settings row + kiosk token helpers (generation, custom codes, constant-time comparison).
 *
 * Part of the honour-display builder library (see ../honour-display-builders.ts,
 * the barrel). Depends only on the db layer, settings and tenant resolution —
 * never on a request object — so every builder is unit-testable.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { honourDisplaySettingsTable } from "@workspace/db";
import { getOrCreateSettings } from "../settings";

// ---------------------------------------------------------------------------
// Settings singleton
// ---------------------------------------------------------------------------

// Per-tenant honour-display settings + kiosk token (one row per tenant, unique
// on tenantId). Was a single global id=1 row, so one club's kiosk token and
// board config were shared platform-wide.
export function ensureHonourDisplaySettings(tenantId: number) {
  return getOrCreateSettings(honourDisplaySettingsTable, tenantId);
}

export function serializeSettings(
  row: typeof honourDisplaySettingsTable.$inferSelect,
  opts: { includeToken?: boolean } = {},
) {
  return {
    defaultTemplate: row.defaultTemplate,
    kioskSequence: row.kioskSequence ?? [],
    kioskDwellMs: row.kioskDwellMs,
    kioskScrollSpeed: row.kioskScrollSpeed,
    kioskEndHoldMs: row.kioskEndHoldMs,
    kioskSponsorStrip: row.kioskSponsorStrip,
    kioskSponsorSlides: row.kioskSponsorSlides,
    kioskSponsorSlideEvery: row.kioskSponsorSlideEvery,
    kioskSponsorSlideStyle: (row.kioskSponsorSlideStyle as "grid" | "single") ?? "grid",
    kioskSponsorIds: row.kioskSponsorIds ?? [],
    kioskAds: row.kioskAds ?? [],
    boardConfigs: row.boardConfigs ?? {},
    composites: row.composites ?? [],
    customGrids: row.customGrids ?? [],
    skins: row.skins ?? [],
    colourOverrides: row.colourOverrides ?? {},
    defaultFont: row.defaultFont ?? null,
    // Only surface the kiosk token to authenticated admins. The public
    // kiosk feed omits it so it never leaks to the rotation client.
    ...(opts.includeToken ? { kioskToken: row.kioskToken ?? null } : {}),
  };
}

// Kiosk codes are short and unambiguous so they're easy to type straight into a
// TV / Raspberry Pi browser: 8 chars from a Crockford-style alphabet (no
// 0/O/1/I/L). The data is read-only honour boards and the code is revocable on
// demand, so ~8.5e11 combinations is ample.
export const KIOSK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// Random auto-generated codes; legacy long base64url tokens stay exact-match.
export const KIOSK_CODE_RE = /^[A-Z2-9]{8}$/;
// Admin-chosen custom codes: 3–40 chars, letters/numbers/hyphens (no leading
// hyphen). Matched case-insensitively so they're forgiving to hand-type.
export const KIOSK_CUSTOM_RE = /^[A-Za-z0-9][A-Za-z0-9-]{2,39}$/;

export function generateKioskToken(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) {
    code += KIOSK_CODE_ALPHABET.charAt(byte % KIOSK_CODE_ALPHABET.length);
  }
  return code;
}

/** Normalise + validate an admin-supplied custom kiosk code, or null if invalid. */
export function normalizeCustomKioskToken(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return KIOSK_CUSTOM_RE.test(trimmed) ? trimmed : null;
}

/**
 * Constant-time match of a presented kiosk token against the stored one. Codes
 * made only of letters/numbers/hyphens (auto codes + custom codes) are matched
 * case-insensitively so they're forgiving to hand-type; legacy long base64url
 * tokens stay exact-match.
 */
export function kioskTokenMatches(stored: string | null, presented: unknown): boolean {
  if (!stored || typeof presented !== "string" || presented.length === 0) {
    return false;
  }
  const caseInsensitive = KIOSK_CODE_RE.test(stored) || KIOSK_CUSTOM_RE.test(stored);
  const a = Buffer.from(caseInsensitive ? stored.toUpperCase() : stored);
  const b = Buffer.from(
    caseInsensitive ? presented.trim().toUpperCase() : presented,
  );
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
