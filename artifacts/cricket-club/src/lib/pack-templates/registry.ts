/**
 * Design-pack registry (Phase 2).
 *
 * The renderer used to import `BROADCAST_DARK_PACK` directly and build a single
 * module-level kind index from it, so "the pack" and "Pack A" were the same
 * thing and a second pack was impossible without touching the renderer. This
 * module is the seam: packs register here, and everything downstream selects
 * one by `packId`.
 *
 * `packId` values must match the `card_templates.packId` column that
 * `ensurePackTemplates` (api-server `lib/design-packs.ts`) materialises per
 * tenant. The two registries live in separate packages and are NOT checked
 * against each other automatically: registering a pack here without a matching
 * `PACKS` entry there means no tenant ever gets a row selecting it, and the
 * reverse means rows exist for a pack the renderer will silently fall back from
 * (see {@link getPackManifest}). Change both together.
 */

import { isLegacyPackId, resolveActivePackId } from "@workspace/scorecard/queued-carousel";
import type { PackManifest } from "./types";
import { BROADCAST_DARK_PACK } from "./broadcast-dark";
import { GOLD_FOIL_PACK } from "./gold-foil";
import { BOLD_TYPE_PACK } from "./bold-type";
import { NEON_NIGHT_PACK } from "./neon-night";
import { SUNSET_PACK } from "./sunset";
import { CLUB_KIT_PACK } from "./club-kit";
import { DUOTONE_PACK } from "./duotone";

/**
 * The pack used when a caller supplies no `packId`, or supplies one that is not
 * registered (e.g. a `card_templates` row left behind by a pack that has since
 * been withdrawn). Falling back rather than rendering nothing keeps an
 * unrecognised row harmless.
 */
export const DEFAULT_PACK_ID = BROADCAST_DARK_PACK.packId;

/**
 * Gold Foil, Bold Type, Neon Night and Sunset stay registered so their
 * templates keep building and linting, but they are hidden (`LEGACY_PACK_IDS`,
 * match-day carousel content P9): no picker offers them and a saved choice of
 * one renders as Club Kit. The planned social template library will convert
 * them and bring them back.
 */
const MANIFESTS: readonly PackManifest[] = [
  BROADCAST_DARK_PACK,
  GOLD_FOIL_PACK,
  BOLD_TYPE_PACK,
  NEON_NIGHT_PACK,
  SUNSET_PACK,
  CLUB_KIT_PACK,
  DUOTONE_PACK,
];

const ACTIVE_MANIFESTS: readonly PackManifest[] = MANIFESTS.filter(
  (p) => !isLegacyPackId(p.packId),
);

const BY_ID: ReadonlyMap<string, PackManifest> = new Map(MANIFESTS.map((p) => [p.packId, p]));

/** The packs a club can choose, in registration order (hidden legacy packs left out). */
export function listPackManifests(): readonly PackManifest[] {
  return ACTIVE_MANIFESTS;
}

/** Every registered pack, hidden legacy ones included: template checks and names only. */
export function listAllPackManifests(): readonly PackManifest[] {
  return MANIFESTS;
}

/**
 * The pack a saved choice renders with: a hidden legacy pack or an unknown id
 * renders as Club Kit; no choice (and the blank canvas) passes through. Every
 * render surface reads its pack id through this.
 */
export const renderablePackId = resolveActivePackId;

/** True when `packId` names a registered pack. */
export function isRegisteredPack(packId?: string | null): boolean {
  return !!packId && BY_ID.has(packId);
}

/**
 * Resolve a manifest by id, falling back to {@link DEFAULT_PACK_ID} for a
 * missing or unknown id. Never returns undefined — callers render *something*
 * rather than a blank card.
 */
export function getPackManifest(packId?: string | null): PackManifest {
  return (packId ? BY_ID.get(packId) : undefined) ?? BY_ID.get(DEFAULT_PACK_ID)!;
}
