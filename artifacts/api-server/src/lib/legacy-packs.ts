import { FALLBACK_PACK_ID, isLegacyPackId } from "@workspace/scorecard/queued-carousel";

/**
 * Hiding the four legacy design packs (match-day carousel content P9) from the
 * card template listing. Kept free of the database so it is unit-testable.
 */

type PackRowLike = {
  id: number;
  source: string;
  packId: string | null;
  isActive: boolean;
  isDefault: boolean;
  defaultForKinds: string[] | null;
};

/** Whether a card template row belongs to a hidden legacy pack. */
export function isLegacyPackRow(row: { source: string; packId: string | null }): boolean {
  return row.source === "pack" && isLegacyPackId(row.packId);
}

/**
 * A card template listing as a club sees it: hidden legacy pack rows are left
 * out, and any kind claim (or the old global default) one of them still holds
 * is shown on Club Kit's canonical row, so a club whose stored default is a
 * legacy pack reads (and renders) Club Kit. Stored rows are never rewritten;
 * the next pack choice an admin saves clears the old claim as usual.
 */
export function hideLegacyPackRows<T extends PackRowLike>(rows: readonly T[]): T[] {
  // Only an active row's claim ever resolved, so only those carry over.
  const legacy = rows.filter((r) => isLegacyPackRow(r) && r.isActive);
  const visible = rows.filter((r) => !isLegacyPackRow(r));
  const claimed = legacy.flatMap((r) => r.defaultForKinds ?? []);
  const wasDefault = legacy.some((r) => r.isDefault);
  if (claimed.length === 0 && !wasDefault) return visible;
  let target: T | null = null;
  for (const r of visible) {
    if (r.source !== "pack" || r.packId !== FALLBACK_PACK_ID || !r.isActive) continue;
    if (!target || r.id < target.id) target = r;
  }
  if (!target) return visible;
  const into = target;
  const kinds = [...new Set([...(into.defaultForKinds ?? []), ...claimed])];
  return visible.map((r) =>
    r === into ? { ...r, defaultForKinds: kinds, isDefault: r.isDefault || wasDefault } : r,
  );
}
