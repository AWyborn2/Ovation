/**
 * Refresh the worst-case names fixture (`lib/scorecard/src/kind-templates/worst-case-names.ts`)
 * from the associations' data (social template library, L2-A task T2.3).
 *
 *   cd scripts && npx tsx src/refresh-worst-case-names.ts [--write]
 *       reads `central` through CENTRAL_DATABASE_URL (PCA, and WA where it is projected)
 *   cd scripts && npx tsx src/refresh-worst-case-names.ts --sqlite=<pca_full.db> --wa=<WA builder folder> --write
 *       reads the PCA SQLite build and the WA builder folder's JSON instead
 *       (the dev stack's database has PCA only)
 *
 * Without `--write` it prints what it found. Team, competition and ground
 * names are kept; player names become stand-ins of the same shape
 * (`refresh-worst-case-names-core.ts`), so no player's name is committed.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  firstLast,
  fixtureSource,
  pickWorstCaseNames,
  type NameSources,
} from "./refresh-worst-case-names-core";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURE = path.join(REPO_ROOT, "lib/scorecard/src/kind-templates/worst-case-names.ts");

const TEAMS_SQL = (s: string) => `
  select name from ${s}clubs
  union select name from ${s}club_name_history
  union select home_team from ${s}matches union select away_team from ${s}matches`;
const GRADES_SQL = (s: string) => `select distinct grade from ${s}matches`;
const VENUES_SQL = (s: string) => `select distinct venue from ${s}matches`;
const PLAYERS_SQL = (s: string) =>
  `select display_name from ${s}players where not coalesce(is_private, false)`;

const column = (rows: Array<Record<string, unknown>>) =>
  rows.map((r) => Object.values(r)[0]).filter((v): v is string => typeof v === "string");

async function fromCentral(url: string): Promise<NameSources> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const q = async (sql: string) => column((await client.query(sql)).rows);
    return {
      label: "central (CENTRAL_DATABASE_URL)",
      teams: await q(TEAMS_SQL("central.")),
      grades: await q(GRADES_SQL("central.")),
      venues: await q(VENUES_SQL("central.")),
      players: await q(PLAYERS_SQL("central.")),
    };
  } finally {
    await client.end();
  }
}

async function fromSqlite(file: string): Promise<NameSources> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const q = (sql: string) => column(db.prepare(sql).all() as Array<Record<string, unknown>>);
    return {
      label: `PCA (${path.basename(file)})`,
      teams: q(TEAMS_SQL("")),
      grades: q(GRADES_SQL("")),
      venues: q(VENUES_SQL("")),
      players: q(PLAYERS_SQL("").replace("not coalesce(is_private, false)", "is_private = 0")),
    };
  } finally {
    db.close();
  }
}

/** The WA builder folder: its match backfill (teams, grades, grounds) and full player names. */
function fromWaFolder(dir: string): NameSources {
  const json = (name: string) =>
    JSON.parse(readFileSync(path.join(dir, "JSON Data", name), "utf8")) as Record<string, unknown>;
  const matches = Object.values(
    json("wa_premier_cricket_all_seasons_backfill_progress.json"),
  ) as Array<{
    club?: string;
    grade?: string;
    venue?: string;
    summary?: Array<{ name?: string }>;
  }>;
  const players = Object.values(json("wa_premier_player_full_names.json")) as Array<{
    name?: string;
  }>;
  const str = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
  return {
    label: "WA Premier Cricket (builder folder)",
    teams: matches.flatMap((m) => [m.club, ...(m.summary ?? []).map((s) => s.name)]).filter(str),
    grades: matches.map((m) => m.grade).filter(str),
    venues: matches.map((m) => m.venue).filter(str),
    players: players
      .map((p) => p.name)
      .filter(str)
      .map(firstLast),
  };
}

async function main() {
  const args = new Map(
    process.argv.slice(2).map((a) => {
      const m = /^--([a-z]+)(?:=(.*))?$/.exec(a);
      if (!m) throw new Error(`Unknown argument: ${a}`);
      return [m[1]!, m[2] ?? "true"] as const;
    }),
  );
  const sources: NameSources[] = [];
  const sqlite = args.get("sqlite");
  if (sqlite) sources.push(await fromSqlite(sqlite));
  else {
    const url = process.env.CENTRAL_DATABASE_URL;
    if (!url) throw new Error("Set CENTRAL_DATABASE_URL, or pass --sqlite=<pca_full.db>.");
    sources.push(await fromCentral(url));
  }
  const wa = args.get("wa");
  if (wa) sources.push(fromWaFolder(wa));

  const names = pickWorstCaseNames(sources);
  for (const s of sources)
    console.log(
      `${s.label}: ${s.teams.length} team names, ${s.grades.length} grades, ` +
        `${s.venues.length} grounds, ${s.players.length} players`,
    );
  console.log(JSON.stringify({ ...names, players: names.players, sources: undefined }, null, 2));
  if (!args.has("write")) return;
  writeFileSync(FIXTURE, fixtureSource(names));
  // CI's Prettier, so the generated file passes the format check as written.
  execSync(`npx -y prettier@3.9.6 --write "${FIXTURE}"`, { cwd: REPO_ROOT, stdio: "ignore" });
  console.log(`Wrote ${path.relative(REPO_ROOT, FIXTURE)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
