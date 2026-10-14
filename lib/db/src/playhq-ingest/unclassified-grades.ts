/**
 * Competitions the sync can see but Ovation can't place: a PlayHQ grade whose name
 * `classifyCentralGrade` returns no app grade for. Such matches are skipped by the central
 * projection (`skipped: grade "…" not projected`), so without this they vanish silently — a club
 * playing a new competition would just see its matches missing.
 *
 * Deliberate exclusions (charity one-offs, WA junior / pathway grades) are NOT reported: they
 * carry an explanatory `note`. A grade is "unclassified" when there is no app grade and no such
 * note, or the note says the app lacks a grade for it ("Female C").
 *
 * Reads `playhq.*` only (the ingest role's scope), so it classifies the raw PlayHQ grade name and
 * does not apply `central.grade_playhq_map`; a name that map would rename can in principle be
 * flagged here although the projector resolves it. Pure `findUnclassifiedGrades` + a loader.
 */
import { classifyCentralGrade } from "../central/grades";
import type { Queryable } from "./load";

export interface UnclassifiedGrade {
  gradeName: string;
  seasonName: string | null;
  /** PlayHQ matches the club's organisation has in this grade. */
  matches: number;
  reason: string;
}

export interface GradeUsage {
  gradeName: string | null;
  seasonName: string | null;
  matches: number;
}

const DELIBERATE_NOTE = /charity|junior|pathway/i;

export function findUnclassifiedGrades(usage: readonly GradeUsage[]): UnclassifiedGrade[] {
  const out: UnclassifiedGrade[] = [];
  for (const u of usage) {
    const name = (u.gradeName ?? "").trim();
    if (!name) continue;
    const { appGrade, note } = classifyCentralGrade(name);
    if (appGrade) continue;
    if (note && DELIBERATE_NOTE.test(note)) continue;
    out.push({
      gradeName: name,
      seasonName: u.seasonName,
      matches: u.matches,
      reason: note ?? "Ovation doesn't recognise this competition name",
    });
  }
  return out.sort((a, b) => b.matches - a.matches || a.gradeName.localeCompare(b.gradeName));
}

/** The senior PlayHQ grades `orgId` plays in, with match counts, that Ovation can't classify. */
export async function loadUnclassifiedGrades(
  c: Queryable,
  orgId: string,
): Promise<UnclassifiedGrade[]> {
  const res = await c.query<{ grade_name: string | null; season_name: string | null; n: string }>(
    `select g.name as grade_name, g.season_name, count(*)::text as n
       from playhq.matches m
       join playhq.grades g on g.id = m.grade_id
      where g.is_junior = false
        and (lower(m.home_org_id::text) = $1 or lower(m.away_org_id::text) = $1)
      group by g.name, g.season_name`,
    [orgId.toLowerCase()],
  );
  return findUnclassifiedGrades(
    res.rows.map((r) => ({
      gradeName: r.grade_name,
      seasonName: r.season_name,
      matches: Number(r.n),
    })),
  );
}
