/**
 * Which design pack a tenant has chosen for a card kind — shared by the web
 * composer and the API's auto-drafts (Social Studio KTD8), so a draft is
 * created with the same pack the Studio would show.
 *
 * A tenant selects a pack by marking one of its `source: "pack"` template rows
 * as the default for a kind. Rows are typed structurally so both the API's
 * table rows and the web's generated DTOs fit.
 */
export type PackTemplateLike = {
  source: string;
  packId?: string | null;
  cardKinds: readonly string[];
  isActive: boolean;
  isDefault: boolean;
  defaultForKinds?: readonly string[] | null;
};

/** Whether a template row applies to `kind`: active, and assigned to it (or to every kind). */
export const templateAppliesToKind = (
  template: Pick<PackTemplateLike, "cardKinds" | "isActive">,
  kind: string,
): boolean =>
  template.isActive && (template.cardKinds.length === 0 || template.cardKinds.includes(kind));

/**
 * The row that is the default for `kind` among templates matching
 * `matchesSource`, honouring the per-kind claim first and the legacy global
 * `isDefault` flag second.
 */
export const findDefaultTemplateRow = <T extends PackTemplateLike>(
  templates: readonly T[] | undefined | null,
  kind: string,
  matchesSource: (t: T) => boolean,
): T | null => {
  if (!templates?.length) return null;
  const rows = templates.filter((t) => matchesSource(t) && templateAppliesToKind(t, kind));
  return (
    rows.find((t) => t.defaultForKinds?.includes(kind)) ?? rows.find((t) => t.isDefault) ?? null
  );
};

/**
 * The design pack a tenant has chosen for `kind`, or `null` for the default.
 * Returns `null` rather than the default pack id so callers fall through to
 * the renderer's own fallback — one definition of "the default", not two.
 */
export const resolvePackIdForKind = (
  templates: readonly PackTemplateLike[] | undefined | null,
  kind: string,
): string | null =>
  livePackId(findDefaultTemplateRow(templates, kind, (t) => t.source === "pack")?.packId ?? null);

/**
 * Design packs that have been retired (ADR-010). A saved choice of one reads
 * as Club Kit, so a club's setting or a saved carousel never points at a pack
 * that no longer renders. Empty until P9 retires Gold Foil, Bold Type, Neon
 * Night and Sunset.
 */
export const RETIRED_PACK_IDS: readonly string[] = [];

/** Where a retired pack's saved choices land. */
export const RETIRED_PACK_FALLBACK = "club-kit-v1";

/** A saved pack id as it renders today: a retired pack reads as Club Kit. */
export function livePackId<T extends string | null | undefined>(
  packId: T,
  retired: readonly string[] = RETIRED_PACK_IDS,
): T | typeof RETIRED_PACK_FALLBACK {
  return typeof packId === "string" && retired.includes(packId) ? RETIRED_PACK_FALLBACK : packId;
}
