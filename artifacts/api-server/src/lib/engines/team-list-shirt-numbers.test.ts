/**
 * Season shirt numbers on generated team-list drafts (shirt numbers plan U7 / F3, KTD7,
 * R1): with the feature on, each selected player carries their number for the FIXTURE's
 * season (a held player's through their PlayHQ participant id) and the card numbers by
 * shirt; another club's entries never leak in; with the feature off the card input is
 * unchanged. The pure mapping is unit-tested in team-list.test.ts; this drives
 * generateTeamListDrafts against a real database (needs DATABASE_URL; CI).
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  playersTable,
  fixturesTable,
  teamListsTable,
  socialSettingsTable,
  socialDraftsTable,
  socialDraftRevisionsTable,
  captionTemplatesTable,
  shirtNumbersTable,
  shirtNumberSettingsTable,
} from "@workspace/db";
import { generateTeamListDrafts, teamListKey } from "./team-list";

const STAMP = Date.now();
// Early September 2026 in Perth: the fixture (three days later) is season 2026, not 2025.
const NOW = new Date("2026-09-10T00:00:00Z");
const HELD = randomUUID();

type CardPlayer = { order: number; surname: string; shirtNumber?: string };

describe("team-list drafts with season shirt numbers (DB)", () => {
  const tenants: Record<"on" | "off" | "other", number> = { on: 0, off: 0, other: 0 };
  let linked: number;

  async function makeTenant(key: keyof typeof tenants, clubId: number, numbersOn: boolean) {
    const [t] = await db
      .insert(tenantsTable)
      .values({ slug: `xi-shirts-${key}-${STAMP}`, centralClubId: clubId, name: "XI", plan: "pro" })
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
    });
    if (numbersOn) {
      await db.insert(shirtNumberSettingsTable).values({ tenantId: t.id, enabled: true });
    }
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
    await db.insert(teamListsTable).values({
      tenantId,
      fixtureId: f.id,
      isPublished: true,
      players: [
        { order: 1, playerId: linked, displayName: "Lee Linked" },
        { order: 2, participantId: HELD, displayName: "Hal Held" },
        { order: 3, displayName: "Una Numbered" },
      ],
    });
    return f.id;
  }

  const cardFor = async (tenantId: number, fixtureId: number) => {
    const [d] = await db
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          eq(socialDraftsTable.sourceKey, teamListKey(fixtureId)),
        ),
      );
    return d?.cardInput as { numbering?: string; players: CardPlayer[] } | undefined;
  };

  beforeAll(async () => {
    await makeTenant("on", 9951, true);
    await makeTenant("off", 9952, false);
    await makeTenant("other", 9953, true);
    const [p] = await db
      .insert(playersTable)
      .values({ surname: `Linked${STAMP}`, givenName: "Lee" })
      .returning();
    linked = p.id;
    await db.insert(shirtNumbersTable).values([
      // The fixture's season (2026): the linked player's and the held player's numbers.
      { tenantId: tenants.on, season: 2026, name: "Lee Linked", playerId: linked, number: "7" },
      { tenantId: tenants.on, season: 2026, name: "Hal Held", participantId: HELD, number: "31" },
      // The previous season's number is never used for this fixture.
      { tenantId: tenants.on, season: 2025, name: "Lee Linked", playerId: linked, number: "99" },
      // Another club's entries for the same player id and participant never leak in.
      { tenantId: tenants.other, season: 2026, name: "X", playerId: linked, number: "55" },
      { tenantId: tenants.other, season: 2026, name: "Y", participantId: HELD, number: "66" },
      // The switched-off club has a number, but the card must not show it.
      { tenantId: tenants.off, season: 2026, name: "Lee Linked", playerId: linked, number: "12" },
    ]);
  });

  afterAll(async () => {
    const ids = Object.values(tenants).filter(Boolean);
    const drafts = await db
      .select({ id: socialDraftsTable.id })
      .from(socialDraftsTable)
      .where(inArray(socialDraftsTable.tenantId, ids));
    if (drafts.length > 0) {
      await db.delete(socialDraftRevisionsTable).where(
        inArray(
          socialDraftRevisionsTable.draftId,
          drafts.map((d) => d.id),
        ),
      );
    }
    await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, ids));
    await db.delete(teamListsTable).where(inArray(teamListsTable.tenantId, ids));
    await db.delete(fixturesTable).where(inArray(fixturesTable.tenantId, ids));
    await db.delete(shirtNumbersTable).where(inArray(shirtNumbersTable.tenantId, ids));
    await db
      .delete(shirtNumberSettingsTable)
      .where(inArray(shirtNumberSettingsTable.tenantId, ids));
    await db.delete(captionTemplatesTable).where(inArray(captionTemplatesTable.tenantId, ids));
    await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, ids));
    await db.delete(playersTable).where(eq(playersTable.id, linked));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
  });

  it("feature on: numbers by shirt, the fixture season's numbers, a held player's by participant", async () => {
    const fixtureId = await fixtureFor(tenants.on);
    const r = await generateTeamListDrafts(tenants.on, NOW);
    expect(r.drafted).toBe(1);
    const card = await cardFor(tenants.on, fixtureId);
    expect(card?.numbering).toBe("shirt");
    expect(card!.players.map((p) => [p.order, p.shirtNumber])).toEqual([
      [1, "7"],
      [2, "31"],
      [3, undefined],
    ]);
  });

  it("feature off: the card input carries no numbering and no shirt numbers", async () => {
    const fixtureId = await fixtureFor(tenants.off);
    await generateTeamListDrafts(tenants.off, NOW);
    const card = await cardFor(tenants.off, fixtureId);
    expect(card).toBeDefined();
    expect(card).not.toHaveProperty("numbering");
    expect(card!.players.every((p) => !("shirtNumber" in p))).toBe(true);
  });
});
