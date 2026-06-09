import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  db,
  partnershipRecordsTable,
  partnerships50PlusTable,
  centuriesTable,
  fiveWicketHaulsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

// Lightweight integration tests for the read-only historical record surfaces.
// They run against the live dev DB, so every row is tagged with a unique grade
// label and cleaned up afterwards. Asserting against that isolated grade lets us
// lock the route's ordering (and the id tie-breaker) without depending on the
// rest of the seeded data.

const TAG = `ZZTEST_${Date.now()}`;
const PARTNERSHIP_GRADE = `${TAG}_PARTNERSHIPS`;
const CENTURY_GRADE = `${TAG}_CENTURIES`;
const HAUL_GRADE = `${TAG}_HAULS`;

describe("historical records routes (integration)", () => {
  beforeAll(async () => {
    // Partnership records: same grade, varying runs (and a runs tie) so we can
    // assert runs DESC then id ASC.
    await db.insert(partnershipRecordsTable).values([
      { grade: PARTNERSHIP_GRADE, wicket: "1st", runs: 100, batsmen: "Low Stand" },
      { grade: PARTNERSHIP_GRADE, wicket: "2nd", runs: 200, batsmen: "High A" },
      { grade: PARTNERSHIP_GRADE, wicket: "3rd", runs: 200, batsmen: "High B" },
    ]);

    // 50+ list: ordered purely by runs DESC then id ASC.
    await db.insert(partnerships50PlusTable).values([
      { grade: PARTNERSHIP_GRADE, wicket: "1st", runs: 60, batsmen: "Fifty A" },
      { grade: PARTNERSHIP_GRADE, wicket: "2nd", runs: 60, batsmen: "Fifty B" },
      { grade: PARTNERSHIP_GRADE, wicket: "3rd", runs: 90, batsmen: "Ninety" },
    ]);

    // Centuries: ordered grade ASC, batsman ASC, id ASC. Two rows share a batsman
    // so the id tie-breaker is exercised.
    await db.insert(centuriesTable).values([
      { grade: CENTURY_GRADE, batsman: "Bravo", score: "120" },
      { grade: CENTURY_GRADE, batsman: "Alpha", score: "150" },
      { grade: CENTURY_GRADE, batsman: "Alpha", score: "101" },
    ]);

    // Five-wicket hauls: ordered grade ASC, bowler ASC, id ASC. Two rows share a
    // bowler so the id tie-breaker is exercised.
    await db.insert(fiveWicketHaulsTable).values([
      { grade: HAUL_GRADE, bowler: "Yankee", figures: "5/20" },
      { grade: HAUL_GRADE, bowler: "Xray", figures: "6/15" },
      { grade: HAUL_GRADE, bowler: "Xray", figures: "5/30" },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(partnershipRecordsTable)
      .where(eq(partnershipRecordsTable.grade, PARTNERSHIP_GRADE));
    await db
      .delete(partnerships50PlusTable)
      .where(eq(partnerships50PlusTable.grade, PARTNERSHIP_GRADE));
    await db.delete(centuriesTable).where(eq(centuriesTable.grade, CENTURY_GRADE));
    await db.delete(fiveWicketHaulsTable).where(eq(fiveWicketHaulsTable.grade, HAUL_GRADE));
  });

  describe("GET /api/partnerships", () => {
    it("returns { records, fiftyPlus } arrays with the expected shape", async () => {
      const res = await request(app).get("/api/partnerships");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.records)).toBe(true);
      expect(Array.isArray(res.body.fiftyPlus)).toBe(true);

      const mine = res.body.records.filter(
        (r: { grade: string }) => r.grade === PARTNERSHIP_GRADE,
      );
      expect(mine).toHaveLength(3);
      expect(mine[0]).toMatchObject({
        id: expect.any(Number),
        grade: PARTNERSHIP_GRADE,
        wicket: expect.any(String),
        runs: expect.any(Number),
        batsmen: expect.any(String),
      });
      expect(mine[0]).toHaveProperty("opposition");
      expect(mine[0]).toHaveProperty("season");
    });

    it("orders records by runs DESC then id ASC within a grade", async () => {
      const res = await request(app).get("/api/partnerships");
      const mine = res.body.records.filter(
        (r: { grade: string }) => r.grade === PARTNERSHIP_GRADE,
      );
      // 200 (High A) before 200 (High B) before 100 (Low Stand): runs DESC, id ASC tie-break.
      expect(mine.map((r: { batsmen: string }) => r.batsmen)).toEqual([
        "High A",
        "High B",
        "Low Stand",
      ]);
      const tied = mine.filter((r: { runs: number }) => r.runs === 200);
      expect(tied[0].id).toBeLessThan(tied[1].id);
    });

    it("orders fiftyPlus by runs DESC then id ASC", async () => {
      const res = await request(app).get("/api/partnerships");
      const mine = res.body.fiftyPlus.filter(
        (r: { grade: string }) => r.grade === PARTNERSHIP_GRADE,
      );
      expect(mine.map((r: { batsmen: string }) => r.batsmen)).toEqual([
        "Ninety",
        "Fifty A",
        "Fifty B",
      ]);
      const tied = mine.filter((r: { runs: number }) => r.runs === 60);
      expect(tied[0].id).toBeLessThan(tied[1].id);
    });
  });

  describe("GET /api/centuries", () => {
    it("returns an array with the expected shape", async () => {
      const res = await request(app).get("/api/centuries");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const mine = res.body.filter(
        (r: { grade: string }) => r.grade === CENTURY_GRADE,
      );
      expect(mine).toHaveLength(3);
      expect(mine[0]).toMatchObject({
        id: expect.any(Number),
        grade: CENTURY_GRADE,
        batsman: expect.any(String),
      });
      expect(mine[0]).toHaveProperty("score");
      expect(mine[0]).toHaveProperty("season");
      expect(mine[0]).toHaveProperty("playerId");
    });

    it("orders by batsman ASC then id ASC within a grade", async () => {
      const res = await request(app).get("/api/centuries");
      const mine = res.body.filter(
        (r: { grade: string }) => r.grade === CENTURY_GRADE,
      );
      // Alpha before Bravo; the two Alpha rows fall back to id ASC.
      expect(mine.map((r: { batsman: string }) => r.batsman)).toEqual([
        "Alpha",
        "Alpha",
        "Bravo",
      ]);
      const alphas = mine.filter((r: { batsman: string }) => r.batsman === "Alpha");
      expect(alphas[0].id).toBeLessThan(alphas[1].id);
    });
  });

  describe("GET /api/five-wicket-hauls", () => {
    it("returns an array with the expected shape", async () => {
      const res = await request(app).get("/api/five-wicket-hauls");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const mine = res.body.filter((r: { grade: string }) => r.grade === HAUL_GRADE);
      expect(mine).toHaveLength(3);
      expect(mine[0]).toMatchObject({
        id: expect.any(Number),
        grade: HAUL_GRADE,
        bowler: expect.any(String),
      });
      expect(mine[0]).toHaveProperty("figures");
      expect(mine[0]).toHaveProperty("season");
      expect(mine[0]).toHaveProperty("playerId");
    });

    it("orders by bowler ASC then id ASC within a grade", async () => {
      const res = await request(app).get("/api/five-wicket-hauls");
      const mine = res.body.filter((r: { grade: string }) => r.grade === HAUL_GRADE);
      // Xray before Yankee; the two Xray rows fall back to id ASC.
      expect(mine.map((r: { bowler: string }) => r.bowler)).toEqual([
        "Xray",
        "Xray",
        "Yankee",
      ]);
      const xrays = mine.filter((r: { bowler: string }) => r.bowler === "Xray");
      expect(xrays[0].id).toBeLessThan(xrays[1].id);
    });
  });
});
