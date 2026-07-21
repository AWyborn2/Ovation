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
    id: "matchSummary-v1",
    name: "Match Summary Pack",
    description:
      "Branded match summary cards in three formats — square feed post, portrait feed post, and animated story.",
    cardKinds: ["matchSummary"],
    variants: [
      {
        key: "square",
        label: "Square (1080×1080)",
        width: 1080,
        height: 1080,
        motionPreset: null,
        backgroundKind: "image",
      },
      {
        key: "portrait",
        label: "Portrait (1080×1350)",
        width: 1080,
        height: 1350,
        motionPreset: null,
        backgroundKind: "image",
      },
      {
        key: "story",
        label: "Animated Story (1080×1920)",
        width: 1080,
        height: 1920,
        motionPreset: "matchReveal",
        backgroundKind: "video",
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
