/**
 * Seed the cap_register and life_members tables from the handover content
 * snapshot.
 *
 * Per the seeding memory, run this via the executeSql code_execution callback
 * rather than `pnpm --filter @workspace/scripts run seed-honours` (the scripts
 * package's drizzle-orm dependency is the only thing that lets this run
 * directly). This script is kept as the canonical, reproducible source of the
 * matching logic.
 *
 * Data source: `artifacts/api-server/src/data/cap-register.json` and
 * `life-members.json`, generated from
 * `attached_assets/Pasted--Halls-Head-Cricket-Club-Honour-Boards-Content-Handover_*.txt`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  db,
  capRegisterTable,
  lifeMembersTable,
  playersTable,
} from "@workspace/db";

interface CapJson {
  capNo: number;
  name: string;
  deceased: boolean;
  inStats: boolean;
  gamesAGrade: number;
}

interface MemberJson {
  name: string;
  year: number;
  isPlayingMember: boolean;
  playerSlug: string | null;
  role: string | null;
  blurb: string;
}

const DATA_DIR = resolve(
  __dirname,
  "..",
  "..",
  "artifacts",
  "api-server",
  "src",
  "data",
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
  staney: "stanley",
  stanley: "staney",
  mathew: "matthew",
};

const SURNAME_VARIANTS: Record<string, string> = {
  clark: "clarke",
  clarke: "clark",
  skendar: "skender",
  skender: "skendar",
  capenar: "capener",
  capener: "capenar",
  manual: "manuel",
  manuel: "manual",
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
    if (GIVEN_VARIANTS[norm(givenName)])
      gs.add(GIVEN_VARIANTS[norm(givenName)]);
    for (const g of [...gs]) if (GIVEN_VARIANTS[g]) gs.add(GIVEN_VARIANTS[g]);
    const ss = new Set([norm(surname)]);
    if (SURNAME_VARIANTS[norm(surname)])
      ss.add(SURNAME_VARIANTS[norm(surname)]);
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

async function main() {
  const caps: CapJson[] = JSON.parse(
    readFileSync(resolve(DATA_DIR, "cap-register.json"), "utf8"),
  );
  const members: MemberJson[] = JSON.parse(
    readFileSync(resolve(DATA_DIR, "life-members.json"), "utf8"),
  );

  const players = await db.select().from(playersTable);
  const find = buildFinder(players);

  await db.delete(capRegisterTable);
  await db.delete(lifeMembersTable);

  const capRows = caps.map((c) => {
    const parts = c.name.split(/\s+/);
    const surname = parts[parts.length - 1];
    const given = parts.slice(0, -1).join(" ");
    const p = find(given, surname);
    return {
      capNumber: c.capNo,
      name: c.name,
      deceased: c.deceased,
      inStats: c.inStats,
      gamesAGrade: c.gamesAGrade,
      playerId: p ? p.id : null,
    };
  });
  await db.insert(capRegisterTable).values(capRows);

  const lmRows = members.map((m) => {
    let playerId: number | null = null;
    if (m.playerSlug) {
      const [surname, given] = m.playerSlug.split("__");
      const p = find(given, surname);
      playerId = p ? p.id : null;
    }
    return {
      name: m.name,
      inductionYear: m.year,
      isPlayingMember: m.isPlayingMember,
      roleLabel: m.role,
      blurb: m.blurb,
      playerId,
    };
  });
  await db.insert(lifeMembersTable).values(lmRows);

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${capRows.length} caps (${capRows.filter((c) => c.playerId).length} matched), ${lmRows.length} life members (${lmRows.filter((m) => m.playerId).length} matched).`,
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
