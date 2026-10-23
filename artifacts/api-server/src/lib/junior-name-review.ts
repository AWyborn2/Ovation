import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, juniorParticipantsTable, juniorStatCorrectionsTable } from "@workspace/db";
import type { ListJuniorNameReviewResponse } from "@workspace/api-zod";
import type { z } from "zod";
import { getJuniorNameStyle } from "./junior-helpers";
import { formatJuniorName, isJuniorWithheld } from "./junior-names";
import type { Tx } from "./junior-admin-helpers";
type JuniorNameReview = z.infer<typeof ListJuniorNameReviewResponse>[number];
type JuniorNameEvidence = JuniorNameReview["evidence"][number];

export const cleanJuniorName = (name: string) => name.trim().replace(/\s+/g, " ");
export function namePublicationNote(mode: string, revision: string, evidence: readonly unknown[]) {
  return JSON.stringify({ action: "confirmed_junior_full_name", mode, revision, evidence });
}
export function isNamePublicationRetry(note: string | null, mode: string, revision: string) {
  try {
    const parsed = JSON.parse(note ?? "{}");
    return (
      parsed.action === "confirmed_junior_full_name" &&
      parsed.mode === mode &&
      parsed.revision === revision
    );
  } catch {
    return false;
  }
}
const key = (name: string) => cleanJuniorName(name).toLocaleLowerCase("en-AU");
const parts = (name: string) => cleanJuniorName(name).split(" ");
const initial = (name: string) => parts(name)[0]?.replace(/\./g, "").toLowerCase();
const surname = (name: string) => parts(name).at(-1)?.toLowerCase();
const placeholder = (name: string) =>
  /\b(private|withheld|unknown|player|fill[\s-]?in|tba|tbc|anonymous|unnamed)\b/i.test(name);

/** Conservative validation, not an identity inference. Manual confirmation may
 * resolve inconsistent sources but still needs an actual given name and surname. */
export function isExpandedJuniorName(name: string): boolean {
  const p = parts(name);
  return (
    !placeholder(name) &&
    p.length >= 2 &&
    p.every((s) => /^[\p{L}\p{M}'’.-]+$/u.test(s)) &&
    (p[0]?.replace(/[^\p{L}]/gu, "").length ?? 0) > 1 &&
    (p.at(-1)?.replace(/[^\p{L}]/gu, "").length ?? 0) > 1 &&
    !p.some((s) => /^[\p{L}]\.$/u.test(s))
  );
}

export function classifyJuniorName(
  current: string,
  evidence: readonly JuniorNameEvidence[],
  protectedName: boolean,
) {
  const expanded = new Map<string, string>();
  for (const e of evidence)
    if (isExpandedJuniorName(e.name)) expanded.set(key(e.name), cleanJuniorName(e.name));
  if (protectedName) return { status: "protected" as const, suggestedName: null };
  if (isExpandedJuniorName(current)) return { status: "expanded" as const, suggestedName: null };
  if (!/^\p{L}\.?\s+\S+/u.test(cleanJuniorName(current)) || placeholder(current))
    return { status: "identity_review" as const, suggestedName: null };
  const compatible = [...expanded.values()].filter(
    (n) => n[0]?.toLowerCase() === initial(current) && surname(n) === surname(current),
  );
  const contradictory = evidence.some((e) => {
    if (placeholder(e.name) || parts(e.name).length < 2) return false;
    return (
      e.name.trim()[0]?.toLowerCase() !== initial(current) || surname(e.name) !== surname(current)
    );
  });
  if (contradictory) return { status: "identity_review" as const, suggestedName: null };
  if (expanded.size > 1) return { status: "conflicting" as const, suggestedName: null };
  if (compatible.length === 1)
    return { status: "suggested" as const, suggestedName: compatible[0]! };
  return {
    status: evidence.length ? ("abbreviated" as const) : ("missing" as const),
    suggestedName: null,
  };
}

/** Read only: stable GUID + tenant are the ONLY joins; never search by a name or
 * consult senior links. A transaction caller reuses its snapshot for publication. */
export async function loadJuniorNameReview(
  tenantId: number,
  conn: typeof db | Tx = db,
  styleOverride?: Awaited<ReturnType<typeof getJuniorNameStyle>>,
): Promise<JuniorNameReview[]> {
  const style = styleOverride ?? (await getJuniorNameStyle(tenantId));
  const participants = await conn
    .select()
    .from(juniorParticipantsTable)
    .where(eq(juniorParticipantsTable.tenantId, tenantId))
    .orderBy(juniorParticipantsTable.participantId);
  const evidence = await conn.execute(sql`
    SELECT lower(l.participant_id) AS pid, l.source, l.source_id AS "sourceId",
           l.player_name AS name, m.season, m.team_name AS team
    FROM (
      SELECT participant_id, player_name, match_id, is_halls_head, 'roster' AS source, id AS source_id FROM junior_match_rosters
      UNION ALL SELECT participant_id, player_name, match_id, is_halls_head, 'batting', id FROM junior_match_batting
      UNION ALL SELECT participant_id, player_name, match_id, is_halls_head, 'bowling', id FROM junior_match_bowling
    ) l JOIN junior_matches m ON m.id = l.match_id
    WHERE m.tenant_id = ${tenantId} AND l.is_halls_head AND l.player_name IS NOT NULL
    UNION ALL
    SELECT lower(l.participant_id), 'premiership', l.id, l.player_name, p.season, p.team_name
    FROM junior_premiership_players l JOIN junior_premierships p ON p.id = l.premiership_id
    WHERE p.tenant_id = ${tenantId} AND l.participant_id IS NOT NULL AND l.player_name IS NOT NULL
    ORDER BY pid, source, "sourceId"
  `);
  const byId = new Map<string, JuniorNameEvidence[]>();
  for (const { pid, ...e } of evidence.rows as (JuniorNameEvidence & { pid: string | null })[]) {
    if (!pid) continue;
    const list = byId.get(pid) ?? [];
    list.push(e);
    byId.set(pid, list);
  }
  const corrections = await conn
    .select()
    .from(juniorStatCorrectionsTable)
    .where(
      and(
        eq(juniorStatCorrectionsTable.tenantId, tenantId),
        eq(juniorStatCorrectionsTable.targetTable, "junior_participants"),
      ),
    )
    .orderBy(juniorStatCorrectionsTable.id);
  const counts = new Map<string, number>();
  for (const p of participants)
    counts.set(p.participantId.toLowerCase(), (counts.get(p.participantId.toLowerCase()) ?? 0) + 1);
  return participants.map((p) => {
    const sources = byId.get(p.participantId.toLowerCase()) ?? [];
    const journals = corrections.filter(
      (c) => c.targetId.toLowerCase() === p.participantId.toLowerCase(),
    );
    const history = journals
      .filter((c) => c.patch && typeof c.patch === "object" && "display_name" in c.patch)
      .map((c) => ({
        id: c.id,
        before:
          ((c.prevValues as Record<string, unknown> | null)?.display_name as string | null) ?? null,
        after: ((c.patch as Record<string, unknown> | null)?.display_name as string | null) ?? null,
        by: c.createdBy,
        at: c.createdAt.toISOString(),
      }));
    const currentName = p.displayName ?? "";
    const classification =
      counts.get(p.participantId.toLowerCase()) !== 1
        ? { status: "identity_review" as const, suggestedName: null }
        : classifyJuniorName(currentName, sources, history.length > 0);
    return {
      participantId: p.participantId,
      currentName,
      ...classification,
      evidence: sources,
      firstSeason: p.firstSeason,
      lastSeason: p.lastSeason,
      teams: p.teams,
      nameStyle: style,
      withheld: isJuniorWithheld(p),
      publicName: isJuniorWithheld(p)
        ? "Private Player"
        : formatJuniorName(classification.suggestedName ?? currentName, style),
      history,
      revision: createHash("sha256")
        .update(JSON.stringify([tenantId, p, style, sources, journals]))
        .digest("hex"),
    };
  });
}
