/**
 * Starter designs for card kind templates (plan U6, KTD3, KTD11; ADR-003).
 *
 * Two starters — Club Kit and Broadcast — each with a hand-designed document
 * for every card kind and size. A club's template for a kind is created
 * lazily from the starter its current pack maps to; the four retired packs
 * map to the closest starter.
 */
import {
  TEMPLATE_SIZE_ORDER,
  type LayerBox,
  type TemplateLayerBase,
  type TemplateSize,
} from "./document";
import { kindFields, TEMPLATE_CARD_KINDS, type TemplateCardKind } from "./fields";
import { BROADCAST_STARTERS } from "./starters/broadcast";
import { CLUB_KIT_STARTERS } from "./starters/club-kit";

export const STARTER_IDS = ["club-kit", "broadcast"] as const;
export type StarterId = (typeof STARTER_IDS)[number];

/**
 * A starter's document for one kind: the editor's layer document. Layers
 * carry the renderer's fields (text, style, rows, photo…) beyond the size
 * rules typed here, so they are kept open.
 */
export type StarterDocument = {
  layers: Array<TemplateLayerBase & Record<string, unknown>>;
  sponsorLock?: boolean;
};

export type StarterSet = Partial<Record<TemplateCardKind, StarterDocument>>;

const STARTERS: Record<StarterId, StarterSet> = {
  "club-kit": CLUB_KIT_STARTERS,
  broadcast: BROADCAST_STARTERS,
};

/** Display names, for the starter chooser. */
export const STARTER_NAMES: Record<StarterId, string> = {
  "club-kit": "Club Kit",
  broadcast: "Broadcast",
};

/**
 * Which starter each design pack maps to (KTD11): Club Kit and Broadcast Dark
 * to themselves; the dark-ground packs (Gold Foil, Neon Night) to Broadcast;
 * the light/colour packs (Bold Type, Sunset) to Club Kit.
 */
export const PACK_TO_STARTER: Record<string, StarterId> = {
  "club-kit-v1": "club-kit",
  "broadcast-dark-v1": "broadcast",
  "gold-foil-v1": "broadcast",
  "neon-night-v1": "broadcast",
  "bold-type-v1": "club-kit",
  "sunset-v1": "club-kit",
};

/** Packs that retire with card kind templates (R19). */
export const RETIRED_PACK_IDS: readonly string[] = [
  "gold-foil-v1",
  "neon-night-v1",
  "bold-type-v1",
  "sunset-v1",
];

/** The starter for a club's current pack; Club Kit when it has none or an unknown one. */
export function starterForPack(packId: string | null | undefined): StarterId {
  return (packId && PACK_TO_STARTER[packId]) || "club-kit";
}

/** Whether a pack id is one of the retired packs. */
export function isRetiredPack(packId: string | null | undefined): boolean {
  return !!packId && RETIRED_PACK_IDS.includes(packId);
}

/** A starter's designed document for a kind, or null while it isn't designed yet. */
export function starterDocument(starter: StarterId, kind: string): StarterDocument | null {
  return (STARTERS[starter] as Record<string, StarterDocument | undefined>)[kind] ?? null;
}

/** Kinds a starter still lacks a document for (the contract test's checklist). */
export function missingStarterKinds(starter: StarterId): TemplateCardKind[] {
  return TEMPLATE_CARD_KINDS.filter((kind) => !starterDocument(starter, kind));
}

const box = (y: number, h: number): Partial<Record<TemplateSize, LayerBox>> =>
  Object.fromEntries(TEMPLATE_SIZE_ORDER.map((size) => [size, { x: 6, y, w: 88, h }]));

/**
 * A plain placeholder for a kind whose starter isn't designed yet: the kind's
 * first few live fields stacked as text. It lets the pipeline and editor work
 * end to end in development; the release switch stays off until every real
 * starter exists, so clubs never see it.
 */
export function placeholderDocument(kind: string): StarterDocument {
  const fields = (kindFields(kind)?.fields ?? [])
    .filter((f) => !/^sponsor|Hashtag$/i.test(f.key))
    .slice(0, 5);
  const step = 80 / Math.max(fields.length, 1);
  return {
    layers: fields.map((f, i) => ({
      id: `placeholder-${f.key}`,
      kind: "text",
      name: f.label,
      content: `{{${f.key}}}`,
      style: { fontSize: i === 0 ? 7 : 5, fontWeight: i === 0 ? 800 : 600 },
      geometry: box(10 + i * step, step * 0.8),
    })),
  };
}

/** The document a new kind template starts from: the starter's, else the placeholder. */
export function startingDocument(starter: StarterId, kind: string): StarterDocument {
  return structuredClone(starterDocument(starter, kind) ?? placeholderDocument(kind));
}
