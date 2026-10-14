import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guard: every junior-participant query in the API is tenant-scoped (junior PlayHQ
 * sync plan U3; KTD8, R14, AE6).
 *
 * `junior_participants` is keyed `(tenant_id, participant_id)`, so a participant id
 * alone matches one row per club. This test scans the API source text (no database)
 * and fails on any query that:
 *
 *   1. joins `juniorParticipantsTable` without `juniorParticipantJoin(...)` (which
 *      matches tenant AND participant id);
 *   2. reads, updates, deletes or inserts `juniorParticipantsTable` without a tenant
 *      condition (`juniorParticipantsTable.tenantId` or `juniorParticipantKey(...)`);
 *   3. runs raw SQL naming `junior_participants` without binding THAT reference's own
 *      `tenant_id` to a value (`p.tenant_id = ${tenantId}` for `junior_participants p`;
 *      a correlation such as `m.tenant_id = p.tenant_id` does not count, since it holds
 *      for every club), or selects a participant-carrying junior table by
 *      `participant_id` without a `tenant_id` predicate;
 *   4. selects rows of a participant-carrying junior table (lines, premiership players,
 *      office bearers, shirt numbers, merges, corrections) by participant id without a
 *      tenant scope — that table's own `tenantId`, the tenant's matches / premierships,
 *      or a match already resolved in the tenant (`.matchId, match.id`).
 *
 * A query that is safe for a reason the scanner cannot see goes in `ALLOWLIST` with
 * the reason. It also checks the one-off juniors loader (`scripts/sql/juniors-etl.sql`)
 * stays inside tenant 1 and away from the sync id band (KTD6, R12, AE2).
 */

const SRC_ROOT = join(__dirname, "..");
const REPO_ROOT = join(SRC_ROOT, "..", "..", "..");
const ETL_PATH = join(REPO_ROOT, "scripts", "sql", "juniors-etl.sql");

/** Known-safe sites the scanner cannot prove: `file` (relative to src) + a snippet. */
const ALLOWLIST: { file: string; contains: string; reason: string }[] = [];

const PARTICIPANT_TABLES = [
  "juniorMatchBattingTable",
  "juniorMatchBowlingTable",
  "juniorMatchRostersTable",
  "juniorPremiershipPlayersTable",
  "juniorOfficeBearersTable",
  "juniorShirtNumbersTable",
  "juniorParticipantMergesTable",
  "juniorStatCorrectionsTable",
];

const RAW_PARTICIPANT_TABLES =
  /\bjunior_(match_batting|match_bowling|match_rosters|premiership_players|office_bearers|shirt_numbers|participant_merges|stat_corrections)\b/;

/**
 * Rule 4's accepted scopes for `table`: its own tenant column, a joined junior match or
 * premiership's tenant column (`ofTenant(…)` is junior-leaderboards' wrapper for the match
 * one), a tenant-checked participant join, or a tenant-resolved id set. Another table's
 * `tenantId` (or a bare `tenantId` variable) is not a scope.
 */
const lineScopeMarker = (table: string) =>
  new RegExp(
    String.raw`${table}\.tenantId\b|juniorMatchesTable\.tenantId\b|juniorPremiershipsTable\.tenantId\b|\bofTenant\(|juniorParticipantJoin\(|tenantJuniorMatchIds\(|tenantJuniorPremiershipIds\(|\.matchId,\s*match\.id\b`,
  );

/** Words that can follow a table name where an alias would otherwise stand. */
const SQL_KEYWORDS = new Set([
  "where",
  "set",
  "on",
  "join",
  "inner",
  "left",
  "right",
  "full",
  "cross",
  "using",
  "values",
  "select",
  "group",
  "order",
  "limit",
  "union",
  "returning",
  "and",
  "or",
]);

/**
 * Whether every `junior_participants` reference in a raw SQL body binds its own tenant to a
 * value: `<alias>.tenant_id = ${…}` for an aliased reference, `tenant_id = ${…}` (or
 * `junior_participants.tenant_id = ${…}`) for an unaliased one, and the `tenant_id` column
 * for an insert. A correlation to another table's tenant does not count.
 */
function participantsTenantBound(body: string): boolean {
  const ref = /\bjunior_participants\b(?:\s+(?:as\s+)?([a-z_]\w*))?/gi;
  let m: RegExpExecArray | null;
  while ((m = ref.exec(body))) {
    if (/\binsert\s+into\s*$/i.test(body.slice(0, m.index))) {
      if (!/\btenant_id\b/.test(body)) return false;
      continue;
    }
    const alias = m[1] && !SQL_KEYWORDS.has(m[1].toLowerCase()) ? m[1] : null;
    const col = alias
      ? String.raw`\b${alias}\.tenant_id`
      : String.raw`(?:(?<![\w.])|\bjunior_participants\.)tenant_id`;
    const bound = new RegExp(String.raw`${col}\s*=\s*(?:any\s*\(\s*)?\$\{`, "i");
    if (!bound.test(body)) return false;
  }
  return true;
}

type Violation = { line: number; rule: string; snippet: string };

/** Drop `//` and block comments so prose mentioning a table is never scanned. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(
      /(^|[^:"'`])\/\/.*$/gm,
      (m, lead: string) => lead + " ".repeat(m.length - lead.length),
    );
}

/** Index just past the template literal whose opening backtick is at `open`. */
function skipTemplate(text: string, open: number): number {
  let i = open + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") return i + 1;
    if (c === "$" && text[i + 1] === "{") {
      i = skipExpression(text, i + 2);
      continue;
    }
    i++;
  }
  return i;
}

/** Index just past the `}` that closes a `${` expression starting at `start`. */
function skipExpression(text: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const c = text[i];
    if (c === "`") {
      i = skipTemplate(text, i);
      continue;
    }
    if (c === "'" || c === '"') {
      i = skipQuoted(text, i);
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") {
      if (depth === 0) return i + 1;
      depth--;
    }
    i++;
  }
  return i;
}

function skipQuoted(text: string, open: number): number {
  const q = text[open];
  let i = open + 1;
  while (i < text.length && text[i] !== q && text[i] !== "\n") {
    if (text[i] === "\\") i++;
    i++;
  }
  return i + 1;
}

/**
 * The rest of the query chain starting at `start`: up to the `;` or `,` that ends it
 * at the same nesting level, or the bracket that closes the enclosing call.
 */
function chainWindow(text: string, start: number): string {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const c = text[i];
    if (c === "`") {
      i = skipTemplate(text, i);
      continue;
    }
    if (c === "'" || c === '"') {
      i = skipQuoted(text, i);
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) break;
      depth--;
    } else if ((c === ";" || c === ",") && depth === 0) break;
    i++;
  }
  return text.slice(start, i);
}

/** Every `sql\`...\`` template body with its start index. */
function sqlTemplates(text: string): { body: string; index: number }[] {
  const out: { body: string; index: number }[] = [];
  const re = /\bsql`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const open = m.index + 3;
    const end = skipTemplate(text, open);
    out.push({ body: text.slice(open + 1, end - 1), index: m.index });
  }
  return out;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 140);

/** Every unguarded junior-participant query in one source file's text. */
function scanSource(source: string): Violation[] {
  const text = stripComments(source);
  const out: Violation[] = [];
  const add = (index: number, rule: string, snippet: string) =>
    out.push({ line: lineOf(text, index), rule, snippet: oneLine(snippet) });

  // Rule 1: joins to participants go through juniorParticipantJoin.
  const joinRe = /\.(innerJoin|leftJoin|rightJoin|fullJoin)\(\s*juniorParticipantsTable\s*,\s*/g;
  let m: RegExpExecArray | null;
  while ((m = joinRe.exec(text))) {
    const after = text.slice(m.index + m[0].length);
    if (!after.startsWith("juniorParticipantJoin(")) {
      add(m.index, "participant join without tenant", chainWindow(text, m.index));
    }
  }

  // Rule 2: direct reads / writes of participants carry a tenant condition.
  const directRe = /\.(from|update|delete|insert)\(\s*juniorParticipantsTable\s*\)/g;
  while ((m = directRe.exec(text))) {
    const window = chainWindow(text, m.index);
    const guarded =
      m[1] === "insert"
        ? /tenantId/.test(window)
        : /juniorParticipantsTable\.tenantId|juniorParticipantKey\(/.test(window);
    if (!guarded) add(m.index, `participant ${m[1]} without tenant`, window);
  }

  // Rule 3: raw SQL.
  for (const t of sqlTemplates(text)) {
    if (/\bjunior_participants\b/.test(t.body)) {
      if (!participantsTenantBound(t.body))
        add(t.index, "raw junior SQL without tenant_id", t.body);
    } else if (
      RAW_PARTICIPANT_TABLES.test(t.body) &&
      /\bparticipant_id\b/.test(t.body) &&
      !/\btenant_id\b/.test(t.body)
    ) {
      add(t.index, "raw junior SQL without tenant_id", t.body);
    }
  }

  // Rule 4: participant-carrying tables selected by participant id.
  for (const table of PARTICIPANT_TABLES) {
    const re = new RegExp(`\\.(from|update|delete)\\(\\s*${table}\\s*\\)`, "g");
    const byParticipant = new RegExp(
      `${table}\\.(participantId|duplicateParticipantId|keeperParticipantId)\\b`,
    );
    while ((m = re.exec(text))) {
      const window = chainWindow(text, m.index);
      if (byParticipant.test(window) && !lineScopeMarker(table).test(window)) {
        add(m.index, `${table} by participant without tenant scope`, window);
      }
    }
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules" || name === "generated") continue;
      out.push(...sourceFiles(path));
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts")) {
      out.push(path);
    }
  }
  return out;
}

const JUNIOR_TOKEN =
  /juniorParticipantsTable|junior_participants|juniorMatch(Batting|Bowling|Rosters)Table|juniorPremiershipPlayersTable|juniorParticipantMergesTable|juniorShirtNumbersTable|juniorStatCorrectionsTable|juniorOfficeBearersTable|junior_match_|junior_premiership_players/;

// ---------------------------------------------------------------------------
// The one-off loader (scripts/sql/juniors-etl.sql)
// ---------------------------------------------------------------------------

/** The ETL's top-level statements, with comments and `$tag$` bodies blanked. */
function sqlStatements(sqlText: string): string[] {
  const noComments = sqlText.replace(/--.*$/gm, "");
  const noBodies = noComments.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "$$body$$");
  return noBodies
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Loader statements that write a public junior table. */
function etlWrites(sqlText: string): string[] {
  return sqlStatements(sqlText).filter((s) =>
    /^(DELETE FROM|UPDATE|INSERT INTO) public\.junior_\w+/i.test(s),
  );
}

/** Loader writes without a tenant-1 scope (directly, or via a loader-scope temp table). */
function unscopedEtlWrites(sqlText: string): string[] {
  return etlWrites(sqlText).filter((s) => !/\btenant_id\s*=\s*1\b|\b_jl_\w+|\b_js_\w+/.test(s));
}

describe("junior participant queries are tenant-scoped (scanner self-test)", () => {
  it("flags a participant join on participant id alone", () => {
    const v = scanSource(
      `db.select().from(juniorMatchBattingTable).innerJoin(juniorParticipantsTable, eq(juniorParticipantsTable.participantId, juniorMatchBattingTable.participantId)).where(x);`,
    );
    expect(v.map((x) => x.rule)).toContain("participant join without tenant");
  });

  it("accepts a join through juniorParticipantJoin", () => {
    expect(
      scanSource(
        `db.select().from(juniorMatchBattingTable).innerJoin(juniorParticipantsTable, juniorParticipantJoin(juniorMatchBattingTable.participantId, tenantId)).where(x);`,
      ),
    ).toEqual([]);
  });

  it("flags an update keyed on participant id alone, accepts a tenant-keyed one", () => {
    expect(
      scanSource(
        `await tx.update(juniorParticipantsTable).set(set).where(eq(juniorParticipantsTable.participantId, id));`,
      ).map((x) => x.rule),
    ).toEqual(["participant update without tenant"]);
    expect(
      scanSource(
        `await tx.update(juniorParticipantsTable).set(set).where(juniorParticipantKey(tenantId, id));`,
      ),
    ).toEqual([]);
  });

  it("does not let a later statement's tenant condition cover an earlier one", () => {
    const v = scanSource(
      `await tx.delete(juniorParticipantsTable).where(eq(juniorParticipantsTable.participantId, id));\nawait tx.select().from(juniorParticipantsTable).where(eq(juniorParticipantsTable.tenantId, t));`,
    );
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(1);
  });

  it("flags raw SQL on participants or lines-by-participant without tenant_id", () => {
    expect(
      scanSource(
        "await tx.execute(sql`UPDATE junior_participants p SET x = 1 WHERE p.participant_id = ${id}`);",
      ),
    ).toHaveLength(1);
    expect(
      scanSource(
        "await tx.execute(sql`DELETE FROM junior_match_rosters a USING junior_match_rosters b WHERE a.participant_id = ${k}`);",
      ),
    ).toHaveLength(1);
    expect(
      scanSource(
        "await tx.execute(sql`DELETE FROM junior_match_rosters a USING junior_matches m WHERE m.tenant_id = ${t} AND a.participant_id = ${k}`);",
      ),
    ).toEqual([]);
  });

  it("flags raw participant SQL whose only tenant_id is a correlation (testing review P2)", () => {
    // The mutant of recomputeParticipantMetadata with its final tenant predicate removed:
    // its sub-selects still say `m.tenant_id = p.tenant_id`, which holds for every club.
    const mutant =
      "await tx.execute(sql`UPDATE junior_participants p SET scorecard_lines = (SELECT count(*) FROM junior_match_batting b JOIN junior_matches m ON m.id = b.match_id AND m.tenant_id = p.tenant_id WHERE b.participant_id = p.participant_id) WHERE p.participant_id = ${participantId}`);";
    expect(scanSource(mutant).map((x) => x.rule)).toEqual(["raw junior SQL without tenant_id"]);
    const fixed = mutant.replace(
      "WHERE p.participant_id",
      "WHERE p.tenant_id = ${tenantId} AND p.participant_id",
    );
    expect(scanSource(fixed)).toEqual([]);
  });

  it("the real recomputeParticipantMetadata passes, and fails once its tenant predicate is cut", () => {
    const source = readFileSync(join(SRC_ROOT, "lib", "junior-admin-helpers.ts"), "utf8");
    expect(scanSource(source)).toEqual([]);
    const predicate = /p\.tenant_id\s*=\s*\$\{tenantId\}\s*AND\s*/i;
    expect(source).toMatch(predicate);
    expect(scanSource(source.replace(predicate, "")).map((x) => x.rule)).toContain(
      "raw junior SQL without tenant_id",
    );
  });

  it("checks every participants reference in a raw statement, aliased or not", () => {
    expect(
      scanSource(
        "sql`EXISTS (SELECT 1 FROM junior_participants WHERE tenant_id = ${tenantId} AND senior_player_id = ${id})`;",
      ),
    ).toEqual([]);
    expect(
      scanSource(
        "sql`select 1 from junior_participants k where k.tenant_id = ${t} and exists (select 1 from junior_participants j where j.participant_id = k.participant_id)`;",
      ),
    ).toHaveLength(1);
    expect(
      scanSource(
        "sql`insert into junior_participants (tenant_id, participant_id) values (${t}, ${id})`;",
      ),
    ).toEqual([]);
  });

  it("does not accept another table's tenantId as a line table's scope", () => {
    // testing review P2: any `tenantId` token used to satisfy rule 4.
    expect(
      scanSource(
        `await tx.select().from(juniorParticipantMergesTable).where(and(eq(juniorParticipantMergesTable.duplicateParticipantId, d), eq(otherTable.tenantId, tenantId)));`,
      ),
    ).toHaveLength(1);
    expect(
      scanSource(
        `await tx.select().from(juniorParticipantMergesTable).where(and(eq(juniorParticipantMergesTable.tenantId, tenantId), eq(juniorParticipantMergesTable.duplicateParticipantId, d)));`,
      ),
    ).toEqual([]);
  });

  it("flags line rows selected by participant without a tenant scope", () => {
    expect(
      scanSource(
        `await tx.update(juniorMatchBattingTable).set({ participantId: k }).where(eq(juniorMatchBattingTable.participantId, d));`,
      ),
    ).toHaveLength(1);
    expect(
      scanSource(
        `await tx.update(juniorMatchBattingTable).set({ participantId: k }).where(and(inArray(juniorMatchBattingTable.matchId, tenantJuniorMatchIds(tenantId)), eq(juniorMatchBattingTable.participantId, d)));`,
      ),
    ).toEqual([]);
  });

  it("ignores tables named in comments", () => {
    expect(
      scanSource(
        `// .update(juniorParticipantsTable).where(eq(juniorParticipantsTable.participantId, x))\n`,
      ),
    ).toEqual([]);
  });

  it("flags an unscoped loader write and accepts scoped ones", () => {
    const etl = `
      DELETE FROM public.junior_matches;
      DELETE FROM public.junior_matches WHERE id IN (SELECT id FROM _jl_matches);
      UPDATE public.junior_participants p SET x = 1 WHERE p.tenant_id = 1;
      DO $$ BEGIN DELETE FROM public.junior_matches; END $$;
    `;
    expect(unscopedEtlWrites(etl)).toEqual(["DELETE FROM public.junior_matches"]);
  });
});

describe("junior participant queries are tenant-scoped (API source)", () => {
  it("every junior participant query in the API carries a tenant condition", () => {
    const violations: string[] = [];
    for (const path of sourceFiles(SRC_ROOT)) {
      const source = readFileSync(path, "utf8");
      if (!JUNIOR_TOKEN.test(source)) continue;
      const file = relative(SRC_ROOT, path).replace(/\\/g, "/");
      for (const v of scanSource(source)) {
        const allowed = ALLOWLIST.some((a) => a.file === file && v.snippet.includes(a.contains));
        if (!allowed) violations.push(`${file}:${v.line} ${v.rule}: ${v.snippet}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("scans the files the plan names", () => {
    const scanned = sourceFiles(SRC_ROOT)
      .filter((p) => JUNIOR_TOKEN.test(readFileSync(p, "utf8")))
      .map((p) => relative(SRC_ROOT, p).replace(/\\/g, "/"));
    for (const f of [
      "lib/junior-helpers.ts",
      "lib/junior-leaderboards.ts",
      "lib/junior-admin-helpers.ts",
      "lib/junior-shirt-numbers.ts",
      "lib/match-summary-drafter.ts",
      "routes/juniors-players.ts",
      "routes/juniors-leaderboards.ts",
      "routes/juniors-admin-participants.ts",
      "routes/juniors-admin-corrections.ts",
      "routes/players.ts",
    ]) {
      expect(scanned).toContain(f);
    }
  });
});

describe("the one-off juniors loader stays in its lane (KTD6, AE2)", () => {
  const etl = readFileSync(ETL_PATH, "utf8");

  it("scopes every write to a public junior table to tenant 1", () => {
    // Not vacuous: the loader writes the junior tables dozens of times.
    expect(etlWrites(etl).length).toBeGreaterThan(30);
    expect(unscopedEtlWrites(etl)).toEqual([]);
  });

  it("never wholesale-deletes participants; only merged-away duplicates are removed", () => {
    const deletes = sqlStatements(etl).filter((s) =>
      /^DELETE FROM public\.junior_participants\b/i.test(s),
    );
    for (const d of deletes) expect(d).toMatch(/_jpm/);
  });

  it("upserts participants without touching admin-owned columns", () => {
    const upsert = sqlStatements(etl).find((s) =>
      /^INSERT INTO public\.junior_participants\b/i.test(s),
    );
    expect(upsert).toBeDefined();
    expect(upsert).toMatch(/ON CONFLICT \(tenant_id, participant_id\) DO UPDATE/i);
    const setClause = upsert!.slice(upsert!.search(/DO UPDATE/i));
    expect(setClause).not.toMatch(/privacy_override|senior_player_id/);
  });

  it("refuses to run over the sync id band and limits itself to seasons before 2026", () => {
    expect(etl).toMatch(/RAISE EXCEPTION/);
    expect(etl).toMatch(/200000000/);
    expect(etl).toMatch(/2026/);
  });
});
