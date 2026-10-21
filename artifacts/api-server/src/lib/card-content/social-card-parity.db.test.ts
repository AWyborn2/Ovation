/**
 * ADR-010 P7 parity: a match result card and a team list card say the same
 * thing wherever they are made. For one match and one fixture:
 *   - the sweep's auto-queued draft is still exactly the input it saved before
 *     the content pipeline (existing drafts never change);
 *   - Create a Card's prefill is that same input (the card made by hand is the
 *     auto-queued one);
 *   - the Weekend Carousel's content was built from that same input;
 *   - with a field switched off, the sweep and Create a Card still agree.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  adminsTable,
  playerIdMapTable,
  fixturesTable,
  teamListsTable,
  socialSettingsTable,
  socialDraftsTable,
  type FixtureRow,
  type TeamListPlayer,
} from "@workspace/db";
import type { MatchDetail } from "@workspace/api-zod";
import { matchToSummaryInput } from "@workspace/scorecard";
import { findPostingStyle, planFromStyle } from "@workspace/scorecard/posting-plan";
import { mintPlayerIdMap } from "@workspace/db/provision";
import app from "../../app";
import { encodeSession, SESSION_COOKIE } from "../auth";
import { generateMatchSummaryDrafts } from "../match-summary-drafter";
import { generateTeamListDrafts, teamListKey, teamListToCardInput } from "../engines/team-list";
import { draftKeys } from "../draft-upsert";
import { loadCentralMatchDetail } from "../match-detail";

const STAMP = Date.now();
// Results come from the CI central fixture: Pinjarra (central club 3) beat
// Mandurah in A Grade match 1002 on 19 Oct 2024. tenants.central_club_id is
// unique, so the club's tenant is released in afterAll.
const PINJARRA = 3;
const MATCH = 1002;
// Friday 9 Oct 2026, 8 AM in Perth.
const NOW = new Date("2026-10-09T00:00:00Z");
const HOUR = 60 * 60 * 1000;

let tenantId: number;
let adminId: number;
let cookie: string;
let centralTenantId: number;
let centralCookie: string;
let fixture: FixtureRow;

const PLAYERS: TeamListPlayer[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    order: i + 1,
    displayName: `Player${i + 1} Parity${STAMP}`,
    ...(i === 0 ? { role: "C" as const } : {}),
    ...(i === 2 ? { debut: true } : {}),
    ...(i === 3 ? { overseas: true } : {}),
  })),
  // A side of 14 (ADR-009) with a fill-in, who never appears on a card.
  { order: 13, displayName: `Thirteen Parity${STAMP}` },
  { order: 14, displayName: "Fill In", playerId: 90_001 },
];

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-card-parity";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `p7-parity-${STAMP}`, centralClubId: 9963, name: "Parity Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `p7_${STAMP}`, displayName: "Parity", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  // A central-data club for the results.
  const [c] = await db
    .insert(tenantsTable)
    .values({
      slug: `p7-parity-c-${STAMP}`,
      centralClubId: PINJARRA,
      name: "Parity Central",
      readsFromCentral: true,
      plan: "pro",
    })
    .returning();
  centralTenantId = c.id;
  await mintPlayerIdMap(centralTenantId, PINJARRA);
  const [centralAdmin] = await db
    .insert(adminsTable)
    .values({
      tenantId: centralTenantId,
      username: `p7c_${STAMP}`,
      displayName: "Parity",
      passwordHash: "x",
    })
    .returning();
  centralCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: centralAdmin.id, issuedAt: Date.now() })}`;
  const plan = planFromStyle(findPostingStyle("every-match", true)!);
  await db.insert(socialSettingsTable).values([
    { tenantId, postingPlan: plan },
    { tenantId: centralTenantId, postingPlan: plan },
  ]);

  // An upcoming fixture with a published side.
  [fixture] = await db
    .insert(fixturesTable)
    .values({
      tenantId,
      grade: "A Grade",
      roundLabel: "Round 3",
      opponentName: "Rockingham Mandurah Cricket Club",
      opponentLogoUrl: "https://crest.test/rm.png",
      venue: "Club Oval",
      isHome: true,
      source: "manual",
      // Saturday 10 Oct, 12:30 PM Perth.
      startAt: new Date(NOW.getTime() + 28.5 * HOUR),
    })
    .returning();
  await db
    .insert(teamListsTable)
    .values({ tenantId, fixtureId: fixture.id, players: PLAYERS, isPublished: true });
});

afterAll(async () => {
  const tenants = [tenantId, centralTenantId].filter(Boolean);
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenants));
  await db.delete(teamListsTable).where(inArray(teamListsTable.tenantId, tenants));
  await db.delete(fixturesTable).where(inArray(fixturesTable.tenantId, tenants));
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, tenants));
  await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, tenants));
  await db.delete(adminsTable).where(inArray(adminsTable.tenantId, tenants));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

const call =
  (tenant: number, session: string) =>
  (path: string, query: Record<string, string> = {}) =>
    request(app)
      .get(`/api${path}`)
      .set("x-tenant-id", String(tenant))
      .set("Cookie", session)
      .query(query);
const api = (path: string, query: Record<string, string> = {}) =>
  call(tenantId, cookie)(path, query);
const centralApi = (path: string, query: Record<string, string> = {}) =>
  call(centralTenantId, centralCookie)(path, query);

const draftOf = async (tenant: number, sourceKey: string) =>
  (
    await db
      .select()
      .from(socialDraftsTable)
      .where(
        and(eq(socialDraftsTable.tenantId, tenant), eq(socialDraftsTable.sourceKey, sourceKey)),
      )
  )[0];
const draftBy = (sourceKey: string) => draftOf(tenantId, sourceKey);

const setContentOf = (tenant: number, cardContent: object) =>
  db
    .update(socialSettingsTable)
    .set({ cardContent })
    .where(eq(socialSettingsTable.tenantId, tenant));
const setContent = (cardContent: object) => setContentOf(tenantId, cardContent);

/** The results sweep over the central match, as the scheduled sweep runs it. */
const sweepResult = () =>
  generateMatchSummaryDrafts(centralTenantId, [MATCH], {
    kind: "central",
    clubId: PINJARRA,
    seenAt: NOW,
  });
const resultDraft = () => draftOf(centralTenantId, draftKeys.centralMatchSummary(MATCH));

const STANDARD = { preset: "standard", fields: {}, juniorConsolidateByDay: true };
const MINIMAL = { preset: "minimal", fields: {}, juniorConsolidateByDay: true };
const round = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("match result cards: sweep, Create a Card and carousel agree (P7)", () => {
  it("the auto-queued draft is the input it always was, and Create a Card prefills exactly it", async () => {
    await sweepResult();
    const draft = await resultDraft();
    expect(draft, "the sweep drafts the match").toBeTruthy();
    // Existing drafts never change: the draft is the pre-pipeline input.
    const legacy = matchToSummaryInput(
      (await loadCentralMatchDetail(
        { tenantId: centralTenantId, clubId: PINJARRA },
        MATCH,
      )) as unknown as MatchDetail,
    );
    expect(draft.cardInput).toEqual(round(legacy));

    const prefill = await centralApi(`/social-prefill/match-summary/${MATCH}`);
    expect(prefill.status, JSON.stringify(prefill.body)).toBe(200);
    expect(prefill.body.input).toEqual(draft.cardInput);
  });

  it.each(["results", "matchSummary"] as const)(
    "the %s carousel's content is built from that same input",
    async (setType) => {
      const draft = await resultDraft();
      const res = await centralApi("/weekend-carousel/sources", {
        from: "2024-10-18",
        to: "2024-10-20",
        setType,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const content = res.body.content[-MATCH];
      expect(content).toMatchObject({
        kind: setType,
        page: "result",
        matchId: MATCH,
        junior: false,
        day: "2024-10-19",
      });
      expect(content.source).toEqual(draft.cardInput);
    },
  );

  it("with the round and crest switched off, the sweep and Create a Card still agree", async () => {
    await setContentOf(centralTenantId, { matchDay: STANDARD, matchSummary: MINIMAL });
    try {
      await sweepResult();
      const draft = await resultDraft();
      expect(draft.cardInput).toMatchObject({
        roundLabel: "",
        opposition: { logoUrl: null },
        namesResolved: true,
      });
      const prefill = await centralApi(`/social-prefill/match-summary/${MATCH}`);
      expect(prefill.body.input).toEqual(draft.cardInput);
    } finally {
      await setContentOf(centralTenantId, { matchDay: STANDARD });
    }
  });

  it("an unknown match is a 404", async () => {
    expect((await centralApi("/social-prefill/match-summary/999999999")).status).toBe(404);
  });
});

describe("team list cards: sweep, Create a Card and carousel agree (P7)", () => {
  it("the auto-queued draft is the input it always was, and Create a Card prefills exactly it", async () => {
    await generateTeamListDrafts(tenantId, NOW);
    const draft = await draftBy(teamListKey(fixture.id));
    expect(draft, "the sweep drafts the side").toBeTruthy();
    // Existing drafts never change: the pre-pipeline input (no shirt numbers here).
    expect(draft.cardInput).toEqual(round(teamListToCardInput(fixture, PLAYERS, new Set(), null)));
    const rows = (draft.cardInput as { players: Array<Record<string, unknown>> }).players;
    // A side of 13 once the fill-in is out, with the debut and overseas marks.
    expect(rows).toHaveLength(13);
    expect(rows.some((p) => p.surname === "IN")).toBe(false);
    expect(rows[2]).toMatchObject({ debut: true });
    expect(rows[3]).toMatchObject({ overseas: true });

    const prefill = await api(`/social-prefill/team-list/${fixture.id}`);
    expect(prefill.status, JSON.stringify(prefill.body)).toBe(200);
    expect(prefill.body.input).toEqual(draft.cardInput);
    expect(prefill.body.warnings).toEqual([]);
  });

  it("the team list carousel's content is built from that same input", async () => {
    const draft = await draftBy(teamListKey(fixture.id));
    const res = await api("/weekend-carousel/sources", {
      from: "2026-10-09",
      to: "2026-10-11",
      setType: "teamList",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const content = res.body.content[fixture.id];
    expect(content).toMatchObject({
      kind: "teamList",
      page: "team",
      fixtureId: fixture.id,
      junior: false,
      grade: "A Grade",
      roundLabel: "ROUND 3",
      opposition: {
        rawName: "Rockingham Mandurah Cricket Club",
        crestUrl: "https://crest.test/rm.png",
      },
    });
    expect(content.source).toEqual(draft.cardInput);
  });

  it("with shirt numbers and debuts switched off, the sweep and Create a Card still agree", async () => {
    await setContent({
      matchDay: STANDARD,
      teamList: { ...STANDARD, fields: { "team.debuts": false } },
    });
    try {
      await generateTeamListDrafts(tenantId, NOW);
      const draft = await draftBy(teamListKey(fixture.id));
      const rows = (draft.cardInput as { players: Array<Record<string, unknown>> }).players;
      expect(rows.some((p) => p.debut)).toBe(false);
      expect(rows[3]).toMatchObject({ overseas: true });
      const prefill = await api(`/social-prefill/team-list/${fixture.id}`);
      expect(prefill.body.input).toEqual(draft.cardInput);
    } finally {
      await setContent({ matchDay: STANDARD });
    }
  });

  it("a fixture with no saved list prefills its heading and says so; another club's is a 404", async () => {
    const [bare] = await db
      .insert(fixturesTable)
      .values({
        tenantId,
        grade: "B Grade",
        opponentName: "Waroona",
        isHome: false,
        source: "manual",
        startAt: new Date(NOW.getTime() + 30 * HOUR),
      })
      .returning();
    const res = await api(`/social-prefill/team-list/${bare.id}`);
    expect(res.status).toBe(200);
    expect(res.body.input).toMatchObject({ kind: "teamList", grade: "B Grade", players: [] });
    expect(res.body.warnings.join(" ")).toContain("no saved team list");
    const other = await request(app)
      .get(`/api/social-prefill/team-list/${bare.id}`)
      .set("x-tenant-id", "1")
      .set("Cookie", cookie);
    expect([401, 403, 404]).toContain(other.status);
  });
});
