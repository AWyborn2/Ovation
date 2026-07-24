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
