import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { db, adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type BoardDisplay = {
  columns: number;
  transition: "scroll" | "slide";
  fit: boolean;
};
type Board = {
  id: string;
  category: string;
  layout: string;
  title: string;
  subtitle?: string | null;
  entries: Array<{ primaryText: string; detail?: string | null; season?: string }>;
  columns?: Array<{ heading: string; entries: unknown[] }> | null;
  display?: BoardDisplay;
};
type Bundle = {
  boards: Board[];
  settings: {
    boardConfigs: Record<string, unknown>;
    composites: unknown[];
  };
};

describe("honour display: Most Games board, display stamps, composites (integration)", () => {
  let adminId: number;
  let adminCookie: string;
  let originalBoardConfigs: Record<string, unknown> = {};
  let originalComposites: unknown[] = [];

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-honour-display-kiosk";

    const [admin] = await db
      .insert(adminsTable)
      .values({
        username: `test_admin_hdk_${Date.now()}`,
        displayName: "Test Admin HDK",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;

    // Capture the singleton settings so we can restore them afterwards.
    const res = await request(app)
      .get("/api/honour-display")
      .set("Cookie", adminCookie)
      .expect(200);
    originalBoardConfigs = (res.body as Bundle).settings.boardConfigs ?? {};
    originalComposites = (res.body as Bundle).settings.composites ?? [];
  });

  afterAll(async () => {
    // Restore the singleton settings row to its original state.
    await request(app)
      .patch("/api/honour-display-settings")
      .set("Cookie", adminCookie)
      .send({ boardConfigs: originalBoardConfigs, composites: originalComposites });
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  });

  it("rejects the bundle without an admin session", async () => {
    await request(app).get("/api/honour-display").expect(401);
  });

  it("includes a Most Games board and stamps display on every board", async () => {
    const res = await request(app)
      .get("/api/honour-display")
      .set("Cookie", adminCookie)
      .expect(200);
    const bundle = res.body as Bundle;

    const mostGames = bundle.boards.find((b) => b.id === "most_games");
    expect(mostGames).toBeDefined();
    expect(mostGames!.layout).toBe("list");
    expect(mostGames!.entries.length).toBeGreaterThan(0);
    // Every entry should name a player and report a games count.
    for (const e of mostGames!.entries) {
      expect(e.primaryText.length).toBeGreaterThan(0);
      expect(e.detail ?? "").toMatch(/games/);
    }

    // Every board carries a resolved display stamp.
    for (const b of bundle.boards) {
      expect(b.display).toBeDefined();
      expect(typeof b.display!.columns).toBe("number");
      expect(["scroll", "slide"]).toContain(b.display!.transition);
      expect(typeof b.display!.fit).toBe("boolean");
    }
  });

  it("round-trips boardConfigs + composites and reflects them in the bundle", async () => {
    const compositeId = `composite:${randomUUID()}`;
    const patchRes = await request(app)
      .patch("/api/honour-display-settings")
      .set("Cookie", adminCookie)
      .send({
        boardConfigs: {
          most_games: { columns: 3, transition: "slide", fit: true },
        },
        composites: [
          {
            id: compositeId,
            title: "Smoke Composite",
            subtitle: "test",
            seasonAligned: false,
            transition: "slide",
            fit: true,
            columns: [
              // "approaching" is a non-composite ref and must be filtered out.
              { boardId: "approaching", heading: "Nope" },
              { boardId: "most_games", heading: "Games" },
            ],
          },
        ],
      })
      .expect(200);
    expect(
      (patchRes.body.boardConfigs.most_games as BoardDisplay).columns,
    ).toBe(3);
    expect((patchRes.body.composites as unknown[]).length).toBe(1);

    const res = await request(app)
      .get("/api/honour-display")
      .set("Cookie", adminCookie)
      .expect(200);
    const bundle = res.body as Bundle;

    // boardConfigs override is reflected on the Most Games board's display.
    const mostGames = bundle.boards.find((b) => b.id === "most_games");
    expect(mostGames!.display).toEqual({
      columns: 3,
      transition: "slide",
      fit: true,
    });

    // The composite board is assembled as a columns board, with the invalid
    // "approaching" ref filtered out (only the valid most_games column remains).
    const composite = bundle.boards.find((b) => b.id === compositeId);
    expect(composite).toBeDefined();
    expect(composite!.layout).toBe("columns");
    expect(composite!.title).toBe("Smoke Composite");
    expect(composite!.columns).toBeDefined();
    expect(composite!.columns!.length).toBe(1);
    expect(composite!.columns![0]!.heading).toBe("Games");
    expect(composite!.columns![0]!.entries.length).toBeGreaterThan(0);
    // Composite boards carry their own transition/fit (columns layout always 1).
    expect(composite!.display).toEqual({
      columns: 1,
      transition: "slide",
      fit: true,
    });
  });
});
