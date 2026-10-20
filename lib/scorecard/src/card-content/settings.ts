/**
 * Which content fields a card shows (ADR-010): the club's preset and per-field
 * choices (`social_settings.card_content`), then one carousel's override.
 * Pure; the API stores the settings, the Studio and the builders read them.
 */

import {
  CONTENT_KINDS,
  contentFields,
  isContentKind,
  isContentPreset,
  type ContentKind,
  type ContentPreset,
} from "../kind-templates/fields";

/** A club's content choices for one card kind. */
export interface ContentKindSettings {
  preset: ContentPreset;
  /** Per-field choices on top of the preset; core fields ignore them. */
  fields: Record<string, boolean>;
  /** Junior sets put the fixtures (or results) of one day on one slide (P3). */
  juniorConsolidateByDay: boolean;
}

/** `social_settings.card_content`: per content kind. */
export type CardContentSettings = Record<ContentKind, ContentKindSettings>;

/**
 * Photos an admin swapped in for a carousel's automatic picks (ADR-010 P4): a
 * library photo id, or null for "no photo". A slide with no entry keeps the
 * automatic pick.
 */
export interface ContentPhotoOverride {
  cover?: number | null;
  /** By fixture id. */
  fixtures?: Record<string, number | null>;
}

/** One carousel's change to the club's choices. A preset replaces the club's. */
export interface ContentOverride {
  preset?: ContentPreset;
  fields?: Record<string, boolean>;
  photos?: ContentPhotoOverride;
}

export const DEFAULT_CONTENT_KIND_SETTINGS: ContentKindSettings = {
  preset: "standard",
  fields: {},
  juniorConsolidateByDay: true,
};

/** What a club that never chose gets: Standard, junior consolidation on. Matches migration 0052's default. */
export function defaultCardContentSettings(): CardContentSettings {
  return Object.fromEntries(
    CONTENT_KINDS.map((k) => [k, { ...DEFAULT_CONTENT_KIND_SETTINGS, fields: {} }]),
  ) as CardContentSettings;
}

const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Known optional field keys of a kind with a boolean value; everything else dropped. */
function readFieldChoices(kind: ContentKind, raw: unknown): Record<string, boolean> {
  if (!object(raw)) return {};
  const optional = new Set(
    contentFields(kind)
      .filter((f) => f.tier === "optional")
      .map((f) => f.key),
  );
  return Object.fromEntries(
    Object.entries(raw).filter(([k, v]) => optional.has(k) && typeof v === "boolean"),
  ) as Record<string, boolean>;
}

/** Stored settings, made whole: unknown kinds, presets and field keys are dropped. */
export function readCardContentSettings(raw: unknown): CardContentSettings {
  const out = defaultCardContentSettings();
  if (!object(raw)) return out;
  for (const kind of CONTENT_KINDS) {
    const s = raw[kind];
    if (!object(s)) continue;
    out[kind] = {
      preset: isContentPreset(s.preset) ? s.preset : DEFAULT_CONTENT_KIND_SETTINGS.preset,
      fields: readFieldChoices(kind, s.fields),
      juniorConsolidateByDay:
        typeof s.juniorConsolidateByDay === "boolean"
          ? s.juniorConsolidateByDay
          : DEFAULT_CONTENT_KIND_SETTINGS.juniorConsolidateByDay,
    };
  }
  return out;
}

const photoChoice = (v: unknown): v is number | null =>
  v === null || (typeof v === "number" && Number.isSafeInteger(v) && v > 0);

/** Swapped photos with a valid id (or null); everything else dropped. */
function readPhotoOverride(raw: unknown): ContentPhotoOverride | null {
  if (!object(raw)) return null;
  const out: ContentPhotoOverride = {};
  if (photoChoice(raw.cover)) out.cover = raw.cover;
  if (object(raw.fixtures)) {
    const fixtures = Object.fromEntries(
      Object.entries(raw.fixtures).filter(([k, v]) => /^[1-9]\d*$/.test(k) && photoChoice(v)),
    ) as Record<string, number | null>;
    if (Object.keys(fixtures).length) out.fixtures = fixtures;
  }
  return Object.keys(out).length ? out : null;
}

/** A saved carousel's override, or null when it has none worth keeping. */
export function readContentOverride(kind: string, raw: unknown): ContentOverride | null {
  if (!isContentKind(kind) || !object(raw)) return null;
  const preset = isContentPreset(raw.preset) ? raw.preset : undefined;
  const fields = readFieldChoices(kind, raw.fields);
  const photos = readPhotoOverride(raw.photos);
  if (!preset && !Object.keys(fields).length && !photos) return null;
  return {
    ...(preset ? { preset } : {}),
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(photos ? { photos } : {}),
  };
}

/**
 * The fields a card shows. Core fields always; optional fields on in the
 * preset, then the club's per-field choices, then the override's. An override
 * that names a preset starts again from that preset (the club's per-field
 * choices were made for the club's preset, not this one).
 */
export function resolveVisibleFields(
  kind: string,
  settings?: Partial<Pick<ContentKindSettings, "preset" | "fields">> | null,
  override?: ContentOverride | null,
): Set<string> {
  const fields = contentFields(kind);
  const preset: ContentPreset = override?.preset ?? settings?.preset ?? "standard";
  const choices = {
    ...(override?.preset ? {} : (settings?.fields ?? {})),
    ...(override?.fields ?? {}),
  };
  const visible = new Set<string>();
  for (const f of fields) {
    const on =
      f.tier === "core" ||
      (typeof choices[f.key] === "boolean" ? choices[f.key] : f.presets.includes(preset));
    if (on) visible.add(f.key);
  }
  return visible;
}

/** The fields a preset alone shows (the settings UI marks choices that differ). */
export function presetFields(kind: string, preset: ContentPreset): Set<string> {
  return resolveVisibleFields(kind, { preset, fields: {} });
}
