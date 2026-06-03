/**
 * Load historical award winners from the club spreadsheet into award_winners.
 *
 * Source: attached_assets/HHCC_history_1780463450215.xlsx
 *   - "Awards" sheet: Burns Family Medal, Female POTY, Male/Female Clubperson,
 *     Chapelhow, Peter Wyllie, Male/Female Coaches, Presidents.
 *   - "Grade Records" sheet, "GRADE CRICKETERS OF THE YEAR" section: per-grade
 *     cricketer of the year (Mens A == Burns, Female A == Female POTY are deduped
 *     against the Awards sheet; the rest map to the per-grade points awards).
 *   - "Honour Board" sheet cols: Burns Mens / Female cricketer — deduped too.
 *
 * Name reconciliation: cells are split on "/" (multiple winners). Each name is
 * corrected (typos), expanded from initials/nicknames where safe, then matched
 * against the players table by exact "Given Surname". Matches link the winner to
 * the player; everything else (families, couples, non-roster names) is stored as
 * free text with playerId NULL for an admin to link later — non-destructive.
 *
 * Idempotent: deletes existing winners for the loaded awards, then re-inserts.
 * Run with DRY_RUN=1 to print the match report without writing.
 *
 * Run via: pnpm --filter @workspace/scripts run load-award-history
 */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { db, awardsTable, awardWinnersTable, playersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const DRY_RUN = process.env.DRY_RUN === "1";
const FILE = path.resolve(
  process.cwd(),
  "../attached_assets/HHCC_history_1780463450215.xlsx",
);

// Awards sheet column -> award key.
const AWARDS_COLS: Record<number, string> = {
  1: "burns-family-medal",
  2: "female-player-of-the-year",
  3: "clubperson-male",
  4: "clubperson-female",
  5: "chapelhow-award",
  6: "peter-wyllie-medal",
  7: "coaches-award-male",
  8: "coaches-award-female",
  9: "presidents-award",
};

// Grade Cricketers section column -> award key (Mens A / Female A are deduped).
const CRICKETER_COLS: Record<number, string> = {
  1: "burns-family-medal",
  2: "grade-cricketer-ppl",
  3: "female-player-of-the-year",
  4: "grade-cricketer-b-grade",
  5: "grade-cricketer-female-b-grade",
  6: "grade-cricketer-colts",
  7: "grade-cricketer-c-grade",
  8: "grade-cricketer-d-grade",
  9: "grade-cricketer-e-grade",
  10: "grade-cricketer-f-grade",
};

// Spelling corrections and nickname expansions applied before matching. Each
// value is the proper-case form that exact-matches a player in the roster (the
// players table itself stores names in upper-case; matching is case-insensitive).
const CORRECTIONS: Record<string, string> = {
  // typos
  "chris phleps": "Chris Phelps",
  "crag ford": "Craig Ford",
  "timothey miles": "Timothy Miles",
  "tim miles": "Timothy Miles",
  // nickname / given-name expansions verified against the roster
  "ash wyborn": "Ashley Wyborn",
  "cam burrage": "Cameron Burrage",
  "cam lucas": "Cameron Lucas",
  "damien billing": "Damian Billing",
  "dan lambert": "Daniel Lambert",
  "dave allen": "David Allen",
  "geoff buchholz": "Geoffrey Buchholz",
  "mitch felton": "Mitchell Felton",
  "mitch green": "Mitchell Green",
  "phil head": "Philip Head",
  "ray smedley": "Raymond Smedley",
  "wes naidoo": "Wesley Naidoo",
  "zac dreckow": "Zachary Dreckow",
};

// Names that are deliberately kept as free text (families / couples / non-roster).
const FREE_TEXT = new Set(
  [
    "Luke and Emma Barnes",
    "Head Family",
    "Jeffrey Family",
  ].map((s) => s.toLowerCase()),
);

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function seasonStartYear(label: string): number | null {
  const m = /^(\d{4})\s*\/\s*\d{2}/.exec(label.trim());
  return m ? Number(m[1]) : null;
}

type Winner = { awardKey: string; season: number; raw: string };

function splitNames(cell: string): string[] {
  return cell
    .split("/")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

function correct(name: string): string {
  return CORRECTIONS[norm(name)] ?? name;
}

async function main() {
  const buf = fs.readFileSync(FILE);
  const wb = XLSX.read(buf, { type: "buffer" });

  const rowsOf = (sheet: string): unknown[][] =>
    XLSX.utils.sheet_to_json(wb.Sheets[sheet], {
      header: 1,
      blankrows: true,
      defval: null,
    }) as unknown[][];

  const cell = (r: unknown[], i: number): string =>
    r[i] == null ? "" : String(r[i]).replace(/\s+/g, " ").trim();

  // Collect raw winners. First source for a (awardKey, season) wins, so blanks
  // in a higher-priority sheet fall through to the lower-priority one.
  const byKey = new Map<string, Winner[]>();
  const add = (awardKey: string, season: number, cellText: string) => {
    const key = `${awardKey}|${season}`;
    if (byKey.has(key)) return; // higher-priority source already filled this
    const names = splitNames(cellText);
    if (names.length === 0) return;
    byKey.set(
      key,
      names.map((raw) => ({ awardKey, season, raw })),
    );
  };

  // 1) Awards sheet (highest priority).
  {
    const rows = rowsOf("Awards");
    const headerIdx = rows.findIndex((r) => cell(r, 0) === "Season");
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const season = seasonStartYear(cell(rows[i], 0));
      if (season == null) continue;
      for (const [colStr, awardKey] of Object.entries(AWARDS_COLS)) {
        add(awardKey, season, cell(rows[i], Number(colStr)));
      }
    }
  }

  // 2) Grade Cricketers of the Year section.
  {
    const rows = rowsOf("Grade Records");
    const markerIdx = rows.findIndex((r) =>
      cell(r, 0).toUpperCase().startsWith("GRADE CRICKETERS"),
    );
    if (markerIdx >= 0) {
      const headerIdx = rows.findIndex(
        (r, idx) => idx > markerIdx && cell(r, 0) === "Season",
      );
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const season = seasonStartYear(cell(rows[i], 0));
        if (season == null) continue;
        for (const [colStr, awardKey] of Object.entries(CRICKETER_COLS)) {
          add(awardKey, season, cell(rows[i], Number(colStr)));
        }
      }
    }
  }

  // 3) Honour Board cricketer columns (lowest priority, dedup safety net).
  {
    const rows = rowsOf("Honour Board");
    const headerIdx = rows.findIndex((r) => cell(r, 0) === "Season");
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const season = seasonStartYear(cell(rows[i], 0));
      if (season == null) continue;
      add("burns-family-medal", season, cell(rows[i], 7));
      add("female-player-of-the-year", season, cell(rows[i], 8));
    }
  }

  // Build the player name index.
  const players = await db
    .select({
      id: playersTable.id,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
    })
    .from(playersTable);
  const byFullName = new Map<string, { id: number; name: string }[]>();
  const bySurname = new Map<string, { id: number; name: string; given: string }[]>();
  for (const p of players) {
    const full = `${p.givenName} ${p.surname}`.trim();
    const fk = norm(full);
    if (!byFullName.has(fk)) byFullName.set(fk, []);
    byFullName.get(fk)!.push({ id: p.id, name: full });
    const sk = norm(p.surname);
    if (!bySurname.has(sk)) bySurname.set(sk, []);
    bySurname.get(sk)!.push({ id: p.id, name: full, given: p.givenName });
  }

  type Resolved = {
    awardKey: string;
    season: number;
    raw: string;
    playerId: number | null;
    display: string;
    how: string;
  };
  const resolved: Resolved[] = [];

  const resolveName = (raw: string): { playerId: number | null; display: string; how: string } => {
    if (FREE_TEXT.has(norm(raw))) return { playerId: null, display: raw, how: "free-text" };
    const fixed = correct(raw);
    // Exact full-name match.
    const exact = byFullName.get(norm(fixed));
    if (exact && exact.length === 1) {
      return { playerId: exact[0].id, display: exact[0].name, how: "exact" };
    }
    // Initial form: "A. Surname" -> surname + first-initial.
    const im = /^([A-Za-z])\.?\s+(.+)$/.exec(fixed);
    if (im) {
      const initial = im[1].toLowerCase();
      const surname = im[2];
      const cands = bySurname.get(norm(surname)) ?? [];
      const matches = cands.filter((c) => c.given.toLowerCase().startsWith(initial));
      if (matches.length === 1) {
        return { playerId: matches[0].id, display: matches[0].name, how: "initial" };
      }
    }
    return { playerId: null, display: fixed, how: "free-text" };
  };

  for (const winners of byKey.values()) {
    for (const w of winners) {
      const r = resolveName(w.raw);
      resolved.push({ awardKey: w.awardKey, season: w.season, raw: w.raw, ...r });
    }
  }

  // Report.
  const linked = resolved.filter((r) => r.playerId != null);
  const free = resolved.filter((r) => r.playerId == null);
  console.log(`Parsed ${resolved.length} winner records across ${byKey.size} award-seasons.`);
  console.log(`  linked: ${linked.length}  free-text: ${free.length}`);
  const freeNames = [...new Set(free.map((r) => r.display))].sort();
  console.log(`  distinct free-text names (${freeNames.length}):`);
  for (const n of freeNames) console.log(`    - ${n}`);

  // Map award keys -> ids.
  const awardRows = await db
    .select({ id: awardsTable.id, key: awardsTable.key })
    .from(awardsTable);
  const idByKey = new Map(awardRows.map((a) => [a.key, a.id]));
  const missingAwards = [...new Set(resolved.map((r) => r.awardKey))].filter(
    (k) => !idByKey.has(k),
  );
  if (missingAwards.length > 0) {
    throw new Error(`Awards not seeded: ${missingAwards.join(", ")} (run seed-awards first)`);
  }

  if (DRY_RUN) {
    console.log("\nDRY_RUN=1 — no rows written.");
    return;
  }

  const awardIds = [...new Set(resolved.map((r) => idByKey.get(r.awardKey)!))];
  await db.delete(awardWinnersTable).where(inArray(awardWinnersTable.awardId, awardIds));

  // Group winners per (award, season) to assign displayOrder.
  const grouped = new Map<string, Resolved[]>();
  for (const r of resolved) {
    const k = `${r.awardKey}|${r.season}`;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(r);
  }
  const values: (typeof awardWinnersTable.$inferInsert)[] = [];
  for (const group of grouped.values()) {
    group.forEach((r, i) => {
      values.push({
        awardId: idByKey.get(r.awardKey)!,
        season: r.season,
        playerId: r.playerId,
        name: r.display,
        displayOrder: i,
        published: true,
      });
    });
  }
  for (let i = 0; i < values.length; i += 200) {
    await db.insert(awardWinnersTable).values(values.slice(i, i + 200));
  }
  console.log(`\nInserted ${values.length} winner rows for ${awardIds.length} awards.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
