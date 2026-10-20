/**
 * ADR-010 P2 parity: the 48-hour sweep and the Weekend Carousel build a
 * fixture's Match Day content with the same builder, so they say the same
 * thing; and the sweep still saves exactly the draft input it saved before the
 * content pipeline, so existing auto-queued drafts are never rewritten.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  adminsTable,
  fixturesTable,
  socialSettingsTable,
  socialDraftsTable,
  captionTemplatesTable,
  type FixtureRow,
} from "@workspace/db";
import { findPostingStyle, planFromStyle } from "@workspace/scorecard/posting-plan";
import { matchDayDraftInput, type MatchDayFixtureContent } from "@workspace/scorecard/card-content";
import app from "../../app";
import { encodeSession, SESSION_COOKIE } from "../auth";
import { generateMatchDayDrafts, matchDayKey } from "../engines/match-day";
import { upsertDraftByKey } from "../draft-upsert";
import { buildMatchDayContent } from "./match-day";

const STAMP = Date.now();
const HOUR = 60 * 60 * 1000;
// Friday 9 Oct 2026, 8 AM in Perth.
const NOW = new Date("2026-10-09T00:00:00Z");

let tenantId: number;
let adminId: number;
let cookie: string;
let rows: FixtureRow[];

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-content-parity";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `parity-${STAMP}`, centralClubId: 9961, name: "Parity Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `parity_${STAMP}`, displayName: "Parity", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  await db.insert(socialSettingsTable).values({
    tenantId,
    postingPlan: planFromStyle(findPostingStyle("every-match", true)!),
  });
  const base = { tenantId, isHome: true, source: "manual" };
  rows = await db
    .insert(fixturesTable)
    .values([
      {
        ...base,
        grade: "A Grade",
        roundLabel: "Round 3",
        opponentName: "White Knights Baldivis Cricket Club Inc",
        venue: "  Halls Head Oval ",
        // Saturday 10 Oct, 12:30 PM Perth.
        startAt: new Date(NOW.getTime() + 28.5 * HOUR),
        isHome: false,
      },
      {
        ...base,
        grade: "B Grade",
        roundLabel: null,
        opponentName: "Mandurah",
        opponentLogoUrl: "https://example.test/mandurah.png",
        venue: null,
        // Sunday 11 Oct, 6 AM Perth (inside the 48 hours).
        startAt: new Date(NOW.getTime() + 46 * HOUR),
      },
    ])
    .returning();
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, tenantId));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

const draftFor = async (fixtureId: number) =>
  (
    await db
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          eq(socialDraftsTable.sourceKey, matchDayKey(fixtureId)),
        ),
      )
  )[0];

/** What the sweep saved before the content pipeline, for these two fixtures. */
const LEGACY = [
  {
    kind: "matchDay",
    roundLabel: "ROUND 3",
    oppositionName: "White Knights Baldivis Cricket Club Inc",
    oppositionLogoUrl: null,
    homeAway: "AWAY",
    venue: "  Halls Head Oval ",
    date: "SAT 10 OCT",
    startTime: "12:30 PM",
    grade: "A Grade",
  },
  {
    kind: "matchDay",
    roundLabel: "",
    oppositionName: "Mandurah",
    oppositionLogoUrl: "https://example.test/mandurah.png",
    homeAway: "HOME",
    venue: "",
    date: "SUN 11 OCT",
    startTime: "6:00 AM",
    grade: "B Grade",
  },
];

describe("Match Day content parity (sweep vs carousel)", () => {
  it("the sweep and the carousel produce identical content for each fixture", async () => {
    await generateMatchDayDrafts(tenantId, NOW);
    const res = await request(app)
      .get("/api/weekend-carousel/sources")
      .set("x-tenant-id", String(tenantId))
      .set("Cookie", cookie)
      .query({ from: "2026-10-09", to: "2026-10-11", setType: "matchDay", audience: "all" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const carousel = res.body.matchDayContent as Record<string, MatchDayFixtureContent>;
    const built = await buildMatchDayContent(tenantId, rows);
    for (const [i, f] of rows.entries()) {
      const slide = carousel[f.id];
      // The carousel's content is the builder's, field for field.
      expect(slide).toEqual(JSON.parse(JSON.stringify(built.get(f.id))));
      // And the sweep's draft is that same content, saved as it always was.
      const draft = await draftFor(f.id);
      expect(draft.cardInput).toEqual(matchDayDraftInput(slide));
      expect(draft.cardInput).toEqual(LEGACY[i]);
    }
    expect(carousel[rows[0].id]).toMatchObject({
      grade: "A Grade",
      roundLabel: "ROUND 3",
      opposition: { name: "White Knights Baldivis", monogram: "WK" },
      venue: "Halls Head Oval",
      junior: false,
    });
    expect(carousel[rows[1].id]).toMatchObject({ venue: "", roundLabel: "" });
    expect(JSON.stringify(carousel)).not.toMatch(/TBC/);
    // Match Day content replaces the legacy per-fixture inputs.
    expect(res.body.content).toEqual({});
  });

  it("a draft the sweep saved before the content pipeline is left exactly as it was", async () => {
    const f = rows[0];
    const before = await draftFor(f.id);
    // Re-saving the old input is a no-op: the draft is not refreshed or rewritten.
    const { action } = await upsertDraftByKey({
      tenantId,
      engine: "matchday",
      family: "matchday",
      sourceKey: matchDayKey(f.id),
      cardInput: LEGACY[0],
      appPath: "/fixtures",
      sourceImportedAt: NOW,
    });
    expect(action).toBe("unchanged");
    const result = await generateMatchDayDrafts(tenantId, NOW);
    expect(result).toMatchObject({ drafted: 0, refreshed: 0 });
    const after = await draftFor(f.id);
    // Not a field of it changed: no refresh, no revision, no stale flag.
    expect(after).toEqual(before);
  });
});
