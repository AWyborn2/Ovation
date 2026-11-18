/**
 * Team List player order (round 3 retest, build decision 16) on the drafts the
 * sweep makes: they follow the club's default (`card_content.teamList.playerOrder`),
 * As selected leaves the card input exactly as before, a design's own order
 * (PATCH playerOrder) never changes the club's default and survives the next
 * sweep. Real-DB integration test (needs DATABASE_URL; CI).
 */
import { findPostingStyle, planFromStyle } from "@workspace/scorecard/posting-plan";
import { randomInt, randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  adminsTable,
  fixturesTable,
  teamListsTable,
  socialSettingsTable,
  socialDraftsTable,
  socialDraftRevisionsTable,
  captionTemplatesTable,
  shirtNumbersTable,
  shirtNumberSettingsTable,
} from "@workspace/db";
import app from "../../app";
import { encodeSession, SESSION_COOKIE } from "../auth";
import { generateTeamListDrafts, teamListKey } from "./team-list";
import { purgeTestTenants } from "../tenant-purge.test-helpers";

const STAMP = Date.now();
const NOW = new Date("2026-09-10T00:00:00Z");
const HAL = randomUUID();
const LEE = randomUUID();

type CardPlayer = { order: number; surname: string; role?: string; shirtNumber?: string };
type Card = {
  players: CardPlayer[];
  playerOrder?: string;
  playerOrderOverride?: string;
};

describe("team list drafts follow the club's player order (DB)", () => {
  const tenants: Record<"ordered" | "plain", number> = { ordered: 0, plain: 0 };
  let adminId = 0;
  let cookie = "";

  async function makeTenant(key: keyof typeof tenants, playerOrder?: string) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `xi-order-${key}-${STAMP}`,
        centralClubId: randomInt(1000000, 1000000000),
        name: "XI",
        plan: "pro",
      })
      .returning();
    tenants[key] = t.id;
    await db.insert(socialSettingsTable).values({
      tenantId: t.id,
      familyConfig: {
        results: { enabled: false, grades: {} },
        achievements: { enabled: false, grades: {} },
        roundup: { enabled: false, grades: {} },
        matchday: { enabled: true, grades: {} },
      },
      postingPlan: planFromStyle(findPostingStyle("every-match", true)!),
      ...(playerOrder
        ? {
            cardContent: {
              matchDay: { preset: "standard", fields: {}, juniorConsolidateByDay: true },
              teamList: { preset: "standard", fields: {}, playerOrder },
            },
          }
        : {}),
    });
    await db.insert(shirtNumberSettingsTable).values({ tenantId: t.id, enabled: true });
    await db.insert(shirtNumbersTable).values([
      { tenantId: t.id, season: 2026, name: "Hal Held", participantId: HAL, number: "31" },
      { tenantId: t.id, season: 2026, name: "Lee Linked", participantId: LEE, number: "7" },
    ]);
  }

  async function fixtureFor(tenantId: number) {
    const [f] = await db
      .insert(fixturesTable)
      .values({
        tenantId,
        grade: "A Grade",
        roundLabel: "Round 1",
        opponentName: "Rivals",
        venue: "Home Oval",
        startAt: new Date(NOW.getTime() + 72 * 3600 * 1000),
        isHome: true,
      })
      .returning();
    // As picked: no number first, then 31 (captain), then 7.
    await db.insert(teamListsTable).values({
      tenantId,
      fixtureId: f.id,
      isPublished: true,
      players: [
        { order: 1, displayName: "Una Zed" },
        { order: 2, participantId: HAL, displayName: "Hal Held", role: "C" },
        { order: 3, participantId: LEE, displayName: "Lee Linked" },
      ],
    });
    return f.id;
  }

  const draftFor = async (tenantId: number, fixtureId: number) => {
    const [d] = await db
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          eq(socialDraftsTable.sourceKey, teamListKey(fixtureId)),
        ),
      );
    return d!;
  };
  const surnames = (card: Card) => card.players.map((p) => p.surname);
  const clubOrder = async (tenantId: number) => {
    const [row] = await db
      .select({ cardContent: socialSettingsTable.cardContent })
      .from(socialSettingsTable)
      .where(eq(socialSettingsTable.tenantId, tenantId));
    return row!.cardContent.teamList?.playerOrder;
  };

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-team-list-order";
    await makeTenant("ordered", "shirt");
    await makeTenant("plain");
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenants.ordered,
        username: `order_${STAMP}`,
        displayName: "Order",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    const ids = Object.values(tenants).filter(Boolean);
    const drafts = await db
      .select({ id: socialDraftsTable.id })
      .from(socialDraftsTable)
      .where(inArray(socialDraftsTable.tenantId, ids));
    if (drafts.length > 0)
      await db.delete(socialDraftRevisionsTable).where(
        inArray(
          socialDraftRevisionsTable.draftId,
          drafts.map((d) => d.id),
        ),
      );
    await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, ids));
    await db.delete(teamListsTable).where(inArray(teamListsTable.tenantId, ids));
    await db.delete(fixturesTable).where(inArray(fixturesTable.tenantId, ids));
    await db.delete(shirtNumbersTable).where(inArray(shirtNumbersTable.tenantId, ids));
    await db
      .delete(shirtNumberSettingsTable)
      .where(inArray(shirtNumberSettingsTable.tenantId, ids));
    await db.delete(captionTemplatesTable).where(inArray(captionTemplatesTable.tenantId, ids));
    await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, ids));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await purgeTestTenants(ids);
  });

  it("a club that never chose: As selected, the input exactly as before", async () => {
    const fixtureId = await fixtureFor(tenants.plain);
    await generateTeamListDrafts(tenants.plain, NOW);
    const card = (await draftFor(tenants.plain, fixtureId)).cardInput as Card;
    expect(surnames(card)).toEqual(["ZED", "HELD", "LINKED"]);
    expect(card).not.toHaveProperty("playerOrder");
  });

  it("the sweep follows the club's default; a design's own order keeps it and survives the next sweep", async () => {
    const fixtureId = await fixtureFor(tenants.ordered);
    await generateTeamListDrafts(tenants.ordered, NOW);
    const draft = await draftFor(tenants.ordered, fixtureId);
    const card = draft.cardInput as Card;
    expect(card.playerOrder).toBe("shirt");
    // 7, 31 (still captain), then the player with no number.
    expect(card.players.map((p) => [p.surname, p.shirtNumber, p.role])).toEqual([
      ["LINKED", "7", undefined],
      ["HELD", "31", "C"],
      ["ZED", undefined, undefined],
    ]);
    // Each row keeps its picked order, so the design can go back to it.
    expect(card.players.map((p) => p.order)).toEqual([3, 2, 1]);

    // This design's own order: stored on its card input, the club's untouched.
    const patch = (body: object) =>
      request(app)
        .patch(`/api/social-drafts/${draft.id}`)
        .set("Cookie", cookie)
        .set("x-tenant-id", String(tenants.ordered))
        .send(body);
    await patch({ playerOrder: "random" }).expect(400);
    const res = await patch({ playerOrder: "alpha" }).expect(200);
    expect((res.body.cardInput as Card).playerOrderOverride).toBe("alpha");
    expect(await clubOrder(tenants.ordered)).toBe("shirt");

    // The next sweep sees the same side: unchanged, the design's order kept.
    const again = await generateTeamListDrafts(tenants.ordered, NOW);
    expect(again.refreshed).toBe(0);
    expect(
      ((await draftFor(tenants.ordered, fixtureId)).cardInput as Card).playerOrderOverride,
    ).toBe("alpha");

    // A new club default reaches the draft on its next sweep; the design's own order stays.
    await db
      .update(socialSettingsTable)
      .set({
        cardContent: {
          matchDay: { preset: "standard", fields: {}, juniorConsolidateByDay: true },
          teamList: { preset: "standard", fields: {}, playerOrder: "alpha" },
        },
      })
      .where(eq(socialSettingsTable.tenantId, tenants.ordered));
    const refreshed = await generateTeamListDrafts(tenants.ordered, NOW);
    expect(refreshed.refreshed).toBe(1);
    const after = (await draftFor(tenants.ordered, fixtureId)).cardInput as Card;
    expect(after.playerOrder).toBe("alpha");
    expect(surnames(after)).toEqual(["HELD", "LINKED", "ZED"]);
    expect(after.playerOrderOverride).toBe("alpha");

    // Null goes back to the order the card was made with.
    const cleared = await patch({ playerOrder: null }).expect(200);
    expect(cleared.body.cardInput).not.toHaveProperty("playerOrderOverride");
  });
});
