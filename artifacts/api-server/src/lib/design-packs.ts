import { sql } from "drizzle-orm";
import { db, cardTemplatesTable } from "@workspace/db";

// ---------------------------------------------------------------------------
// Design pack registry
// ---------------------------------------------------------------------------
// A design pack is a code-authored bundle of card templates that ships with the
// platform. Each pack targets one or more card kinds and offers multiple
// variants (e.g. square / portrait / story). Pack templates are stored as
// regular `card_templates` rows with `source: "pack"` and the pack metadata
// columns (`packId`, `packVariant`) so they flow through the same listing API
// and renderer as admin-uploaded BYO templates.
// ---------------------------------------------------------------------------

export type DesignPackVariant = {
  key: string;
  label: string;
  width: number;
  height: number;
  motionPreset: string | null;
  backgroundKind: "image" | "video";
};

export type DesignPack = {
  id: string;
  name: string;
  description: string;
  cardKinds: string[];
  variants: DesignPackVariant[];
};

/**
 * The standard three static formats every current pack ships. Shared so a new
 * pack's entry is its identity + cardKinds, not another copy of this block.
 */
const STANDARD_PACK_VARIANTS: DesignPackVariant[] = [
  {
    key: "square",
    label: "Square (1080×1080)",
    width: 1080,
    height: 1080,
    motionPreset: "none",
    backgroundKind: "image",
  },
  {
    key: "portrait",
    label: "Portrait (1080×1350)",
    width: 1080,
    height: 1350,
    motionPreset: "none",
    backgroundKind: "image",
  },
  {
    key: "story",
    label: "Story (1080×1920)",
    width: 1080,
    height: 1920,
    motionPreset: "none",
    backgroundKind: "image",
  },
];

export const PACKS: DesignPack[] = [
  {
    id: "broadcast-dark-v1",
    name: "Broadcast Dark",
    description:
      "The standard Ovation card catalogue — 19 Broadcast Dark designs across all 17 card kinds, in three formats: square feed post, portrait feed post, and story.",
    // Pack A covers every card kind (19 designs collapse onto 17 kinds;
    // gradeLeader and clubLeaderboard each carry two category-preset designs).
    // `newCap` is deliberately absent from every pack: the kind was retired
    // from the catalogue in favour of `debut`, whose fields are a superset of
    // its own. See components/card-kind-picker.tsx in the client.
    cardKinds: [
      "matchSummary",
      "player",
      "milestone",
      "debut",
      "record",
      "gradeLeader",
      "premiership",
      "century",
      "fiveFor",
      "matchDay",
      "teamList",
      "weekendWrap",
      "ladder",
      "bigMoment",
      "newSigning",
      "countdown",
      "clubLeaderboard",
    ],
    // Pack A ships as static (image) cards with no motion this scope, so
    // `isAnimatedCard` stays false and the MP4/story-video export hides (KTD10).
    variants: [
      {
        key: "square",
        label: "Square (1080×1080)",
        width: 1080,
        height: 1080,
        motionPreset: "none",
        backgroundKind: "image",
      },
      {
        key: "portrait",
        label: "Portrait (1080×1350)",
        width: 1080,
        height: 1350,
        motionPreset: "none",
        backgroundKind: "image",
      },
      {
        key: "story",
        label: "Story (1080×1920)",
        width: 1080,
        height: 1920,
        motionPreset: "none",
        backgroundKind: "image",
      },
    ],
  },
  {
    id: "gold-foil-v1",
    // `id` stays `gold-foil-v1` — it is stored on every tenant's card_templates
    // row, so renaming it would orphan their pack selection. Display name only.
    name: "Metallic Foil",
    description:
      "Grand-final prestige — a milled metal ramp derived from your club's own accent, a foil ribbon with a seal medallion, and an honour-board frame. Your colour, in metal.",
    // COVERAGE CONTRACT: this list must match the kinds in the client manifest
    // (`pack-templates/gold-foil/index.ts`). The two registries live in
    // separate packages and are not cross-checked automatically. Declaring a
    // kind here that the client cannot render offers a tenant a pack that falls
    // back to Broadcast Dark; omitting one the client CAN render just hides it.
    // Gold Foil is being transcribed card by card — grow both lists together.
    cardKinds: [
      "matchSummary",
      "matchDay",
      "countdown",
      "newSigning",
      "premiership",
      "teamList",
      "weekendWrap",
      "ladder",
      "player",
      "milestone",
      "debut",
      "century",
      "fiveFor",
      "bigMoment",
      "record",
      "gradeLeader",
      "clubLeaderboard",
    ],
    variants: STANDARD_PACK_VARIANTS,
  },
  {
    id: "bold-type-v1",
    name: "Bold Type",
    description:
      "Oversized condensed type as the hero — massive scores, gold outline display faces, flat colour-block compositions. No photography; the type is the design.",
    // COVERAGE CONTRACT: must match pack-templates/bold-type/index.ts (enforced
    // by pack-coverage-parity.test.ts). Grows card by card.
    cardKinds: [
      "matchSummary",
      "matchDay",
      "countdown",
      "newSigning",
      "premiership",
      "record",
      "gradeLeader",
      "clubLeaderboard",
      "teamList",
      "weekendWrap",
      "ladder",
      "player",
      "milestone",
      "debut",
      "century",
      "fiveFor",
      "bigMoment",
    ],
    variants: STANDARD_PACK_VARIANTS,
  },
  {
    id: "neon-night-v1",
    name: "Neon Night",
    description:
      "Night-sky navy with blurred neon orbs, glassmorphism panels and layered neon-glow display type — floodlit cricket after dark.",
    // COVERAGE CONTRACT: must match pack-templates/neon-night/index.ts
    // (enforced by pack-coverage-parity.test.ts). Grows card by card.
    cardKinds: [
      "matchSummary",
      "record",
      "gradeLeader",
      "clubLeaderboard",
      "matchDay",
      "countdown",
      "newSigning",
      "premiership",
      "teamList",
      "weekendWrap",
      "ladder",
      "player",
      "milestone",
      "debut",
      "century",
      "fiveFor",
      "bigMoment",
    ],
    variants: [
      {
        key: "square",
        label: "Square (1080×1080)",
        width: 1080,
        height: 1080,
        motionPreset: "none",
        backgroundKind: "image",
      },
      {
        key: "portrait",
        label: "Portrait (1080×1350)",
        width: 1080,
        height: 1350,
        motionPreset: "none",
        backgroundKind: "image",
      },
      {
        key: "story",
        label: "Story (1080×1920)",
        width: 1080,
        height: 1920,
        motionPreset: "none",
        backgroundKind: "image",
      },
    ],
  },
  {
    id: "sunset-v1",
    name: "Sunset",
    description:
      "Golden-hour warmth — photo-first stories over a sunset wash, frosted glass panels and script accent type. Club-social warmth where Broadcast Dark is TV graphics.",
    // COVERAGE CONTRACT: must match pack-templates/sunset/index.ts (enforced
    // by pack-coverage-parity.test.ts). Grows card by card.
    cardKinds: [
      "matchSummary",
      "teamList",
      "weekendWrap",
      "ladder",
      "player",
      "milestone",
      "debut",
      "century",
      "fiveFor",
      "bigMoment",
      "matchDay",
      "countdown",
      "newSigning",
      "premiership",
      "record",
      "gradeLeader",
      "clubLeaderboard",
    ],
    variants: STANDARD_PACK_VARIANTS,
  },
];

export function getPackById(id: string): DesignPack | undefined {
  return PACKS.find((p) => p.id === id);
}

export function _resetEnsuredTenants(): void {
  ensuredTenants.clear();
}

// Cached per-tenant for the lifetime of the process. This cannot hide a
// coverage change: `PACKS` is compile-time data, so a pack gaining a card kind
// always arrives with a new process, which starts with an empty cache.
// Reconciliation on first-touch-per-process is therefore sufficient.
const ensuredTenants = new Set<number>();

/**
 * Ensure every registered design-pack variant has a corresponding
 * `card_templates` row for `tenantId`, and RECONCILE any row that already
 * exists back to the registry (matched on tenantId + source + packId +
 * packVariant). Without the reconcile half, a pack whose `cardKinds` grew after
 * a tenant's rows were first materialised stays frozen at its old coverage and
 * is never offered for the kinds it now renders.
 *
 * Results are cached per-tenant for the lifetime of the process.
 */
export async function ensurePackTemplates(tenantId: number): Promise<void> {
  if (ensuredTenants.has(tenantId)) return;
  const rows = PACKS.flatMap((pack) =>
    pack.variants.map((variant) => ({
      tenantId,
      name: `${pack.name} — ${variant.label}`,
      cardKinds: pack.cardKinds,
      source: "pack" as const,
      packId: pack.id,
      packVariant: variant.key,
      backgroundKind: variant.backgroundKind,
      motionPreset: variant.motionPreset ?? "none",
      bgWidth: variant.width,
      bgHeight: variant.height,
      slots: [] as never[],
      isActive: true,
      isDefault: false,
      displayOrder: 0,
    })),
  );
  if (rows.length > 0) {
    await db
      .insert(cardTemplatesTable)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          cardTemplatesTable.tenantId,
          cardTemplatesTable.source,
          cardTemplatesTable.packId,
          cardTemplatesTable.packVariant,
        ],
        // `card_templates_pack_unique` is a PARTIAL unique index
        // (`.where(sql`source = 'pack'`)`, lib/db/src/schema/social_cards.ts).
        // Postgres will NOT infer a partial index as an ON CONFLICT arbiter
        // from a bare column list — it raises 42P10. The previous
        // `onConflictDoNothing()` got away with a bare target because DO
        // NOTHING needs no arbiter; DO UPDATE does. Repeating the index
        // predicate here is mandatory, and getting it wrong fails SILENTLY:
        // the caller (routes/social-cards.ts:426-428) wraps this in a
        // best-effort catch, so a 42P10 produces no error, no log, and
        // symptoms identical to the stale-row defect this fixes.
        targetWhere: sql`source = 'pack'`,
        // REGISTRY-OWNED COLUMNS ONLY. The exclusion list below is
        // load-bearing, not an oversight:
        //   defaultForKinds — which kinds the tenant pointed at this pack
        //   isActive        — a pack the tenant switched off
        //   displayOrder    — the tenant's ordering
        //   isDefault       — legacy global default, still read as a fallback
        //                     by the client's resolvePackIdForKind
        // All four are TENANT selection state. Including any of them here
        // would reset every tenant's pack choice on every server restart —
        // the reconcile would become the bug.
        set: {
          cardKinds: sql`excluded.card_kinds`,
          name: sql`excluded.name`,
          bgWidth: sql`excluded.bg_width`,
          bgHeight: sql`excluded.bg_height`,
          backgroundKind: sql`excluded.background_kind`,
          motionPreset: sql`excluded.motion_preset`,
        },
      });
  }
  ensuredTenants.add(tenantId);
}
