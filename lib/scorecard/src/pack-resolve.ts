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
  findDefaultTemplateRow(templates, kind, (t) => t.source === "pack")?.packId ?? null;
