import { and, eq, inArray } from "drizzle-orm";
import { squadMemberSeasonsTable } from "@workspace/db";
import type { db } from "@workspace/db";
import { MAX_SIDE_SIZE } from "@workspace/scorecard/selection-shape";

/**
 * Overseas players (ADR-009): a per-member, per-season flag the club sets in
 * the squad (`squad_member_seasons`), counted per side against the grade's cap
 * (`availability_settings.overseas_caps`). Over the cap the Hub warns and never
 * blocks. Nothing carries over between seasons: a season with no row reads as
 * not overseas. The flag is the club's own and never comes from central data.
 */

type Reader = Pick<typeof db, "select">;

/** The members flagged overseas for `season` (start year), optionally only among `memberIds`. */
export async function loadOverseasMemberIds(
  reader: Reader,
  tenantId: number,
  season: number,
  memberIds?: readonly number[],
): Promise<Set<number>> {
  if (memberIds && memberIds.length === 0) return new Set();
  const rows = await reader
    .select({ memberId: squadMemberSeasonsTable.memberId })
    .from(squadMemberSeasonsTable)
    .where(
      and(
        eq(squadMemberSeasonsTable.tenantId, tenantId),
        eq(squadMemberSeasonsTable.season, season),
        eq(squadMemberSeasonsTable.overseas, true),
        memberIds ? inArray(squadMemberSeasonsTable.memberId, [...memberIds]) : undefined,
      ),
    );
  return new Set(rows.map((r) => r.memberId));
}

/** A grade's cap from the club's map (keyed by app grade, as `team_sheet_overs`); null when none. */
export function overseasCapFor(
  caps: Record<string, number> | null | undefined,
  grade: string,
): number | null {
  const v = caps?.[grade];
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_SIDE_SIZE ? v : null;
}

export type OverseasCount = { count: number; cap: number | null; over: boolean };

/** The side's overseas count against the cap; `over` only when a cap is set. */
export function overseasCount(count: number, cap: number | null): OverseasCount {
  return { count, cap, over: cap != null && count > cap };
}

/**
 * A caps map as saved: trimmed grade keys, whole numbers 0–14, a blank grade
 * dropped. Returns an error message for a value out of range.
 */
export function cleanOverseasCaps(
  caps: Record<string, number>,
): { caps: Record<string, number> } | { error: string } {
  const out: Record<string, number> = {};
  for (const [raw, v] of Object.entries(caps)) {
    const grade = raw.trim();
    if (!grade) continue;
    if (!Number.isInteger(v) || v < 0 || v > MAX_SIDE_SIZE) {
      return { error: `The overseas cap for ${grade} must be a whole number from 0 to 14.` };
    }
    out[grade] = v;
  }
  return { caps: out };
}
