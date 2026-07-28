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
      "The standard Ovation card catalogue — 20 Broadcast Dark designs across all 18 card kinds, in three formats: square feed post, portrait feed post, and story.",
    // Pack A covers every card kind (A1–A20 collapse onto 18 kinds; gradeLeader
    // and clubLeaderboard each carry two category-preset designs).
    cardKinds: [
      "matchSummary",
      "player",
      "milestone",
      "debut",
      "record",
      "gradeLeader",
      "premiership",
      "newCap",
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
    name: "Gold Foil",
    description:
      "Grand-final prestige — metallic foil display type on black, concentric gold grooves and gold ribbon callouts.",
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
      "newCap",
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
      "newCap",
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
];

export function getPackById(id: string): DesignPack | undefined {
  return PACKS.find((p) => p.id === id);
}

export function _resetEnsuredTenants(): void {
  ensuredTenants.clear();
}

const ensuredTenants = new Set<number>();

/**
 * Ensure every registered design-pack variant has a corresponding
 * `card_templates` row for `tenantId`. Idempotent — skips variants that
 * already have a row (matched on tenantId + source + packId + packVariant).
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
    await db.insert(cardTemplatesTable).values(rows).onConflictDoNothing();
  }
  ensuredTenants.add(tenantId);
}
