/**
 * repair-hh-opponents.ts — give Halls Head's native matches their real opponent
 * name and club link, from the central scorecard of the same match (plan U5).
 *
 * About 925 bulk-loaded native matches carry a competition label ("A Grade One
 * Day", …) in `matches.opponent` and no `opponent_club_id`, so Favourite
 * Opponents and opponent branding group by a competition instead of a club.
 * Every bulk match keys its master `source_key` to the central
 * `matches.playhq_match_id`, and the central match is symmetric, so the other
 * side of it is the real opponent.
 *
 *   # Preview (default) — reads both DBs, writes nothing to either:
 *   pnpm --filter @workspace/scripts run repair-hh-opponents -- --tenant=1 --out=/tmp/hh-opponents
 *
 *   # Apply in ONE transaction; the reversal file is written to --out first:
 *   pnpm --filter @workspace/scripts run repair-hh-opponents -- --tenant=1 --out=/tmp/hh-opponents --commit [--yes]
 *
 *   # Undo from a reversal file (preview, then --commit):
 *   pnpm --filter @workspace/scripts run repair-hh-opponents -- --tenant=1 --revert=<file> [--commit --yes]
 *
 * Rules:
 *   - Only matches with `opponent_club_id IS NULL` are candidates; a match that
 *     already has a club link is never touched.
 *   - The opponent name matches what already-linked matches use: when the match
 *     gets an app club link it is that club's register name (`clubs.name`, read
 *     from the native DB); otherwise the central CLUB name, falling back to the
 *     central team name only when the club has none. Central team names are
 *     inconsistent ("Mandurah", "Rockingham Hornets Cricket Club", "X A Grade"),
 *     so they are the last resort. The preview records each name's source.
 *   - The app `clubs` id comes from a central-club -> app-club map LEARNED from
 *     native matches that already have `opponent_club_id` and link to central.
 *     The most frequent pairing wins (the `centralClubIdForPlayhqOrg` rule in
 *     lib/db/src/central/vs-club.ts), so one mis-linked row can't flip it.
 *     With no learned mapping, only the name is set.
 *   - Only `opponent` and `opponent_club_id` are written. Each update is
 *     guarded on the row still holding the previewed previous values, and any
 *     miss aborts the whole transaction.
 *   - The central DB is only read, through the read-only `centralDb` proxy.
 *
 * Native `matches` has no tenant column: it is Halls Head's (tenant 1) own
 * history, so `--tenant=1` is required and every other tenant is refused.
 * Needs DATABASE_URL (native) and CENTRAL_DATABASE_URL (central).
 */

// ---------------------------------------------------------------------------
// Pure logic — testable without a database
// ---------------------------------------------------------------------------

export const HALLS_HEAD_TENANT_ID = 1;

export interface NativeMatch {
  id: number;
  sourceKey: string | null;
  opponent: string | null;
  opponentClubId: number | null;
}

export interface CentralMatch {
  matchId: number;
  playhqMatchId: string | null;
  homeClubId: number | null;
  awayClubId: number | null;
  homeTeam: string | null;
  awayTeam: string | null;
}

export interface OpponentValues {
  opponent: string | null;
  opponentClubId: number | null;
}

/**
 * Where `next.opponent` came from: the app clubs register name of the linked
 * club, the central club name, or (last resort) the central team name.
 */
export type NameSource = "app_club" | "central_club" | "central_team";

export interface RepairUpdate {
  matchId: number;
  sourceKey: string;
  centralMatchId: number;
  centralClubId: number;
  previous: OpponentValues;
  next: OpponentValues;
  nameSource: NameSource;
}

export type SkipReason =
  "no_source_key" | "no_central_match" | "club_not_in_match" | "no_opponent_name";

export interface Skipped {
  matchId: number;
  sourceKey: string | null;
  reason: SkipReason;
}

export interface ClubLink {
  appClubId: number;
  /** Native matches voting for the winning app club. */
  votes: number;
  /** All native matches voting for any app club for this central club. */
  total: number;
}

export interface RepairPlan {
  updates: RepairUpdate[];
  skipped: Skipped[];
  perClub: {
    centralClubId: number;
    name: string | null;
    appClubId: number | null;
    matches: number;
  }[];
  unresolvedClubs: { centralClubId: number; name: string | null; matches: number }[];
  clubMap: Map<number, ClubLink>;
  counts: {
    native: number;
    alreadyLinked: number;
    candidates: number;
    toUpdate: number;
    withClub: number;
    nameOnly: number;
    unchanged: number;
    skipped: number;
    /** Updates by where the new opponent name came from. */
    nameSource: Record<NameSource, number>;
  };
}

const clean = (s: string | null | undefined): string | null => {
  const t = s?.trim();
  return t ? t : null;
};

const keyOf = (s: string | null): string | null => clean(s)?.toLowerCase() ?? null;

/** Central matches indexed by lower-cased PlayHQ match id. */
function indexCentral(central: readonly CentralMatch[]): Map<string, CentralMatch> {
  const byKey = new Map<string, CentralMatch>();
  for (const c of central) {
    const k = keyOf(c.playhqMatchId);
    if (k) byKey.set(k, c);
  }
  return byKey;
}

/**
 * The side of a central match that is NOT `clubId`. Null when the club is on
 * neither side (not its match) or on both (an intra-club fixture).
 */
export function opposingSide(
  m: CentralMatch,
  clubId: number,
): { centralClubId: number | null; teamName: string | null } | null {
  const home = m.homeClubId === clubId;
  const away = m.awayClubId === clubId;
  if (home === away) return null;
  return home
    ? { centralClubId: m.awayClubId, teamName: clean(m.awayTeam) }
    : { centralClubId: m.homeClubId, teamName: clean(m.homeTeam) };
}

/**
 * Learn central club id -> app `clubs.id` from the native matches that already
 * carry `opponent_club_id` and link to a central match. Most frequent app club
 * wins; a tie goes to the lower app id so the result is deterministic.
 */
export function learnClubMap(
  native: readonly NativeMatch[],
  central: readonly CentralMatch[],
  clubId: number,
): Map<number, ClubLink> {
  const byKey = indexCentral(central);
  const votes = new Map<number, Map<number, number>>();
  for (const n of native) {
    if (n.opponentClubId == null) continue;
    const k = keyOf(n.sourceKey);
    const c = k ? byKey.get(k) : undefined;
    if (!c) continue;
    const side = opposingSide(c, clubId);
    if (side?.centralClubId == null) continue;
    const inner = votes.get(side.centralClubId) ?? new Map<number, number>();
    inner.set(n.opponentClubId, (inner.get(n.opponentClubId) ?? 0) + 1);
    votes.set(side.centralClubId, inner);
  }
  const out = new Map<number, ClubLink>();
  for (const [centralClubId, inner] of votes) {
    let best: ClubLink | null = null;
    let total = 0;
    for (const [appClubId, n] of inner) {
      total += n;
      if (!best || n > best.votes || (n === best.votes && appClubId < best.appClubId)) {
        best = { appClubId, votes: n, total: 0 };
      }
    }
    if (best) out.set(centralClubId, { ...best, total });
  }
  return out;
}

/**
 * The opponent name to write, and where it came from. A match that gets an app
 * club link takes that club's register name (`clubs.name`), so it groups with
 * the matches already linked to the same club. An unlinked match takes the
 * central CLUB name ("Mandurah Cricket Club", not "Mandurah A Grade"), and only
 * falls back to the central team name when the club has none. The register
 * name falls back the same way if it is somehow blank.
 */
export function opponentName(src: {
  appClubName: string | null;
  centralClubName: string | null;
  teamName: string | null;
}): { name: string; source: NameSource } | null {
  const app = clean(src.appClubName);
  if (app) return { name: app, source: "app_club" };
  const club = clean(src.centralClubName);
  if (club) return { name: club, source: "central_club" };
  const team = clean(src.teamName);
  if (team) return { name: team, source: "central_team" };
  return null;
}

/** Build the full repair plan. Pure; the preview prints it, --commit applies it. */
export function planRepair(input: {
  native: readonly NativeMatch[];
  central: readonly CentralMatch[];
  centralClubNames: ReadonlyMap<number, string | null>;
  /** The app clubs register (native DB): clubs.id -> clubs.name. */
  appClubNames: ReadonlyMap<number, string | null>;
  clubId: number;
}): RepairPlan {
  const { native, central, centralClubNames, appClubNames, clubId } = input;
  const byKey = indexCentral(central);
  const clubMap = learnClubMap(native, central, clubId);

  const updates: RepairUpdate[] = [];
  const skipped: Skipped[] = [];
  let alreadyLinked = 0;
  let unchanged = 0;

  for (const n of [...native].sort((a, b) => a.id - b.id)) {
    if (n.opponentClubId != null) {
      alreadyLinked++;
      continue;
    }
    const k = keyOf(n.sourceKey);
    if (!k) {
      skipped.push({ matchId: n.id, sourceKey: n.sourceKey, reason: "no_source_key" });
      continue;
    }
    const c = byKey.get(k);
    if (!c) {
      skipped.push({ matchId: n.id, sourceKey: n.sourceKey, reason: "no_central_match" });
      continue;
    }
    const side = opposingSide(c, clubId);
    if (!side) {
      skipped.push({ matchId: n.id, sourceKey: n.sourceKey, reason: "club_not_in_match" });
      continue;
    }
    const appClubId =
      side.centralClubId == null ? null : (clubMap.get(side.centralClubId)?.appClubId ?? null);
    const named = opponentName({
      appClubName: appClubId == null ? null : (appClubNames.get(appClubId) ?? null),
      centralClubName:
        side.centralClubId == null ? null : (centralClubNames.get(side.centralClubId) ?? null),
      teamName: side.teamName,
    });
    if (!named || side.centralClubId == null) {
      skipped.push({ matchId: n.id, sourceKey: n.sourceKey, reason: "no_opponent_name" });
      continue;
    }
    const next: OpponentValues = { opponent: named.name, opponentClubId: appClubId };
    if (next.opponent === n.opponent && next.opponentClubId === null) {
      unchanged++;
      continue;
    }
    updates.push({
      matchId: n.id,
      sourceKey: n.sourceKey as string,
      centralMatchId: c.matchId,
      centralClubId: side.centralClubId,
      previous: { opponent: n.opponent, opponentClubId: n.opponentClubId },
      next,
      nameSource: named.source,
    });
  }

  const perClubMap = new Map<number, RepairPlan["perClub"][number]>();
  for (const u of updates) {
    const row = perClubMap.get(u.centralClubId) ?? {
      centralClubId: u.centralClubId,
      name: clean(centralClubNames.get(u.centralClubId)) ?? u.next.opponent,
      appClubId: u.next.opponentClubId,
      matches: 0,
    };
    row.matches++;
    perClubMap.set(u.centralClubId, row);
  }
  const perClub = [...perClubMap.values()].sort(
    (a, b) => b.matches - a.matches || a.centralClubId - b.centralClubId,
  );
  const unresolvedClubs = perClub
    .filter((p) => p.appClubId === null)
    .map(({ centralClubId, name, matches }) => ({ centralClubId, name, matches }));

  const withClub = updates.filter((u) => u.next.opponentClubId !== null).length;
  const nameSource: Record<NameSource, number> = { app_club: 0, central_club: 0, central_team: 0 };
  for (const u of updates) nameSource[u.nameSource]++;
  return {
    updates,
    skipped,
    perClub,
    unresolvedClubs,
    clubMap,
    counts: {
      native: native.length,
      alreadyLinked,
      candidates: native.length - alreadyLinked,
      toUpdate: updates.length,
      withClub,
      nameOnly: updates.length - withClub,
      unchanged,
      skipped: skipped.length,
      nameSource,
    },
  };
}

// ---------------------------------------------------------------------------
// Reversal
// ---------------------------------------------------------------------------

export interface ReversalRecord {
  script: "repair-hh-opponents";
  tenantId: number;
  clubId: number;
  createdAt: string;
  rows: { matchId: number; previous: OpponentValues; next: OpponentValues }[];
}

export function buildReversalRecord(
  plan: RepairPlan,
  meta: { tenantId: number; clubId: number; createdAt: string },
): ReversalRecord {
  return {
    script: "repair-hh-opponents",
    ...meta,
    rows: plan.updates.map((u) => ({ matchId: u.matchId, previous: u.previous, next: u.next })),
  };
}

export interface RestoreUpdate extends OpponentValues {
  matchId: number;
  /** The values the row must still hold (what the repair wrote). */
  expected: OpponentValues;
}

/**
 * Plan an undo. A row is restored only while it still holds exactly what the
 * repair wrote; a row edited since (or deleted) is reported, never clobbered.
 */
export function planReversal(
  record: ReversalRecord,
  current: readonly NativeMatch[],
): {
  restores: RestoreUpdate[];
  conflicts: { matchId: number; reason: "missing" | "changed_since_repair" }[];
} {
  if (record.script !== "repair-hh-opponents" || !Array.isArray(record.rows)) {
    throw new Error("Not a repair-hh-opponents reversal record.");
  }
  const byId = new Map(current.map((m) => [m.id, m]));
  const restores: RestoreUpdate[] = [];
  const conflicts: { matchId: number; reason: "missing" | "changed_since_repair" }[] = [];
  for (const r of record.rows) {
    const cur = byId.get(r.matchId);
    if (!cur) {
      conflicts.push({ matchId: r.matchId, reason: "missing" });
      continue;
    }
    if (cur.opponent !== r.next.opponent || cur.opponentClubId !== r.next.opponentClubId) {
      conflicts.push({ matchId: r.matchId, reason: "changed_since_repair" });
      continue;
    }
    restores.push({ matchId: r.matchId, ...r.previous, expected: r.next });
  }
  return { restores, conflicts };
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const ALLOWED_FLAGS = new Set(["--tenant", "--out", "--commit", "--revert", "--yes", "--help"]);

export const USAGE = `repair-hh-opponents — set Halls Head native matches' opponent name + club from central.

  pnpm --filter @workspace/scripts run repair-hh-opponents -- --tenant=1 [--out=<dir>]            preview
  pnpm --filter @workspace/scripts run repair-hh-opponents -- --tenant=1 --out=<dir> --commit     apply
  pnpm --filter @workspace/scripts run repair-hh-opponents -- --tenant=1 --revert=<file> [--commit]

  --tenant=1       required; native matches belong to Halls Head (tenant 1) only
  --out=<dir>      where the preview + reversal JSON are written (required with --commit)
  --commit         write, in one transaction (default is preview only)
  --revert=<file>  undo from a reversal file written by a previous --commit
  --yes            confirm a write to a non-local DATABASE_URL`;

export function flagValue(argv: readonly string[], flag: string): string | undefined {
  return argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);
}

/** Null when the arguments are valid, else the error to print. */
export function validateArgs(argv: readonly string[]): string | null {
  for (const a of argv) {
    const flag = a.split("=")[0] ?? a;
    if (!ALLOWED_FLAGS.has(flag)) return `Unknown flag "${a}".`;
  }
  const tenant = flagValue(argv, "--tenant");
  if (!tenant) return "--tenant=<id> is required.";
  if (Number(tenant) !== HALLS_HEAD_TENANT_ID) {
    return `Refusing --tenant=${tenant}: native matches belong to Halls Head, tenant ${HALLS_HEAD_TENANT_ID}, only.`;
  }
  if (argv.includes("--commit") && !flagValue(argv, "--revert") && !flagValue(argv, "--out")) {
    return "--commit needs --out=<dir> so the reversal file is written before any change.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function printPlan(plan: RepairPlan): void {
  const c = plan.counts;
  console.log(
    `Native matches: ${c.native} (already linked ${c.alreadyLinked}, candidates ${c.candidates})`,
  );
  console.log(
    `To update: ${c.toUpdate} (name + club ${c.withClub}, name only ${c.nameOnly}); ` +
      `unchanged ${c.unchanged}; skipped ${c.skipped}`,
  );
  console.log(
    `Opponent name from: app clubs register ${c.nameSource.app_club}, ` +
      `central club ${c.nameSource.central_club}, central team ${c.nameSource.central_team}`,
  );
  const reasons = new Map<string, number>();
  for (const s of plan.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
  for (const [r, n] of reasons) console.log(`  skipped ${r}: ${n}`);
  console.log("\nPer opposing club (central id -> app club id: matches, name written [source]):");
  for (const p of plan.perClub) {
    const link = plan.clubMap.get(p.centralClubId);
    const learned = link ? ` [learned ${link.votes}/${link.total}]` : "";
    const written = new Set(
      plan.updates
        .filter((u) => u.centralClubId === p.centralClubId)
        .map((u) => `"${u.next.opponent}" [${u.nameSource}]`),
    );
    console.log(
      `  ${p.centralClubId} ${p.name ?? "?"} -> ${p.appClubId ?? "UNRESOLVED"}: ${p.matches}${learned}` +
        ` => ${[...written].join(", ")}`,
    );
  }
  if (plan.unresolvedClubs.length) {
    console.log("\nUnresolved central clubs (name only, no app club link):");
    for (const u of plan.unresolvedClubs) {
      console.log(`  ${u.centralClubId} ${u.name ?? "?"}: ${u.matches}`);
    }
  }
  const noCentral = plan.skipped.filter((s) => s.reason === "no_central_match").slice(0, 20);
  if (noCentral.length) {
    console.log("\nFirst native matches with no central counterpart:");
    for (const s of noCentral) console.log(`  match ${s.matchId} source_key=${s.sourceKey}`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  if (argv.includes("--help")) {
    console.log(USAGE);
    return;
  }
  const argError = validateArgs(argv);
  if (argError) {
    console.error(argError);
    console.error(USAGE);
    process.exit(2);
  }

  const { mkdirSync, readFileSync, writeFileSync } = await import("node:fs");
  const path = await import("node:path");
  const { and, eq, isNull, sql } = await import("drizzle-orm");
  const { db, closeDb, clubsTable, matchesTable, tenantsTable } = await import("@workspace/db");
  const { confirmDatabaseTarget } = await import("./lib/cli");

  const commit = argv.includes("--commit");
  const outDir = flagValue(argv, "--out");
  const revertPath = flagValue(argv, "--revert");

  const readNative = (): Promise<NativeMatch[]> =>
    db
      .select({
        id: matchesTable.id,
        sourceKey: matchesTable.sourceKey,
        opponent: matchesTable.opponent,
        opponentClubId: matchesTable.opponentClubId,
      })
      .from(matchesTable);

  /** Guarded single-row write; throws (rolling back) when the row moved. */
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const guardedUpdate = async (
    tx: Tx,
    matchId: number,
    expected: OpponentValues,
    next: OpponentValues,
  ): Promise<void> => {
    const res = await tx
      .update(matchesTable)
      .set({ opponent: next.opponent, opponentClubId: next.opponentClubId })
      .where(
        and(
          eq(matchesTable.id, matchId),
          sql`${matchesTable.opponent} is not distinct from ${expected.opponent}`,
          expected.opponentClubId === null
            ? isNull(matchesTable.opponentClubId)
            : eq(matchesTable.opponentClubId, expected.opponentClubId),
        ),
      );
    if ((res.rowCount ?? 0) !== 1) {
      throw new Error(`match ${matchId} changed since the preview — rolled back, nothing written.`);
    }
  };

  try {
    // ---- Revert ------------------------------------------------------------
    if (revertPath) {
      const record = JSON.parse(readFileSync(revertPath, "utf8")) as ReversalRecord;
      if (record.tenantId !== HALLS_HEAD_TENANT_ID) {
        throw new Error(`Reversal file is for tenant ${record.tenantId}, not Halls Head.`);
      }
      const rev = planReversal(record, await readNative());
      console.log(
        `Reversal: ${rev.restores.length} to restore, ${rev.conflicts.length} conflicts (left alone).`,
      );
      for (const c of rev.conflicts.slice(0, 50)) console.log(`  match ${c.matchId}: ${c.reason}`);
      if (!commit) {
        console.log("\nPREVIEW only. Re-run with --commit to restore.");
        return;
      }
      confirmDatabaseTarget();
      await db.transaction(async (tx) => {
        for (const r of rev.restores) {
          await guardedUpdate(tx, r.matchId, r.expected, {
            opponent: r.opponent,
            opponentClubId: r.opponentClubId,
          });
        }
      });
      console.log(`Restored ${rev.restores.length} matches.`);
      return;
    }

    // ---- Repair ------------------------------------------------------------
    const [tenant] = await db
      .select({ id: tenantsTable.id, centralClubId: tenantsTable.centralClubId })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, HALLS_HEAD_TENANT_ID));
    if (!tenant) throw new Error(`Tenant ${HALLS_HEAD_TENANT_ID} not found.`);
    const clubId = tenant.centralClubId;

    const { centralDb, closeCentralDb, centralMatchesTable, centralClubsTable } =
      await import("@workspace/db/central");
    const { clubInvolvedWhere } = await import("@workspace/db/central-queries");

    try {
      console.log(`Reading native matches and central club_id=${clubId} (read-only)…`);
      const native = await readNative();
      const central: CentralMatch[] = await centralDb
        .select({
          matchId: centralMatchesTable.matchId,
          playhqMatchId: centralMatchesTable.playhqMatchId,
          homeClubId: centralMatchesTable.homeClubId,
          awayClubId: centralMatchesTable.awayClubId,
          homeTeam: centralMatchesTable.homeTeam,
          awayTeam: centralMatchesTable.awayTeam,
        })
        .from(centralMatchesTable)
        .where(clubInvolvedWhere(clubId));
      const clubs = await centralDb
        .select({ clubId: centralClubsTable.clubId, name: centralClubsTable.name })
        .from(centralClubsTable);
      // The app clubs register (native DB) — the names linked matches already use.
      const appClubs = await db
        .select({ id: clubsTable.id, name: clubsTable.name })
        .from(clubsTable);
      const plan = planRepair({
        native,
        central,
        centralClubNames: new Map(clubs.map((c) => [c.clubId, c.name])),
        appClubNames: new Map(appClubs.map((c) => [c.id, c.name])),
        clubId,
      });
      printPlan(plan);

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      if (outDir) {
        mkdirSync(outDir, { recursive: true });
        const previewPath = path.join(outDir, `repair-hh-opponents-preview-${stamp}.json`);
        writeFileSync(
          previewPath,
          JSON.stringify(
            {
              counts: plan.counts,
              perClub: plan.perClub,
              unresolvedClubs: plan.unresolvedClubs,
              skipped: plan.skipped,
              updates: plan.updates,
            },
            null,
            2,
          ),
        );
        console.log(`\nPreview written: ${previewPath}`);
      }

      if (!commit) {
        console.log("\nPREVIEW only. Re-run with --commit to apply.");
        return;
      }
      if (!outDir) throw new Error("--commit needs --out."); // validateArgs guarantees it
      if (plan.updates.length === 0) {
        console.log("Nothing to write.");
        return;
      }
      confirmDatabaseTarget();

      // Reversal file first: if it can't be written, nothing is changed.
      const reversalPath = path.join(outDir, `repair-hh-opponents-reversal-${stamp}.json`);
      writeFileSync(
        reversalPath,
        JSON.stringify(
          buildReversalRecord(plan, {
            tenantId: HALLS_HEAD_TENANT_ID,
            clubId,
            createdAt: new Date().toISOString(),
          }),
          null,
          2,
        ),
      );
      console.log(`Reversal record written: ${reversalPath}`);

      await db.transaction(async (tx) => {
        for (const u of plan.updates) await guardedUpdate(tx, u.matchId, u.previous, u.next);
      });
      console.log(`Updated ${plan.updates.length} matches (one transaction).`);
    } finally {
      await closeCentralDb().catch(() => undefined);
    }
  } finally {
    await closeDb().catch(() => undefined);
  }
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("repair-hh-opponents.ts") ||
    process.argv[1].endsWith("repair-hh-opponents.js"));

if (isMain) {
  main().catch((err) => {
    console.error(`\nFAILED: ${(err as Error).message}`);
    process.exit(1);
  });
}
