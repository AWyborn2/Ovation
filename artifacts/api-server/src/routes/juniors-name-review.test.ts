import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  tenantsTable,
  juniorParticipantsTable,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchRostersTable,
  juniorStatCorrectionsTable,
  juniorPremiershipsTable,
  juniorPremiershipPlayersTable,
  juniorMatchDisplaySettingsTable,
  juniorParticipantMergesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { classifyJuniorName, isExpandedJuniorName } from "../lib/junior-name-review";
import { ListJuniorNameReviewResponse } from "@workspace/api-zod";
import type { z } from "zod";
type Review = z.infer<typeof ListJuniorNameReviewResponse>[number];

const evidence = (name: string) => ({
  source: "roster" as const,
  sourceId: 1,
  name,
  season: "2025/26",
  team: "Blue",
});
describe("conservative junior name candidates", () => {
  it("accepts compound names but not initials or placeholders", () => {
    for (const n of ["Alexandra Jane de la Cruz", "Jean-Luc O’Neill", "Mary Ann Smith-Jones"])
      expect(isExpandedJuniorName(n)).toBe(true);
    for (const n of [
      "A Smith",
      "A. Smith",
      "Private Player",
      "Unknown Person",
      "Alex",
      "Alex S.",
      "Alex 123",
    ])
      expect(isExpandedJuniorName(n)).toBe(false);
  });
  it("normalises only whitespace/case and leaves conflicting identities for review", () => {
    expect(
      classifyJuniorName("A Smith", [evidence("  Alex   Smith "), evidence("alex smith")], false)
        .status,
    ).toBe("suggested");
    expect(
      classifyJuniorName("A Smith", [evidence("Alex Smith"), evidence("Andrew Smith")], false)
        .status,
    ).toBe("conflicting");
    expect(
      classifyJuniorName("A Smith", [evidence("Alex Smith"), evidence("B Smith")], false).status,
    ).toBe("identity_review");
    expect(classifyJuniorName("A Smith", [], false).status).toBe("missing");
    expect(classifyJuniorName("A Smith", [evidence("A. Smith")], false).status).toBe("abbreviated");
    expect(classifyJuniorName("Alex Smith", [evidence("Andrew Smith")], false).status).toBe(
      "expanded",
    );
    expect(classifyJuniorName("A Smith", [evidence("Alex Smith")], true).status).toBe("protected");
  });
});

const stamp = Date.now();
const ids = Array.from({ length: 7 }, () => randomUUID());
const [alex, andrew, manual, conflicting, privateId, expanded, corrected] = ids;
const matchId = 880_000_000 + (stamp % 1_000_000);
const premId = matchId;
const LONG_NAME = "Alexandra Jean-Marie de la Cruz-Smith";
describe("junior full-name review and deliberate publication", () => {
  let tenant = 0,
    other = 0,
    cookie = "",
    otherCookie = "";
  const auth = (r: request.Test) => r.set("x-tenant-id", String(tenant)).set("Cookie", cookie);
  const pub = (r: request.Test) => r.set("x-tenant-id", String(tenant));
  const review = async () =>
    (await auth(request(app).get("/api/juniors/name-review")).expect(200)).body as Review[];
  const row = async (id: string) =>
    (await review()).find((r) => r.participantId.toLowerCase() === id)!;
  const selection = (r: Review, name = r.suggestedName!, mode = "suggestion") => ({
    participantId: r.participantId.toLowerCase(),
    revision: r.revision,
    name,
    mode,
  });
  const publish = (selections: unknown[]) =>
    auth(request(app).post("/api/juniors/name-review")).send({ selections });
  const journalRows = () =>
    db
      .select()
      .from(juniorStatCorrectionsTable)
      .where(eq(juniorStatCorrectionsTable.tenantId, tenant))
      .orderBy(juniorStatCorrectionsTable.id);
  beforeAll(async () => {
    process.env.SESSION_SECRET ??= "junior-full-name-tests";
    for (const key of ["a", "b"]) {
      const [t] = await db
        .insert(tenantsTable)
        .values({
          slug: `name-review-${key}-${stamp}`,
          name: `Name review ${key}`,
          plan: "pilot",
          centralClubId: 800_000 + (stamp % 10000) + (key === "b" ? 10000 : 0),
          readsFromCentral: true,
        })
        .returning();
      if (key === "a") tenant = t.id;
      else other = t.id;
      const [a] = await db
        .insert(adminsTable)
        .values({
          tenantId: t.id,
          username: `name-review-${key}-${stamp}`,
          displayName: "Test admin",
          passwordHash: "x",
        })
        .returning();
      const c = `${SESSION_COOKIE}=${encodeSession({ adminId: a.id, issuedAt: Date.now() })}`;
      if (key === "a") {
        tenant = t.id;
        cookie = c;
      } else {
        other = t.id;
        otherCookie = c;
      }
    }
    await db.insert(juniorParticipantsTable).values([
      {
        tenantId: tenant,
        participantId: alex.toUpperCase(),
        displayName: "A Smith",
        firstSeason: "2020/21",
        lastSeason: "2025/26",
        seniorPlayerId: 123,
        photoWithheld: true,
      },
      { tenantId: tenant, participantId: andrew, displayName: "A Smith" },
      { tenantId: tenant, participantId: manual, displayName: "M Missing" },
      { tenantId: tenant, participantId: conflicting, displayName: "C Jones" },
      { tenantId: tenant, participantId: privateId, displayName: "P Kid", isPrivate: true },
      { tenantId: tenant, participantId: expanded, displayName: "Already Expanded" },
      { tenantId: tenant, participantId: corrected, displayName: "C Corrected" },
      { tenantId: other, participantId: alex, displayName: "Other Club Identity" },
    ]);
    await db.insert(juniorStatCorrectionsTable).values({
      tenantId: tenant,
      targetTable: "junior_participants",
      targetId: corrected,
      op: "update",
      patch: { display_name: "C Corrected" },
      prevValues: { display_name: "Old Name" },
      createdBy: "prior-admin",
    });
    await db.insert(juniorMatchesTable).values({
      id: matchId,
      tenantId: tenant,
      season: "2025/26",
      seasonStartYear: 2025,
      teamName: "Blue",
      team1: "Blue",
      team2: "Rivals",
      opponentName: "Rivals",
    });
    await db.insert(juniorMatchBattingTable).values([
      {
        id: matchId,
        matchId,
        innings: 1,
        participantId: alex,
        playerName: "Alex Smith",
        isHallsHead: true,
        runs: 37,
      },
      {
        id: matchId + 1,
        matchId,
        innings: 1,
        participantId: andrew,
        playerName: "Andrew Smith",
        isHallsHead: true,
        runs: 22,
      },
      {
        id: matchId + 2,
        matchId,
        innings: 2,
        participantId: alex,
        playerName: "Opponent Fullname",
        isHallsHead: false,
        runs: 5,
      },
      {
        id: matchId + 3,
        matchId,
        innings: 1,
        participantId: conflicting,
        playerName: "Charlie Jones",
        isHallsHead: true,
        runs: 12,
      },
    ]);
    await db.insert(juniorMatchRostersTable).values([
      { id: matchId, matchId, participantId: alex, playerName: "A Smith", isHallsHead: true },
      {
        id: matchId + 1,
        matchId,
        participantId: andrew,
        playerName: "Andrew Smith",
        isHallsHead: true,
      },
      {
        id: matchId + 2,
        matchId,
        participantId: conflicting,
        playerName: "Chris Jones",
        isHallsHead: true,
      },
      {
        id: matchId + 3,
        matchId,
        participantId: privateId,
        playerName: "Private Kid",
        isHallsHead: true,
      },
    ]);
    await db
      .insert(juniorPremiershipsTable)
      .values({ id: premId, tenantId: tenant, season: "2025/26", teamName: "Blue" });
    await db
      .insert(juniorPremiershipPlayersTable)
      .values({ id: premId, premiershipId: premId, participantId: alex, playerName: "A Smith" });
  });
  afterAll(async () => {
    const tenants = [tenant, other].filter(Boolean);
    if (!tenants.length) return;
    await db
      .delete(juniorPremiershipsTable)
      .where(inArray(juniorPremiershipsTable.tenantId, tenants));
    await db.delete(juniorMatchesTable).where(inArray(juniorMatchesTable.tenantId, tenants));
    await db
      .delete(juniorStatCorrectionsTable)
      .where(inArray(juniorStatCorrectionsTable.tenantId, tenants));
    await db
      .delete(juniorParticipantsTable)
      .where(inArray(juniorParticipantsTable.tenantId, tenants));
    await db
      .delete(juniorMatchDisplaySettingsTable)
      .where(inArray(juniorMatchDisplaySettingsTable.tenantId, tenants));
    await db.delete(adminsTable).where(inArray(adminsTable.tenantId, tenants));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
  });
  it("preview is read-only, ID-based, own-club-only and admin-only", async () => {
    const before = await journalRows();
    const rows = await review();
    expect(rows).toHaveLength(7);
    expect((await row(alex)).suggestedName).toBe("Alex Smith");
    expect((await row(andrew)).suggestedName).toBe("Andrew Smith");
    expect((await row(alex)).evidence.map((e) => e.name)).not.toContain("Opponent Fullname");
    expect((await row(conflicting)).status).toBe("conflicting");
    expect((await row(manual)).status).toBe("missing");
    expect((await row(expanded)).status).toBe("expanded");
    expect((await row(corrected)).status).toBe("protected");
    expect(await journalRows()).toEqual(before);
    await pub(request(app).get("/api/juniors/name-review")).expect(401);
    await pub(request(app).post("/api/juniors/name-review")).send({ selections: [] }).expect(401);
    await request(app)
      .get("/api/juniors/name-review")
      .set("x-tenant-id", String(tenant))
      .set("Cookie", otherCookie)
      .expect(401);
    const otherRows = await request(app)
      .get("/api/juniors/name-review")
      .set("x-tenant-id", String(other))
      .set("Cookie", otherCookie)
      .expect(200);
    expect(otherRows.body).toHaveLength(1);
    expect(otherRows.body[0].currentName).toBe("Other Club Identity");
  });
  it("publishes a GUID-case-insensitive suggestion without merging same-initial players or altering facts", async () => {
    const [before] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(sql`tenant_id = ${tenant} AND lower(participant_id) = ${alex}`);
    const beforeLines = await db
      .select()
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.matchId, matchId));
    const beforeMerges = await db
      .select()
      .from(juniorParticipantMergesTable)
      .where(eq(juniorParticipantMergesTable.tenantId, tenant));
    const s = selection(await row(alex));
    expect((await publish([s]).expect(200)).body).toEqual({ published: 1, skipped: 0 });
    expect((await publish([s]).expect(200)).body).toEqual({ published: 0, skipped: 1 });
    const [after] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(sql`tenant_id = ${tenant} AND lower(participant_id) = ${alex}`);
    expect(after).toEqual({ ...before, displayName: "Alex Smith" });
    expect((await row(andrew)).currentName).toBe("A Smith");
    const lines = await db
      .select()
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.matchId, matchId));
    expect(lines.map(({ playerName: _, ...l }) => l).sort((a, b) => a.id - b.id)).toEqual(
      beforeLines.map(({ playerName: _, ...l }) => l).sort((a, b) => a.id - b.id),
    );
    expect(lines.find((l) => !l.isHallsHead)?.playerName).toBe("Opponent Fullname");
    expect(
      await db
        .select()
        .from(juniorParticipantMergesTable)
        .where(eq(juniorParticipantMergesTable.tenantId, tenant)),
    ).toEqual(beforeMerges);
    const audit = (await journalRows()).filter((c) => c.targetId === alex.toUpperCase());
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      patch: { display_name: "Alex Smith" },
      prevValues: { display_name: "A Smith" },
      createdBy: `name-review-a-${stamp}`,
    });
    expect(audit[0].createdAt).toBeInstanceOf(Date);
  });
  it("manual knowledge resolves missing/conflicting evidence, and a published name can be corrected and reverted", async () => {
    await publish([
      selection(await row(manual), "Morgan Missing", "manual"),
      selection(await row(conflicting), "Christopher Jones", "manual"),
    ]).expect(200);
    const old = await row(manual);
    await publish([selection(old, "Morgan Anne Missing", "manual")]).expect(200);
    const edited = await row(manual);
    const latest = (await journalRows()).filter((c) => c.targetId === manual).at(-1)!;
    await auth(request(app).delete(`/api/juniors/corrections/${latest.id}`)).expect(204);
    expect((await row(manual)).currentName).toBe("Morgan Missing");
    await publish([selection(edited, "Morgan Another Missing", "manual")]).expect(409);
  });
  it("stale evidence, stale naming/privacy settings, invalid suggestions and cross-tenant previews are rejected atomically", async () => {
    const a = await row(andrew);
    const m = await row(manual);
    await db
      .update(juniorMatchRostersTable)
      .set({ playerName: "Adam Smith" })
      .where(eq(juniorMatchRostersTable.id, matchId + 1));
    await publish([selection(m, "Morgan Changed Missing", "manual"), selection(a)]).expect(409);
    expect((await row(manual)).currentName).toBe(m.currentName);
    await publish([selection(await row(conflicting), "Charlie Jones")]).expect(409);
    await publish([
      {
        ...selection(await row(manual), "Morgan Missing", "manual"),
        revision: "other-tenant-preview",
      },
    ]).expect(409);
    const r = await row(privateId);
    await auth(request(app).patch("/api/juniors/match-display-settings"))
      .send({ nameStyle: "first" })
      .expect(200);
    await publish([selection(r, "Private Kid", "manual")]).expect(400);
    await publish([selection(r, "Patrick Kid", "manual")]).expect(409);
    await publish([selection(await row(manual), "M Missing", "manual")]).expect(400);
  });
  it("enforces newest-first participant reverts across legacy and publication GUID casing", async () => {
    // Model a legacy lowercase correction on a profile whose stored GUID
    // spelling is uppercase. A later publication journals that stored spelling.
    const id = randomUUID();
    await db.insert(juniorParticipantsTable).values({
      tenantId: tenant,
      participantId: id.toUpperCase(),
      displayName: "Alex Casecheck",
    });
    const [legacy] = await db
      .insert(juniorStatCorrectionsTable)
      .values({
        tenantId: tenant,
        targetTable: "junior_participants",
        targetId: id,
        op: "update",
        patch: { display_name: "Alex Casecheck" },
        prevValues: { display_name: "A Casecheck" },
        createdBy: "Legacy admin",
      })
      .returning();
    await publish([selection(await row(id), "Alexander James Casecheck", "manual")]).expect(200);
    const latest = (await journalRows()).filter((c) => c.targetId.toLowerCase() === id).at(-1)!;
    expect(latest.targetId).toBe(id.toUpperCase());
    await auth(request(app).delete(`/api/juniors/corrections/${legacy.id}`)).expect(409);
    expect((await row(id)).currentName).toBe("Alexander James Casecheck");
    expect((await journalRows()).filter((c) => c.targetId.toLowerCase() === id)).toHaveLength(2);
    await auth(request(app).delete(`/api/juniors/corrections/${latest.id}`)).expect(204);
    expect((await row(id)).currentName).toBe("Alex Casecheck");
    await auth(request(app).delete(`/api/juniors/corrections/${legacy.id}`)).expect(204);
    expect((await row(id)).currentName).toBe("A Casecheck");
    expect((await journalRows()).filter((c) => c.targetId.toLowerCase() === id)).toHaveLength(0);
  });
  it("withheld stays withheld and names flow to linked premierships, scorecards, directory search and public style", async () => {
    await publish([selection(await row(privateId), "Patrick Kid", "manual")]).expect(200);
    expect((await row(privateId)).withheld).toBe(true);
    await pub(request(app).get(`/api/juniors/players/${privateId}`)).expect(404);
    const privateCard = await pub(request(app).get(`/api/juniors/matches/${matchId}`)).expect(200);
    expect(JSON.stringify(privateCard.body)).not.toContain("Patrick");
    await publish([selection(await row(alex), LONG_NAME, "manual")]).expect(200);
    await auth(request(app).patch("/api/juniors/match-display-settings"))
      .send({ nameStyle: "full" })
      .expect(200);
    const prems = await pub(request(app).get("/api/juniors/premierships")).expect(200);
    expect(prems.body[0].players[0].playerName).toBe(LONG_NAME);
    const directory = await pub(request(app).get("/api/juniors/players?search=Cruz")).expect(200);
    expect(directory.body.map((p: { displayName: string }) => p.displayName)).toContain(LONG_NAME);
    const scorecard = await pub(request(app).get(`/api/juniors/matches/${matchId}`)).expect(200);
    expect(JSON.stringify(scorecard.body)).toContain(LONG_NAME);
    expect(JSON.stringify(scorecard.body)).toContain("O. F.");
    await auth(request(app).patch("/api/juniors/match-display-settings"))
      .send({ nameStyle: "first_initial" })
      .expect(200);
    const hiddenSearch = await pub(request(app).get("/api/juniors/players?search=Cruz")).expect(
      200,
    );
    expect(hiddenSearch.body).toEqual([]);
    const player = await pub(request(app).get(`/api/juniors/players/${alex.toUpperCase()}`)).expect(
      200,
    );
    expect(player.body.displayName).toBe("Alexandra C");
  });
});
