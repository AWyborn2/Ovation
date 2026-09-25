/**
 * The pure parts of the card photo pick: the per-draft random choice and the
 * grade a stored draft is picked for. Mocked unit test (no database).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {} }));
vi.mock("./social-cards-helpers", () => ({ DEFAULT_TEMPLATES: [] }));
vi.mock("./photo-store", () => ({ objectUrl: (p: string) => `/api/storage${p}` }));

import { draftPhotoGrade, seededPick } from "./draft-enrich";

const rows = [1, 2, 3, 4, 5, 6].map((id) => ({ id }));

describe("seededPick", () => {
  it("gives a draft the same photo every time", () => {
    for (const seed of ["matchSummary:senior:41", "teamlist:9", "draft:3"]) {
      expect(seededPick(rows, seed)).toBe(seededPick(rows, seed));
    }
  });

  it("spreads different drafts across the grade's photos", () => {
    const picked = new Set(
      Array.from({ length: 30 }, (_, i) => seededPick(rows, `matchSummary:senior:${i}`).id),
    );
    expect(picked.size).toBeGreaterThan(2);
  });

  it("only moves a draft when a new photo wins it", () => {
    const withNew = [{ id: 7 }, ...rows];
    for (let i = 0; i < 30; i++) {
      const seed = `roundup:${i}`;
      const next = seededPick(withNew, seed).id;
      expect([seededPick(rows, seed).id, 7]).toContain(next);
    }
  });

  it("with no seed, takes the newest (first) photo", () => {
    expect(seededPick(rows, null).id).toBe(1);
  });
});

describe("draftPhotoGrade", () => {
  it("reads the card's grade, or a match result's grade from its title", () => {
    expect(draftPhotoGrade({ kind: "teamList", grade: "B Grade" })).toBe("B Grade");
    expect(draftPhotoGrade({ kind: "matchSummary", matchTitle: "A Grade • Round 3" })).toBe(
      "A Grade",
    );
    expect(draftPhotoGrade({ kind: "matchSummary", matchTitle: "" })).toBeNull();
    expect(draftPhotoGrade({ kind: "milestone" })).toBeNull();
  });
});
