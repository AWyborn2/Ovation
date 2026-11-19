/**
 * Retest 6, sponsor check: a generic card's "Supported by" showed McDonalds
 * after the club changed that sponsor to 4 Life.
 *
 * A single card keeps no copy of the club's sponsors: the post render (and the
 * Studio preview, `useDraftContent`) reads the club's sponsors when the card is
 * drawn. So a card made after the change, and a card made before it, both show
 * the sponsor as it is now. A Round Team Lists set drawn with a set design
 * reads them the same way. Only a queued carousel (a Match Day / results set)
 * stores its slides, sponsors page included, when it is made.
 *
 * Real-DB test (needs DATABASE_URL); the still renderer is a fake that records
 * what each slide was drawn with.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  captionTemplatesTable,
  socialDraftsTable,
  socialSettingsTable,
  sponsorsTable,
  tenantsTable,
  type SocialDraftRow,
} from "@workspace/db";
import { renderDraftSlides, setStillRenderer } from "./draft-render";
import { logger } from "./logger";

const STAMP = Date.now();
let tenantId: number;
let sponsorId: number;

type Drawn = { input: Record<string, unknown>; data: { sponsors?: Array<{ name: string }> } };
const drawn: Drawn[] = [];

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `sponsor-change-${STAMP}`,
      centralClubId: 9981,
      name: "Sponsor Club",
      plan: "pro",
    })
    .returning();
  tenantId = t!.id;
  await db.insert(socialSettingsTable).values({ tenantId, sponsorsEnabled: true });
  const [s] = await db
    .insert(sponsorsTable)
    .values({ tenantId, name: "McDonalds", logoUrl: "https://cdn.example.org/mcd.png" })
    .returning();
  sponsorId = s!.id;
  setStillRenderer(async (input, options) => {
    drawn.push({
      input: input as Record<string, unknown>,
      data: (options as { data: Drawn["data"] }).data,
    });
    return { buffer: Buffer.from("png"), contentType: "image/png" };
  });
});

afterEach(() => {
  drawn.length = 0;
});

afterAll(async () => {
  setStillRenderer(null);
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(sponsorsTable).where(eq(sponsorsTable.tenantId, tenantId));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

async function draft(
  over: Partial<typeof socialDraftsTable.$inferInsert>,
): Promise<SocialDraftRow> {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId,
      engine: "adhoc",
      status: "awaiting_review",
      cardInput: { kind: "announcement", headline: "Club news" },
      packId: "blank",
      ...over,
    })
    .returning();
  return row!;
}

const names = (d: Drawn) => (d.data.sponsors ?? []).map((s) => s.name);

/** The club renames its sponsor (McDonalds → 4 Life), as Admin → Sponsors saves it. */
const changeSponsor = () =>
  db
    .update(sponsorsTable)
    .set({ name: "4 Life", logoUrl: "https://cdn.example.org/4life.png" })
    .where(eq(sponsorsTable.id, sponsorId));

describe("a sponsor change reaches single cards and new sets (retest 6)", () => {
  it("a single card made before the change, and one made after, both show the new sponsor", async () => {
    const before = await draft({});
    await renderDraftSlides(before, ["square"], null, logger);
    expect(names(drawn[0]!)).toEqual(["McDonalds"]);
    drawn.length = 0;

    await changeSponsor();
    const after = await draft({});
    await renderDraftSlides(after, ["square"], null, logger);
    await renderDraftSlides(before, ["square"], null, logger);
    expect(drawn.map(names)).toEqual([["4 Life"], ["4 Life"]]);
    // Nothing about the sponsor was stored on either card.
    for (const id of [before.id, after.id]) {
      const [row] = await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id));
      expect(JSON.stringify(row)).not.toMatch(/McDonalds|4 Life/);
    }
  });

  it("a team's own sponsor moved to 4 Life shows on that team's list made after", async () => {
    await db.update(sponsorsTable).set({ grades: [] }).where(eq(sponsorsTable.id, sponsorId));
    const [mcd] = await db
      .insert(sponsorsTable)
      .values({
        tenantId,
        name: "McDonalds",
        logoUrl: "https://cdn.example.org/mcd.png",
        grades: ["A Grade"],
      })
      .returning();
    // The club gives A Grade's sponsorship to 4 Life.
    await db.update(sponsorsTable).set({ grades: [] }).where(eq(sponsorsTable.id, mcd!.id));
    await db
      .update(sponsorsTable)
      .set({ grades: ["A Grade"] })
      .where(eq(sponsorsTable.id, sponsorId));
    const list = await draft({
      cardInput: {
        kind: "teamList",
        grade: "A Grade",
        players: [{ order: 1, firstInitial: "J", surname: "YOUNG" }],
      },
    });
    await renderDraftSlides(list, ["square"], null, logger);
    expect(names(drawn[0]!)).toEqual(["4 Life"]);
  });

  it("a new Round Team Lists set draws its sponsors page with the sponsors as they are now", async () => {
    const page = (id: string, slot: string, kind: string, p: string) => ({
      id,
      role: slot === "team" ? "repeat" : "fixed",
      slot,
      kind,
      page: p,
      layers: [
        {
          id: `${id}-1`,
          kind: "text",
          content: id,
          geometry: { square: { x: 0, y: 0, w: 50, h: 10 } },
        },
      ],
    });
    const set = await draft({
      engine: "teamlists-round",
      templateVersion: 1,
      cardInput: {
        kind: "teamListRound",
        roundLabel: "Round 6",
        date: "SAT 15 NOV",
        teams: [{ grade: "B Grade", players: [{ order: 1, surname: "HEAD" }] }],
      },
      adjustments: {
        formatVersion: 2,
        set: "teamLists",
        pages: [
          page("cover", "cover", "teamListRound", "card"),
          page("team", "team", "teamList", "team"),
          page("sponsors", "sponsors", "matchDay", "sponsors"),
        ],
      },
    });
    await renderDraftSlides(set, ["square"], null, logger);
    const sponsorsSlide = drawn.find(
      (d) => (d.input.carouselPage as { page?: string } | undefined)?.page === "sponsors",
    );
    expect(sponsorsSlide).toBeDefined();
    const listed = (sponsorsSlide!.input.carouselPage as { sponsors: Array<{ name: string }> })
      .sponsors;
    expect(listed.map((s) => s.name)).toContain("4 Life");
  });
});
