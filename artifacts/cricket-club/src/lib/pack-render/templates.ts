/**
 * Pack renderer — template resolution: which registered pack design serves a
 * card kind, which format html a size uses, and the image slots a template
 * exposes to the per-slot override editor.
 */

import { getPackManifest } from "../pack-templates/registry";
import type {
  PackCardTemplate,
  PackDesignEntry,
  PackTemplateFormats,
} from "../pack-templates/types";
import type { ShareCardInput, CardSize } from "../share-card";
import type { PackImageSlot } from "./types";

/**
 * Slot keys the generic per-slot override PANEL hides — the tenant-branding
 * "moat" (the header club logo + the sponsor tiles). Admins shouldn't repoint
 * these per-card from a generic editor; they are club-wide branding. Only the UI
 * list is filtered — the {@link PackCardData.imagesOverride} MECHANISM stays
 * fully general, so any key (including these) still wins if set programmatically.
 */
export const PACK_OVERRIDE_HIDDEN_SLOTS: ReadonlySet<string> = new Set([
  "clubLogo",
  "sponsor1",
  "sponsor2",
  "sponsor3",
]);

/**
 * Friendly, disambiguated display labels per slot key. The raw template labels
 * are non-unique — match-result exposes two "Logo" fields (`club.logo`,
 * `opposition.logo`) and three "Sponsor" fields (`sponsor1..3`) — so the panel
 * would show indistinguishable rows. Unmapped keys fall back to the template
 * label.
 */
const PACK_SLOT_LABELS: Record<string, string> = {
  clubLogo: "Club logo",
  "club.logo": "Club logo",
  "opposition.logo": "Opposition logo",
  photo: "Photo",
  teamPhoto: "Team photo",
  squadPhoto: "Squad photo",
  sponsor1: "Sponsor 1",
  sponsor2: "Sponsor 2",
  sponsor3: "Sponsor 3",
};

/**
 * The image slots (photo/logo) a card kind's pack template exposes, each with a
 * friendly, unique display label — the enumeration that drives the modal's
 * generic per-slot image-override editor (B1). Text and repeat fields are
 * skipped; an unsupported kind (no pack design) yields `[]`.
 *
 * By default the tenant-branding slots ({@link PACK_OVERRIDE_HIDDEN_SLOTS}) are
 * filtered out so the panel surfaces only content slots (player photo,
 * opposition logo, team / squad photo, …). Pass
 * `includeHidden: true` for the raw enumerator (every image slot). The override
 * mechanism itself is unaffected — it can target any key regardless of this
 * filter.
 */
export function packImageSlots(
  input: ShareCardInput,
  opts?: { includeHidden?: boolean; packId?: string | null },
): PackImageSlot[] {
  const template = resolveTemplate(input, opts?.packId);
  if (!template) return [];
  return template.fields
    .filter((f) => f.type === "photo" || f.type === "logo")
    .filter((f) => opts?.includeHidden || !PACK_OVERRIDE_HIDDEN_SLOTS.has(f.key))
    .map((f) => ({
      key: f.key,
      label: PACK_SLOT_LABELS[f.key] ?? f.label,
      type: f.type as "photo" | "logo",
    }));
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/**
 * kind → designs, per pack. Built lazily on first use of a pack and cached, so
 * registering a pack costs nothing until something renders it.
 *
 * This was a single module-level map built from Pack A, which is what made the
 * renderer single-pack: template lookup had no way to ask for a different pack.
 */
const DESIGN_INDEX = new Map<string, Map<string, PackDesignEntry[]>>();

export function designsByKind(packId?: string | null): Map<string, PackDesignEntry[]> {
  const manifest = getPackManifest(packId);
  let index = DESIGN_INDEX.get(manifest.packId);
  if (!index) {
    index = new Map<string, PackDesignEntry[]>();
    for (const d of manifest.designs) {
      const list = index.get(d.kind) ?? [];
      list.push(d);
      index.set(d.kind, list);
    }
    DESIGN_INDEX.set(manifest.packId, index);
  }
  return index;
}

/**
 * True when `packId` (default pack when omitted) has a design for `kind`.
 * Packs are not required to cover the same kinds, so this is per-pack.
 */
export function packSupportsKind(kind: string, packId?: string | null): boolean {
  return designsByKind(packId).has(kind);
}

/** Pick the design for an input; the two two-design kinds split on category. */
export function resolveTemplate(
  input: ShareCardInput,
  packId?: string | null,
): PackCardTemplate | null {
  const designs = designsByKind(packId).get(input.kind);
  if (!designs || designs.length === 0) return null;
  if (designs.length === 1) return designs[0].template;
  // gradeLeader / clubLeaderboard: choose Runs vs Wickets by category.
  const category = (input as { category?: string }).category ?? "Runs";
  const wantsWickets = category.trim().toLowerCase().startsWith("w");
  const match = designs.find(
    (d) => (d.categoryPreset === "Wickets") === wantsWickets,
  );
  return (match ?? designs[0]).template;
}

/** Select the format html for a size. A1 has three; every other card has two. */
export function selectFormatHtml(
  formats: PackTemplateFormats,
  size: CardSize,
): string {
  if ("portrait" in formats) {
    // Match Result — three distinct layouts.
    if (size === "portrait") return formats.portrait;
    if (size === "square") return formats.square;
    if (size === "story") return formats.story;
    return formats.story; // unknown size → sane default
  }
  // story vs shared (portrait + square both map to shared).
  if (size === "story") return formats.story;
  return formats.shared;
}

export function fieldDefaults(template: PackCardTemplate): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of template.fields) {
    if (f.type === "text") out[f.key] = f.sample;
  }
  return out;
}
