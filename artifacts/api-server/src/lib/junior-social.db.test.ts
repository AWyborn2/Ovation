/**
 * Junior social end to end against a real database (junior PlayHQ sync plan U8;
 * KTD13-KTD15, R17-R21, R23, F2, F3, AE4, AE5): junior team-list and result cards from
 * synced junior data, per-team publishing and the promotion guard, the switch-off hold,
 * and re-rendering on a naming-style change. The rules are unit-tested in
 * junior-publishing.test.ts and engines/junior-team-list.test.ts.
 *
 * CI only: needs DATABASE_URL (like junior-projection.db.test.ts).
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { findPostingStyle, planFromStyle } from "@workspace/scorecard/posting-plan";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  db,
  tenantsTable,
  socialSettingsTable,
  socialDraftsTable,
  socialDraftRevisionsTable,
  socialPublicationsTable,
  captionTemplatesTable,
  shirtNumberSettingsTable,
  juniorShirtNumbersTable,
  juniorFixturesTable,
  juniorTeamListsTable,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorParticipantsTable,
  juniorMatchDisplaySettingsTable,
  JUNIOR_SYNC_ID_START,
  type SocialDraftRow,
} from "@workspace/db";
import { runJuniorSocialSweep } from "./junior-social";
import { runDraftSweep } from "./draft-sweep";
import { persistDueDrafts } from "./effective-draft-state";
import { juniorTeamListKey } from "./junior-publishing";
import { draftKeys } from "./draft-upsert";

const STAMP = Date.now();
const DAY = 86_400_000;
// 20 Nov 2026 10:00 Perth: season 2026/27.
const NOW = new Date("2026-11-20T02:00:00Z");
const log = { error: () => {}, warn: () => {}, info: () => {} };

const OLLIE = randomUUID().toLowerCase();
const SECRET = randomUUID().toLowerCase();
const MIA = randomUUID().toLowerCase();

const MATCH_BASE = JUNIOR_SYNC_ID_START + 40_000_000 + (STAMP % 1_000_000) * 10;
const Y9_MATCH = MATCH_BASE;
const B_MATCH = MATCH_BASE + 1;

type CardRow = { order: number; surname: string; firstInitial?: string; shirtNumber?: string };
type Card = { kind: string; junior?: boolean; numbering?: string; players: CardRow[] } & Record<
  string,
  unknown
>;

let tenantId: number;
let tenantBId: number;
const fixtures: Record<"y9" | "y4" | "y1011" | "y5" | "y4Played" | "b", number> = {
  y9: 0,
  y4: 0,
  y1011: 0,
  y5: 0,
  y4Played: 0,
  b: 0,
};

async function makeTenant(
  key: string,
  centralClubId: number,
  juniorSyncEnabled: boolean,
): Promise<number> {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `jr-social-${key}-${STAMP}`,
      centralClubId,
      name: `Junior Social ${key}`,
      plan: "pro",
      playhqOrgId: randomUUID(),
      playhqSyncEnabled: true,
      juniorSyncEnabled,
    })
    .returning();
  // Version 2: junior age groups draft only when the row lists them (KTD6).
  const plan = planFromStyle(findPostingStyle("every-match", true)!);
  plan.rows.results.grades = { "Year 10-11": true, "Year 5": true, "Year 9": true, "Year 4": true };
  plan.rows.teamLists.grades = {
    "Year 10-11": true,
    "Year 5": true,
    "Year 9": true,
    "Year 4": true,
  };
  await db.insert(socialSettingsTable).values({
    tenantId: t.id,
    autoPostEnabled: true,
    autoPostWindowHours: 1,
    postingPlan: plan,
  });
  return t.id;
}

async function fixture(
  tid: number,
  ageGroup: string,
  teamName: string,
  startAt: Date,
  players: { order: number; participantId: string }[] | null,
  status = "UPCOMING",
): Promise<number> {
  const [f] = await db
    .insert(juniorFixturesTable)
    .values({
      tenantId: tid,
      playhqMatchId: randomUUID(),
      seasonStartYear: 2026,
      ageGroup,
      grade: `${ageGroup} Gold`,
      teamName,
      opponentName: "Rockingham Rams",
      venue: "Halls Head Oval",
      startAt,
      isHome: true,
      status,
    })
    .returning();
  if (players) {
    await db.insert(juniorTeamListsTable).values({
      tenantId: tid,
      juniorFixtureId: f.id,
      players,
      isPublished: true,
      source: "playhq",
    });
  }
  return f.id;
}

async function draftsOf(tid: number): Promise<SocialDraftRow[]> {
  return db.select().from(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tid));
}

async function draftByKey(tid: number, key: string): Promise<SocialDraftRow | undefined> {
  const [d] = await db
    .select()
    .from(socialDraftsTable)
    .where(and(eq(socialDraftsTable.tenantId, tid), eq(socialDraftsTable.sourceKey, key)));
  return d;
}

async function setPublishing(tid: number, teamPublishing: Record<string, Record<string, string>>) {
  await db
    .update(juniorMatchDisplaySettingsTable)
    .set({ teamPublishing: teamPublishing as never })
    .where(eq(juniorMatchDisplaySettingsTable.tenantId, tid));
}

describe("junior social drafting (DB)", () => {
  beforeAll(async () => {
    tenantId = await makeTenant("on", 9957, true);
    tenantBId = await makeTenant("off", 9958, false);

    await db.insert(juniorMatchDisplaySettingsTable).values([
      {
        tenantId,
        nameStyle: "full",
        teamPublishing: {
          "Year 10-11": { "Halls Head Hawks": "auto" },
          "Year 5": { "Halls Head Gold": "approval" },
        },
      },
      { tenantId: tenantBId },
    ]);
    await db.insert(shirtNumberSettingsTable).values({ tenantId, enabled: true });
    await db.insert(juniorParticipantsTable).values([
      { tenantId, participantId: OLLIE, displayName: "Ollie Gallash", isPrivate: false },
      { tenantId, participantId: SECRET, displayName: "Secret Child", isPrivate: true },
      { tenantId, participantId: MIA, displayName: "Mia Brown", isPrivate: false },
      { tenantId: tenantBId, participantId: OLLIE, displayName: "Ollie Gallash" },
    ]);
    await db.insert(juniorShirtNumbersTable).values([
      { tenantId, season: 2026, participantId: OLLIE, name: "Ollie Gallash", number: "7" },
      { tenantId, season: 2026, participantId: SECRET, name: "Secret Child", number: "13" },
    ]);

    const side = [
      { order: 1, participantId: OLLIE },
      { order: 2, participantId: SECRET },
      { order: 3, participantId: MIA },
    ];
    const soon = new Date(NOW.getTime() + 3 * DAY);
    fixtures.y9 = await fixture(tenantId, "Year 9", "Halls Head Hawks", soon, side);
    fixtures.y4 = await fixture(tenantId, "Year 4", "Halls Head Kites", soon, side);
    fixtures.y1011 = await fixture(tenantId, "Year 10-11", "Halls Head Hawks", soon, side);
    fixtures.y5 = await fixture(tenantId, "Year 5", "Halls Head Gold", soon, side);
    // AE4: a Year 4 game played five days ago without a published scorecard: a finished
    // fixture only, never a junior match.
    fixtures.y4Played = await fixture(
      tenantId,
      "Year 4",
      "Halls Head Kites",
      new Date(NOW.getTime() - 5 * DAY),
      null,
      "COMPLETED",
    );
    fixtures.b = await fixture(tenantBId, "Year 9", "Halls Head Hawks", soon, [
      { order: 1, participantId: OLLIE },
    ]);

    // AE4: a scored Year 9 match from five days ago (synced id band), and the disabled
    // club's scored match.
    for (const [id, tid] of [
      [Y9_MATCH, tenantId],
      [B_MATCH, tenantBId],
    ] as const) {
      await db.insert(juniorMatchesTable).values({
        id,
        tenantId: tid,
        playhqMatchId: randomUUID(),
        season: "2026/27",
        seasonStartYear: 2026,
        grade: "Year 9 Gold",
        ageGroup: "Year 9",
        teamName: "Halls Head Hawks",
        matchDate: "2026-11-15",
        status: "COMPLETED",
        team1: "Halls Head Hawks",
        team1Score: "5-120",
        team2: "Rockingham Rams",
        team2Score: "100",
        hhResult: "Won",
        opponentName: "Rockingham Rams",
      });
      await db.insert(juniorMatchBattingTable).values([
        {
          id,
          matchId: id,
          innings: 1,
          battingTeam: "Halls Head Hawks",
          isHallsHead: true,
          batOrder: 1,
          participantId: SECRET,
          playerName: "Secret Child",
          runs: 64,
          balls: 50,
        },
      ]);
    }
  });

  afterAll(async () => {
    const ids = [tenantId, tenantBId].filter(Boolean);
    const drafts = await db
      .select({ id: socialDraftsTable.id })
      .from(socialDraftsTable)
      .where(inArray(socialDraftsTable.tenantId, ids));
    if (drafts.length) {
      const draftIds = drafts.map((d) => d.id);
      await db
        .delete(socialDraftRevisionsTable)
        .where(inArray(socialDraftRevisionsTable.draftId, draftIds));
      await db
        .delete(socialPublicationsTable)
        .where(inArray(socialPublicationsTable.draftId, draftIds));
    }
    await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, ids));
    await db.delete(juniorMatchesTable).where(inArray(juniorMatchesTable.tenantId, ids));
    await db.delete(juniorTeamListsTable).where(inArray(juniorTeamListsTable.tenantId, ids));
    await db.delete(juniorFixturesTable).where(inArray(juniorFixturesTable.tenantId, ids));
    await db.delete(juniorShirtNumbersTable).where(inArray(juniorShirtNumbersTable.tenantId, ids));
    await db.delete(juniorParticipantsTable).where(inArray(juniorParticipantsTable.tenantId, ids));
    await db
      .delete(juniorMatchDisplaySettingsTable)
      .where(inArray(juniorMatchDisplaySettingsTable.tenantId, ids));
    await db
      .delete(shirtNumberSettingsTable)
      .where(inArray(shirtNumberSettingsTable.tenantId, ids));
    await db.delete(captionTemplatesTable).where(inArray(captionTemplatesTable.tenantId, ids));
    await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, ids));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
  });

  it("a published junior team list 3 days out drafts one junior card; a second sweep adds none", async () => {
    const first = await runJuniorSocialSweep(tenantId, "scheduled", NOW, log);
    expect(first.enabled).toBe(true);
    expect(first.teamLists).toBe(4);

    const d = await draftByKey(tenantId, juniorTeamListKey(fixtures.y9));
    expect(d).toBeDefined();
    expect(d!.sourceMatchIsJunior).toBe(true);
    expect(d!.family).toBe("matchday");
    expect(d!.appPath).toBe(`/juniors/fixtures/${fixtures.y9}`);
    // No photo of any kind (R21).
    expect(d!.photoUrl).toBeNull();
    const card = d!.cardInput as Card;
    expect(card.kind).toBe("teamList");
    expect(card.junior).toBe(true);
    expect(card.numbering).toBe("shirt");
    for (const key of ["squadPhotoUrl", "teamPhotoUrl", "cardPhotoUrl", "featuredPlayerId"]) {
      expect(card).not.toHaveProperty(key);
    }
    expect(card.players[0]).toMatchObject({
      surname: "GALLASH",
      firstInitial: "O",
      shirtNumber: "7",
    });

    const second = await runJuniorSocialSweep(tenantId, "scheduled", NOW, log);
    expect(second.teamLists).toBe(0);
    const keys = (await draftsOf(tenantId)).map((x) => x.sourceKey);
    expect(keys.filter((k) => k === juniorTeamListKey(fixtures.y9))).toHaveLength(1);
  });

  it("a private, non-overridden player is withheld on the card and in its caption", async () => {
    const d = await draftByKey(tenantId, juniorTeamListKey(fixtures.y9));
    const card = d!.cardInput as Card;
    expect(card.players[1]).toEqual({ order: 2, surname: "PRIVATE PLAYER" });
    expect(JSON.stringify(card)).not.toMatch(/secret/i);
    expect(d!.caption ?? "").not.toMatch(/secret/i);

    const result = await draftByKey(tenantId, draftKeys.matchSummary(Y9_MATCH, true));
    expect(JSON.stringify(result!.cardInput)).not.toMatch(/secret/i);
    expect(result!.caption ?? "").not.toMatch(/secret/i);
  });

  it("AE4: the scored Year 9 match drafts a result card; the unscored Year 4 game drafts none", async () => {
    const drafts = await draftsOf(tenantId);
    const results = drafts.filter((d) => d.sourceKey?.startsWith("matchSummary:"));
    expect(results.map((d) => d.sourceKey)).toEqual([draftKeys.matchSummary(Y9_MATCH, true)]);
    expect(results[0]!.sourceMatchIsJunior).toBe(true);
    expect(results[0]!.appPath).toBe(`/juniors/matches/${Y9_MATCH}`);
    expect(results[0]!.photoUrl).toBeNull();
    // Year 4: its upcoming team list only.
    expect(drafts.some((d) => d.sourceKey === juniorTeamListKey(fixtures.y4))).toBe(true);
    expect(drafts.some((d) => d.sourceKey === juniorTeamListKey(fixtures.y4Played))).toBe(false);
  });

  it("AE5: the auto team gets an auto-ready time, the approval team none, and only auto promotes", async () => {
    const auto = await draftByKey(tenantId, juniorTeamListKey(fixtures.y1011));
    const approval = await draftByKey(tenantId, juniorTeamListKey(fixtures.y5));
    expect(auto!.autoReadyAt).not.toBeNull();
    expect(approval!.autoReadyAt).toBeNull();
    // A team missing from the map (Year 9) is approval too.
    expect((await draftByKey(tenantId, juniorTeamListKey(fixtures.y9)))!.autoReadyAt).toBeNull();

    const promoted = await persistDueDrafts(tenantId, new Date(NOW.getTime() + 2 * 3_600_000));
    expect(promoted).toEqual([auto!.id]);
    expect((await draftByKey(tenantId, juniorTeamListKey(fixtures.y5)))!.status).toBe(
      "awaiting_review",
    );
  });

  it("a stray auto-ready time on an approval team's draft is never promoted, and the sweep clears it", async () => {
    const approval = await draftByKey(tenantId, juniorTeamListKey(fixtures.y5));
    await db
      .update(socialDraftsTable)
      .set({ autoReadyAt: new Date(NOW.getTime() - DAY) })
      .where(eq(socialDraftsTable.id, approval!.id));
    const promoted = await persistDueDrafts(tenantId, NOW);
    expect(promoted).not.toContain(approval!.id);

    await runJuniorSocialSweep(tenantId, "scheduled", NOW, log);
    const after = await draftByKey(tenantId, juniorTeamListKey(fixtures.y5));
    expect(after!.status).toBe("awaiting_review");
    expect(after!.autoReadyAt).toBeNull();
  });

  it("changing a team to auto re-times its queued draft on the next sweep", async () => {
    await setPublishing(tenantId, {
      "Year 10-11": { "Halls Head Hawks": "auto" },
      "Year 5": { "Halls Head Gold": "auto" },
    });
    await runJuniorSocialSweep(tenantId, "scheduled", NOW, log);
    expect(
      (await draftByKey(tenantId, juniorTeamListKey(fixtures.y5)))!.autoReadyAt,
    ).not.toBeNull();

    // And back to approval: cleared again.
    await setPublishing(tenantId, { "Year 10-11": { "Halls Head Hawks": "auto" } });
    await runJuniorSocialSweep(tenantId, "scheduled", NOW, log);
    expect((await draftByKey(tenantId, juniorTeamListKey(fixtures.y5)))!.autoReadyAt).toBeNull();
  });

  it("changing the naming style re-renders unposted junior drafts on the next sweep", async () => {
    await db
      .update(juniorMatchDisplaySettingsTable)
      .set({ nameStyle: "first" })
      .where(eq(juniorMatchDisplaySettingsTable.tenantId, tenantId));
    await runJuniorSocialSweep(tenantId, "scheduled", NOW, log);
    const card = (await draftByKey(tenantId, juniorTeamListKey(fixtures.y9)))!.cardInput as Card;
    expect(card.players[0]).toEqual({ order: 1, surname: "OLLIE", shirtNumber: "7" });
    expect(JSON.stringify(card)).not.toContain("GALLASH");
  });

  it("a disabled club's junior rows draft nothing, and junior drafts never mix with senior ones", async () => {
    await runJuniorSocialSweep(tenantBId, "scheduled", NOW, log);
    await runDraftSweep(tenantBId, { kind: "scheduled", now: NOW }, log);
    expect(await draftsOf(tenantBId)).toEqual([]);

    // The full sweep on the enabled club drafts the same junior cards, all junior, and
    // nothing under a senior key from junior data.
    await runDraftSweep(tenantId, { kind: "scheduled", now: NOW }, log);
    const drafts = await draftsOf(tenantId);
    expect(drafts.length).toBeGreaterThan(0);
    for (const d of drafts) {
      expect(d.sourceMatchIsJunior).toBe(true);
      expect(d.sourceKey).toMatch(/^(juniorteamlist:|matchSummary:junior:)/);
    }
    const senior = await db
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          like(socialDraftsTable.sourceKey, "teamlist:%"),
        ),
      );
    expect(senior).toEqual([]);
  });

  it("after junior sync is switched off, unposted junior drafts return to review with no auto-ready time", async () => {
    // The auto team's card was promoted to ready above, and has a queued Meta post.
    const ready = await draftByKey(tenantId, juniorTeamListKey(fixtures.y1011));
    expect(ready!.status).toBe("ready");
    const [queued] = await db
      .insert(socialPublicationsTable)
      .values({
        tenantId,
        draftId: ready!.id,
        platform: "facebook",
        origin: "auto",
        scheduledFor: new Date(NOW.getTime() + DAY),
        nextAttemptAt: new Date(NOW.getTime() + DAY),
      })
      .returning();
    await db
      .update(tenantsTable)
      .set({ juniorSyncEnabled: false })
      .where(eq(tenantsTable.id, tenantId));

    const summary = await runJuniorSocialSweep(tenantId, "scheduled", NOW, log);
    expect(summary.enabled).toBe(false);
    expect(summary.teamLists).toBe(0);
    const drafts = await draftsOf(tenantId);
    for (const d of drafts) {
      expect(d.status).toBe("awaiting_review");
      expect(d.autoReadyAt).toBeNull();
    }
    expect(await persistDueDrafts(tenantId, new Date(NOW.getTime() + 30 * DAY))).toEqual([]);
    // The queued post is cancelled with the hold (testing review P2).
    const [pub] = await db
      .select()
      .from(socialPublicationsTable)
      .where(eq(socialPublicationsTable.id, queued!.id));
    expect(pub!.status).toBe("cancelled");
  });

  it("a club without junior sync keeps auto-promoting its loader-era junior result cards", async () => {
    // correctness review P2: the junior auto-post guard covers synced drafts only.
    const loaderMatchId = 1_000 + (STAMP % 100_000);
    const [d] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId: tenantBId,
        engine: "matchSummary",
        status: "awaiting_review",
        sourceKind: "matchSummary",
        sourceKey: draftKeys.matchSummary(loaderMatchId, true),
        sourceMatchId: loaderMatchId,
        sourceMatchIsJunior: true,
        cardInput: { kind: "matchSummary", junior: true },
        autoReadyAt: new Date(NOW.getTime() - DAY),
      })
      .returning();
    expect(await persistDueDrafts(tenantBId, NOW)).toContain(d!.id);
  });
});
