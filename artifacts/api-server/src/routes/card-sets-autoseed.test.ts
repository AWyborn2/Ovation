import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
// Import via the `./schema` entrypoint (NOT `@workspace/db`) so the DB pool
// module — which throws without DATABASE_URL — is never loaded. Keeps this a
// pure, DB-free schema/contract/mapping round-trip.
import { socialSettingsTable } from "@workspace/db/schema";
import { AutoseedCardSetBody } from "@workspace/api-zod";
import {
  deriveAutoseedGroups,
  type AutoseedDraft,
} from "../lib/social-cards-generate";

/**
 * C4 — auto-seed a carousel from a round's APPROVED match-summary drafts:
 * schema + OpenAPI contract + pure grouping round-trip. DB-free.
 *
 * Asserts (1) the `social_settings` table carries the `autoseed_carousels`
 * toggle (boolean, NOT NULL, default false — dormant), (2) the generated Zod
 * `AutoseedCardSetBody` round-trips the endpoint contract (incl. the junior
 * default), and (3) the pure `deriveAutoseedGroups` derivation groups drafts by
 * (junior, season, round, grade) with junior isolation and stable ordering. The
 * upsert + match lookup are exercised against a live DB in
 * card-sets-autoseed-integration.test.ts.
 */

describe("C4 autoseed — social_settings.autoseed_carousels toggle", () => {
  const config = getTableConfig(socialSettingsTable);

  it("adds a non-null boolean autoseed_carousels defaulting false (dormant)", () => {
    const col = config.columns.find((c) => c.name === "autoseed_carousels");
    expect(col, "autoseed_carousels column present").toBeTruthy();
    expect(col?.columnType).toContain("Boolean");
    expect(col?.notNull).toBe(true);
    expect(col?.hasDefault).toBe(true);
    expect(col?.default).toBe(false);
  });
});

describe("C4 autoseed — AutoseedCardSetBody contract", () => {
  it("round-trips a full body and applies the junior default", () => {
    const parsed = AutoseedCardSetBody.parse({
      season: 2025,
      round: 5,
      grade: "A Grade",
      platformSize: "square",
    });
    expect(parsed.season).toBe(2025);
    expect(parsed.round).toBe(5);
    expect(parsed.grade).toBe("A Grade");
    // junior is optional in the request but defaults to false.
    expect(parsed.junior).toBe(false);
    expect(parsed.platformSize).toBe("square");
  });

  it("rejects a missing required season/round/platformSize", () => {
    expect(AutoseedCardSetBody.safeParse({ round: 1, platformSize: "square" }).success).toBe(false);
    expect(AutoseedCardSetBody.safeParse({ season: 2025, platformSize: "square" }).success).toBe(false);
    expect(AutoseedCardSetBody.safeParse({ season: 2025, round: 1 }).success).toBe(false);
    expect(
      AutoseedCardSetBody.safeParse({ season: 2025, round: 1, platformSize: "wall" }).success,
    ).toBe(false);
  });
});

describe("C4 autoseed — deriveAutoseedGroups", () => {
  const draft = (
    over: Partial<AutoseedDraft> & Pick<AutoseedDraft, "id" | "sourceMatchId">,
  ): AutoseedDraft => ({
    junior: false,
    season: 2025,
    round: 5,
    grade: "A Grade",
    input: { kind: "matchSummary", matchId: over.sourceMatchId },
    ...over,
  });

  it("groups same (season, round, grade, junior) drafts into one carousel", () => {
    const groups = deriveAutoseedGroups([
      draft({ id: 1, sourceMatchId: 20 }),
      draft({ id: 2, sourceMatchId: 10 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].grade).toBe("A Grade");
    expect(groups[0].inputs).toHaveLength(2);
    // Ordered by sourceMatchId asc → match 10 before 20, deterministic slide ids.
    expect((groups[0].inputs[0] as { matchId: number }).matchId).toBe(10);
    expect((groups[0].inputs[1] as { matchId: number }).matchId).toBe(20);
  });

  it("splits distinct grades into separate carousels", () => {
    const groups = deriveAutoseedGroups([
      draft({ id: 1, sourceMatchId: 1, grade: "A Grade" }),
      draft({ id: 2, sourceMatchId: 2, grade: "B Grade" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.grade))).toEqual(new Set(["A Grade", "B Grade"]));
  });

  // In-memory grouping axis of juniors isolation: a junior and a senior draft
  // with an identical grade string never share a group. The STORAGE axis (junior
  // and senior sets get distinct dedupe rows via the "matchSummaryJunior"
  // sourceKind) is proven in card-sets-autoseed-integration.test.ts.
  it("NEVER blends junior and senior drafts, even with an identical grade string (juniors isolation)", () => {
    const groups = deriveAutoseedGroups([
      draft({ id: 1, sourceMatchId: 1, grade: "A Grade", junior: false }),
      draft({ id: 2, sourceMatchId: 2, grade: "A Grade", junior: true }),
    ]);
    expect(groups).toHaveLength(2);
    const senior = groups.find((g) => !g.junior);
    const junior = groups.find((g) => g.junior);
    expect(senior?.inputs).toHaveLength(1);
    expect(junior?.inputs).toHaveLength(1);
  });

  it("returns no groups for an empty draft set", () => {
    expect(deriveAutoseedGroups([])).toHaveLength(0);
  });
});
