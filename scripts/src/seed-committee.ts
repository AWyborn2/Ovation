/**
 * Seed the club_roles table (season-by-season office bearers + grade captains)
 * from the history spreadsheet snapshot.
 *
 * Per the seeding memory, prefer running this via the executeSql code_execution
 * callback rather than `pnpm --filter @workspace/scripts run seed-committee`.
 * This script is kept as the canonical, reproducible source of the matching
 * logic and the role/grade mapping.
 *
 * Data source: `artifacts/api-server/src/data/club-roles.json`, generated from
 * `attached_assets/HHCC_history_*.xlsx` ("Honour Board" + "Grade Records"
 * sheets). Historical rows are seeded as published.
 *
 * Reconciliation: links a role-holder to a player when confident, otherwise
 * stores plain text (e.g. joint captains "A. B / C. D" are never linked).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db, clubRolesTable, playersTable } from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RoleJson {
  season: number;
  role: string;
  grade: string | null;
  name: string;
  displayOrder: number;
}

const DATA_FILE = resolve(
  __dirname,
  "..",
  "..",
  "artifacts",
  "api-server",
  "src",
  "data",
  "club-roles.json",
);

const GIVEN_VARIANTS: Record<string, string> = {
  matt: "matthew",
  matthew: "matt",
  mick: "michael",
  michael: "mick",
  mike: "michael",
  dan: "daniel",
  daniel: "dan",
  rob: "robert",
  robert: "rob",
  bob: "robert",
  chris: "christopher",
  christopher: "chris",
  al: "allan",
  allan: "al",
  alan: "allan",
  cam: "cameron",
  cameron: "cam",
  jeff: "jeffery",
  jeffery: "jeff",
  jeffrey: "jeff",
  andy: "andrew",
  andrew: "andy",
  ben: "benjamin",
  tony: "anthony",
  anthony: "tony",
  mathew: "matthew",
  zac: "zachary",
  zachary: "zac",
  steve: "steven",
  steven: "steve",
  stephen: "steve",
};

const SURNAME_VARIANTS: Record<string, string> = {
  clark: "clarke",
  clarke: "clark",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

interface DbPlayer {
  id: number;
  surname: string;
  givenName: string;
}

function buildFinder(players: DbPlayer[]) {
  const byKey = new Map<string, DbPlayer>();
  const bySurname = new Map<string, DbPlayer[]>();
  for (const p of players) {
    byKey.set(norm(p.givenName) + "|" + norm(p.surname), p);
    const k = norm(p.surname);
    if (!bySurname.has(k)) bySurname.set(k, []);
    bySurname.get(k)!.push(p);
  }
  return (givenName: string, surname: string): DbPlayer | null => {
    const gs = new Set([norm(givenName)]);
    if (GIVEN_VARIANTS[norm(givenName)]) gs.add(GIVEN_VARIANTS[norm(givenName)]);
    for (const g of [...gs]) if (GIVEN_VARIANTS[g]) gs.add(GIVEN_VARIANTS[g]);
    const ss = new Set([norm(surname)]);
    if (SURNAME_VARIANTS[norm(surname)]) ss.add(SURNAME_VARIANTS[norm(surname)]);
    for (const g of gs)
      for (const s of ss) {
        const p = byKey.get(g + "|" + s);
        if (p) return p;
      }
    for (const s of ss) {
      const cands = bySurname.get(s) || [];
      if (cands.length === 1) return cands[0];
      const fl = cands.filter(
        (c) => norm(c.givenName)[0] === norm(givenName)[0],
      );
      if (fl.length === 1) return fl[0];
    }
    return null;
  };
}

// A name is linkable only when it is a single "Given Surname" person. Joint
// captains ("A / B", "A & B", "A and B") stay plain text.
function resolveName(
  name: string,
  find: (g: string, s: string) => DbPlayer | null,
): number | null {
  if (/[/&]| and /i.test(name)) return null;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const surname = parts[parts.length - 1];
  const given = parts.slice(0, -1).join(" ");
  if (norm(given).length === 0 || norm(surname).length === 0) return null;
  const p = find(given, surname);
  return p ? p.id : null;
}

async function main() {
  const roles: RoleJson[] = JSON.parse(readFileSync(DATA_FILE, "utf8"));
  const players = await db.select().from(playersTable);
  const find = buildFinder(players);

  await db.delete(clubRolesTable);

  const rows = roles.map((r) => ({
    season: r.season,
    role: r.role,
    grade: r.grade,
    name: r.name,
    displayOrder: r.displayOrder,
    playerId: resolveName(r.name, find),
    published: true,
  }));

  // Insert in chunks to stay well under parameter limits.
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(clubRolesTable).values(rows.slice(i, i + 200));
  }

  const matched = rows.filter((r) => r.playerId != null).length;
  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${rows.length} club roles (${rows.filter((r) => r.grade == null).length} office bearers, ${rows.filter((r) => r.grade != null).length} grade captains); ${matched} linked to players.`,
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  },
);
