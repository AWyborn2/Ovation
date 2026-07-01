/**
 * diagnose-central-identity.ts — READ-ONLY diagnostic for the central player
 * identity collision (the "M Brown = 214 innings" problem).
 *
 * A single leaderboard row with an impossible career (e.g. 214 innings, top
 * score 64) can come from three causes, and the fix differs per cause:
 *
 *   (A) one participant_id GUID that covers many real people in the SOURCE data
 *       -> needs a curation SPLIT (per-match reassignment); can't be auto-fixed.
 *   (B) many GUIDs that share a display name ("M Brown")
 *       -> the crosswalk already separates them; a name-based merge downstream
 *          is the bug, and curation MERGE/RENAME cleans up presentation.
 *   (C) scorecard lines with a NULL participant_id
 *       -> already excluded from careers; shown by name in scorecards only.
 *
 * This script quantifies all three for one club so Phase 1 can size the split
 * curation work. It NEVER writes — central is read-only.
 *
 *   pnpm --filter @workspace/scripts run diagnose-central-identity -- --club-id=68
 *   ... -- --club-id=3 --top=40 --min-innings=120
 *
 * Requires CENTRAL_DATABASE_URL. Find a club id with:
 *   SELECT club_id, name FROM central.clubs WHERE name ILIKE '%baldivis%';
 */
import { and, eq, inArray, or } from "drizzle-orm";
import {
  centralDb,
  centralMatchesTable,
  centralMatchBattingTable,
  centralPlayersTable,
} from "@workspace/db/central";

const arg = (n: string): string | undefined =>
  process.argv.slice(2).find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

interface PidAgg {
  participantId: string;
  innings: number;
  matches: Set<number>;
  highScore: number;
  displayName: string | null;
}

async function main(): Promise<void> {
  const clubIdArg = arg("club-id");
  if (!clubIdArg) {
    console.error("Missing --club-id=N. Example: --club-id=68 (White Knights Baldivis).");
    process.exit(1);
  }
  const clubId = Number(clubIdArg);
  const top = Number(arg("top") ?? "30");
  const minInnings = Number(arg("min-innings") ?? "120");

  // 1. Matches this club played in.
  const matchRows = await centralDb
    .select({ matchId: centralMatchesTable.matchId })
    .from(centralMatchesTable)
    .where(
      or(
        eq(centralMatchesTable.homeClubId, clubId),
        eq(centralMatchesTable.awayClubId, clubId),
      ),
    );
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) {
    console.log(`No central matches found for club_id=${clubId}.`);
    return;
  }

  // 2. This club's batting lines in those matches.
  const lines = await centralDb
    .select({
      participantId: centralMatchBattingTable.participantId,
      matchId: centralMatchBattingTable.matchId,
      runs: centralMatchBattingTable.runs,
      playerName: centralMatchBattingTable.playerName,
    })
    .from(centralMatchBattingTable)
    .where(
      and(
        eq(centralMatchBattingTable.clubId, clubId),
        inArray(centralMatchBattingTable.matchId, matchIds),
      ),
    );

  // 3a. NULL-participant lines (cause C).
  const total = lines.length;
  const nullLines = lines.filter((l) => !l.participantId).length;

  // 3b. Aggregate per participant_id.
  const byPid = new Map<string, PidAgg>();
  for (const l of lines) {
    if (!l.participantId) continue;
    const a =
      byPid.get(l.participantId) ??
      {
        participantId: l.participantId,
        innings: 0,
        matches: new Set<number>(),
        highScore: 0,
        displayName: null,
      };
    a.innings += 1;
    if (l.matchId !== null) a.matches.add(l.matchId);
    if ((l.runs ?? 0) > a.highScore) a.highScore = l.runs ?? 0;
    byPid.set(l.participantId, a);
  }

  // 3c. Names from the central register.
  const pids = [...byPid.keys()];
  const players = pids.length
    ? await centralDb
        .select({
          participantId: centralPlayersTable.participantId,
          displayName: centralPlayersTable.displayName,
        })
        .from(centralPlayersTable)
        .where(inArray(centralPlayersTable.participantId, pids))
    : [];
  const nameByPid = new Map(players.map((p) => [p.participantId, p.displayName]));
  for (const a of byPid.values()) a.displayName = nameByPid.get(a.participantId) ?? null;

  // 4. Cause B: display names shared by more than one participant_id.
  const pidsByName = new Map<string, string[]>();
  for (const a of byPid.values()) {
    const key = (a.displayName ?? "(unknown)").trim();
    let arr = pidsByName.get(key);
    if (!arr) {
      arr = [];
      pidsByName.set(key, arr);
    }
    arr.push(a.participantId);
  }
  const sharedNames = [...pidsByName.entries()]
    .filter(([, ps]) => ps.length > 1)
    .sort((x, y) => y[1].length - x[1].length);

  // 5. Cause A: participants with implausibly high innings (candidate merges of
  //    many real people onto one GUID). Flagged, not judged — a human confirms.
  const implausible = [...byPid.values()]
    .filter((a) => a.innings >= minInnings)
    .sort((x, y) => y.innings - x.innings);

  // ---- Report ----
  console.log(`\n=== Central identity diagnostic — club_id=${clubId} ===`);
  console.log(`Matches: ${matchIds.length}`);
  console.log(`Batting lines: ${total}`);
  console.log(
    `  NULL participant_id (cause C, name-only, not aggregated): ${nullLines} ` +
      `(${total ? ((nullLines / total) * 100).toFixed(1) : "0"}%)`,
  );
  console.log(`Distinct participant_id GUIDs: ${byPid.size}`);

  console.log(
    `\n-- Cause B: display names shared by >1 GUID (${sharedNames.length}) ` +
      `— crosswalk separates them; merge/rename cleans presentation --`,
  );
  for (const [name, ps] of sharedNames.slice(0, top)) {
    console.log(`  "${name}": ${ps.length} GUIDs`);
  }
  if (sharedNames.length > top) console.log(`  ...and ${sharedNames.length - top} more`);

  console.log(
    `\n-- Cause A: GUIDs with >= ${minInnings} innings (${implausible.length}) ` +
      `— a low high-score with huge innings suggests one GUID = many people (needs SPLIT) --`,
  );
  console.log(`  innings  matches  HS   name`);
  for (const a of implausible.slice(0, top)) {
    console.log(
      `  ${String(a.innings).padStart(7)}  ${String(a.matches.size).padStart(7)}  ` +
        `${String(a.highScore).padStart(3)}  ${a.displayName ?? "(unknown)"}`,
    );
  }
  if (implausible.length > top) console.log(`  ...and ${implausible.length - top} more`);

  console.log(
    `\n=== Sizing summary ===\n` +
      `  Split-curation candidates (cause A, >= ${minInnings} innings): ${implausible.length}\n` +
      `  Merge/rename candidates (cause B, shared names): ${sharedNames.length}\n` +
      `  Name-only lines (cause C): ${nullLines}\n` +
      `If cause A count is ~0, split curation is not needed this pass; ship rename + merge.\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
