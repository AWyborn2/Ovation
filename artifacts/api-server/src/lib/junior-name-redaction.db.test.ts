/**
 * Round 3 retest, P0 2, end to end against a real database: build a junior
 * team list draft that names a child, make the child private, then read it
 * (editor, thumbnails, queue preview), download it (the still render) and
 * post it (the post render). The name, initial, role mark and shirt number are
 * withheld every time, though the stored draft still holds them.
 *
 * CI only: needs DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  adminsTable,
  db,
  juniorParticipantsTable,
  socialDraftsTable,
  tenantsTable,
} from "@workspace/db";

const stills: unknown[] = [];
vi.mock("./card-video-renderer", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    renderCardStill: async (input: unknown) => {
      stills.push(input);
      return { buffer: Buffer.from("png"), contentType: "image/png", warnings: [] };
    },
  };
});

const { default: app } = await import("../app");
const { encodeSession, SESSION_COOKIE } = await import("./auth");
const { renderDraftSlides, setStillRenderer } = await import("./draft-render");

const STAMP = Date.now();
const COHEN = randomUUID().toLowerCase();
let tenantId: number;
let draftId: number;
let cookie: string;

type Row = Record<string, unknown>;
const card = () => ({
  kind: "teamList",
  junior: true,
  numbering: "shirt",
  gradeRound: "YEAR 9",
  players: [
    { order: 1, surname: "BULLER", firstInitial: "C", role: "C", shirtNumber: 8 },
    { order: 2, surname: "GALLASH", firstInitial: "O", shirtNumber: 3 },
  ],
});
const players = (input: unknown) => (input as { players: Row[] }).players;

function expectWithheld(input: unknown) {
  const [cohen, ollie] = players(input);
  expect(cohen).toEqual({ order: 1, surname: "PRIVATE PLAYER" });
  expect(ollie).toMatchObject({ surname: "GALLASH", firstInitial: "O", shirtNumber: 3 });
  expect(JSON.stringify(input)).not.toMatch(/buller/i);
}

describe.skipIf(!process.env.DATABASE_URL)(
  "a junior made private after the draft was built",
  () => {
    beforeAll(async () => {
      process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-junior-redaction";
      const [t] = await db
        .insert(tenantsTable)
        .values({
          slug: `jr-redact-${STAMP}`,
          centralClubId: 8_900_000 + (STAMP % 100_000),
          name: "Jr Redact",
          plan: "pro",
        })
        .returning();
      tenantId = t!.id;
      const [admin] = await db
        .insert(adminsTable)
        .values({ tenantId, username: `jr_redact_${STAMP}`, displayName: "A", passwordHash: "x" })
        .returning();
      cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin!.id, issuedAt: Date.now() })}`;
      await db.insert(juniorParticipantsTable).values({
        tenantId,
        participantId: COHEN,
        displayName: "Cohen Buller",
        isPrivate: false,
      });
      // Built while Cohen was public: the stored card names him.
      const [d] = await db
        .insert(socialDraftsTable)
        .values({
          tenantId,
          engine: "teamList",
          status: "awaiting_review",
          sourceKind: "teamList",
          sourceKey: `jr-redact-${STAMP}`,
          sourceMatchIsJunior: true,
          cardInput: card(),
        })
        .returning();
      draftId = d!.id;
      // Then Cohen is made private.
      await db
        .update(juniorParticipantsTable)
        .set({ isPrivate: true })
        .where(eq(juniorParticipantsTable.participantId, COHEN));
    });

    afterAll(async () => {
      setStillRenderer(null);
      await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
      await db
        .delete(juniorParticipantsTable)
        .where(eq(juniorParticipantsTable.tenantId, tenantId));
      await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantId));
    });

    it("the stored draft still names him (nothing is rewritten in place)", async () => {
      const [row] = await db
        .select()
        .from(socialDraftsTable)
        .where(eq(socialDraftsTable.id, draftId));
      expect(players(row!.cardInput)[0]).toMatchObject({ surname: "BULLER", shirtNumber: 8 });
    });

    it("render: the editor's and the queue's reads withhold him", async () => {
      const one = await request(app)
        .get(`/api/social-drafts/${draftId}`)
        .set("Cookie", cookie)
        .set("x-tenant-id", String(tenantId));
      expect(one.status).toBe(200);
      expectWithheld(one.body.cardInput);
      const list = await request(app)
        .get("/api/social-drafts")
        .set("Cookie", cookie)
        .set("x-tenant-id", String(tenantId));
      expect(list.status).toBe(200);
      expectWithheld(list.body.find((d: { id: number }) => d.id === draftId).cardInput);
    });

    it("export: a download from a tab still holding his name withholds him", async () => {
      stills.length = 0;
      const res = await request(app)
        .post("/api/card-renders/still")
        .set("Cookie", cookie)
        .set("x-tenant-id", String(tenantId))
        .send({ input: card(), options: { size: "square", junior: true, sponsorsOn: true } });
      expect(res.status).toBe(200);
      expect(stills).toHaveLength(1);
      expectWithheld(stills[0]);
    });

    it("post: the post render withholds him", async () => {
      const drawn: unknown[] = [];
      setStillRenderer(async (input) => {
        drawn.push(input);
        return { buffer: Buffer.from("png"), contentType: "image/png", warnings: [] };
      });
      const [row] = await db
        .select()
        .from(socialDraftsTable)
        .where(eq(socialDraftsTable.id, draftId));
      await renderDraftSlides(row!, ["square"], null, {
        error: () => {},
        warn: () => {},
        info: () => {},
      } as never);
      expect(drawn.length).toBeGreaterThan(0);
      for (const input of drawn) expectWithheld(input);
    });
  },
);
