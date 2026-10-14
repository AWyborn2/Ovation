// Platform grade decisions in the PlayHQ → central projector
// (schema/playhq_grade_decisions.ts, migration 0039).
//
// Real database, projecting AS the central_projector role. A competition the classifier can't
// place is skipped; a platform "map" decision projects it under the chosen grade (matched by the
// season-insensitive grade key, in SQL), an "ignore" decision skips it with a reason, and a
// database where the decisions table can't be read behaves exactly as before.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "@workspace/db";
import {
  closeCentralProjectorPool,
  getCentralProjectorPool,
  loadMatchIdsForGradeKey,
  projectToCentral,
} from "@workspace/db/playhq-ingest";

const SQL_DIR = path.resolve(__dirname, "../../../../scripts/sql");
const centralUrl = process.env.CENTRAL_DATABASE_URL!;
const admin = {
  query: (text: string, params?: unknown[]) => db.$client.query(text, params),
};

const CLUB_A = 9921;
const CLUB_B = 9922;
const ORG_A = randomUUID();
const ORG_B = randomUUID();
const SEASON = "Summer 2099/00";
const COMP = "Zz Social Shield Test";
const KEY = "zz social shield test";
const GRADE = randomUUID();
const JUNIOR_GRADE = randomUUID();
const MATCH = randomUUID();
const JUNIOR_MATCH = randomUUID();
const TEAM_A = randomUUID();
const TEAM_B = randomUUID();

let projector: ReturnType<typeof getCentralProjectorPool>;

function projectorUrl(): string {
  const u = new URL(centralUrl);
  u.username = "central_projector";
  u.password = "test";
  return u.toString();
}

const centralRow = async () =>
  (
    await admin.query(
      `select grade, home_club_id, away_club_id from central.matches where playhq_match_id = $1`,
      [MATCH],
    )
  ).rows[0] as { grade: string | null } | undefined;

const setDecision = (name: string, action: "map" | "ignore", centralGrade: string | null) =>
  admin.query(
    `insert into public.playhq_grade_decisions (grade_key, grade_name, action, central_grade)
     values ($1, $2, $3, $4)
     on conflict (grade_key) do update
       set grade_name = excluded.grade_name, action = excluded.action,
           central_grade = excluded.central_grade, set_at = now()`,
    [KEY, name, action, centralGrade],
  );

beforeAll(async () => {
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-schema.sql"), "utf8"));
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "central-projector.sql"), "utf8"));
  await admin.query(`alter role central_projector with password 'test'`);
  process.env.CENTRAL_PROJECTOR_DATABASE_URL = projectorUrl();
  process.env.CENTRAL_PROJECTOR_DB_SSL = "0";
  projector = getCentralProjectorPool();

  await admin.query(
    `insert into central.club_playhq_orgs (playhq_org_id, club_id, source) values ($1, $2, 'manual'), ($3, $4, 'manual')
     on conflict (playhq_org_id) do update set club_id = excluded.club_id`,
    [ORG_A, CLUB_A, ORG_B, CLUB_B],
  );
  await admin.query(
    `insert into playhq.grades (id, name, season_name, is_junior) values
       ($1, $3, $5, false), ($2, $4, $5, true)
     on conflict (id) do nothing`,
    [GRADE, JUNIOR_GRADE, `${COMP} 2099/00`, `${COMP} Under 16 2099/00`, SEASON],
  );
  const ins = (id: string, grade: string) =>
    admin.query(
      `insert into playhq.matches (id, grade_id, status, match_type, round_name, start_at, venue_name,
          surface_name, result_text, home_team_id, away_team_id, home_team_name, away_team_name,
          home_org_id, away_org_id, home_score, away_score, raw)
       values ($1, $2, 'COMPLETED', 'One Day', 'Round 1', '2099-10-03T23:30:00Z', 'Rec Reserve', 'Oval 1',
          'Club A won by 9 wickets', $3, $4, 'Club B Shield', 'Club A Shield', $5, $6, '97', '1-98', '{}')
       on conflict (id) do nothing`,
      [id, grade, TEAM_B, TEAM_A, ORG_B, ORG_A],
    );
  await ins(MATCH, GRADE);
  await ins(JUNIOR_MATCH, JUNIOR_GRADE);
});

afterEach(async () => {
  await admin.query(`delete from public.playhq_grade_decisions where grade_key = $1`, [KEY]);
  await admin.query(`grant select on public.playhq_grade_decisions to central_projector`);
  await admin.query(`delete from central.matches where playhq_match_id = any($1::text[])`, [
    [MATCH, JUNIOR_MATCH],
  ]);
});

afterAll(async () => {
  await closeCentralProjectorPool();
  await admin.query(`delete from central.club_playhq_orgs where playhq_org_id = any($1::text[])`, [
    [ORG_A, ORG_B],
  ]);
  await admin.query(`delete from playhq.matches where id = any($1::uuid[])`, [
    [MATCH, JUNIOR_MATCH],
  ]);
  await admin.query(`delete from playhq.grades where id = any($1::uuid[])`, [
    [GRADE, JUNIOR_GRADE],
  ]);
});

describe("an unrecognised competition", () => {
  it("is skipped, with the reason, until a decision is made", async () => {
    const s = await projectToCentral(projector, { matchIds: [MATCH] });
    expect(s.created + s.updated).toBe(0);
    expect(s.skipped).toEqual([
      expect.objectContaining({
        playhqMatchId: MATCH,
        reason: expect.stringMatching(/not projected/),
      }),
    ]);
    expect(await centralRow()).toBeUndefined();
  });
});

describe("a 'map' decision", () => {
  it("projects the competition under the chosen grade", async () => {
    await setDecision(COMP, "map", "Over 45s");
    const s = await projectToCentral(projector, { matchIds: [MATCH] });
    expect(s).toMatchObject({ created: 1, skipped: [] });
    expect((await centralRow())?.grade).toBe("Over 45s");
  });

  it("applies whatever season the competition is named for", async () => {
    // The decision was saved from last season's name; this season's grade has another year in it.
    await setDecision(`${COMP} 2098/99`, "map", "Over 50s");
    const s = await projectToCentral(projector, { matchIds: [MATCH] });
    expect(s.created).toBe(1);
    expect((await centralRow())?.grade).toBe("Over 50s");
  });

  it("re-projects an already-projected match under a changed decision", async () => {
    await setDecision(COMP, "map", "Over 45s");
    await projectToCentral(projector, { matchIds: [MATCH] });
    await setDecision(COMP, "map", "Over 50s");
    const s = await projectToCentral(projector, { matchIds: [MATCH] });
    expect(s).toMatchObject({ created: 0, updated: 1 });
    expect((await centralRow())?.grade).toBe("Over 50s");
  });
});

describe("an 'ignore' decision", () => {
  it("skips the competition and says it was ignored", async () => {
    await setDecision(COMP, "ignore", null);
    const s = await projectToCentral(projector, { matchIds: [MATCH] });
    expect(s.created + s.updated).toBe(0);
    expect(s.skipped).toEqual([
      expect.objectContaining({
        playhqMatchId: MATCH,
        reason: expect.stringMatching(/ignored by platform decision/),
      }),
    ]);
    expect(await centralRow()).toBeUndefined();
  });
});

describe("when the decisions table can't be read", () => {
  it("projects exactly as before instead of failing every match", async () => {
    await setDecision(COMP, "map", "Over 45s");
    await admin.query(`revoke select on public.playhq_grade_decisions from central_projector`);
    const s = await projectToCentral(projector, { matchIds: [MATCH] });
    // No decision is visible, so it is the unrecognised competition it always was.
    expect(s.created + s.updated).toBe(0);
    expect(s.skipped).toEqual([
      expect.objectContaining({ reason: expect.stringMatching(/not projected/) }),
    ]);
  });
});

describe("loadMatchIdsForGradeKey", () => {
  it("finds a competition's senior matches by its season-insensitive key", async () => {
    expect(await loadMatchIdsForGradeKey(projector, KEY)).toEqual([MATCH]);
  });

  it("never returns a junior competition's matches", async () => {
    expect(await loadMatchIdsForGradeKey(projector, `${KEY} under 16`)).toEqual([]);
  });
});
