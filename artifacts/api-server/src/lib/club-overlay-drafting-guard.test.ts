/**
 * KTD8 guard: the Social Studio DRAFTING paths never read the club layer.
 *
 * A club's history boundary, history import or correction changes what its
 * public pages show. It must never draft (or re-draft) a social card: a
 * boundary would un-count old matches, a history import would cross a hundred
 * career milestones at once, and a correction would re-fire a century card.
 * So the draft sweep, the round-up, the achievement drafter and the
 * match-summary drafter keep reading plain central data with only the
 * IDENTITY slice of the overlay (crosswalk + confirmed merges), and the club
 * overlay is wired only into request-driven public reads.
 *
 * This test pins that from the source: a drafting module may import
 * `loadClubIdentity` (and its types) from the overlay and nothing else, and may
 * not name any club-layer loader, view or table. If you are adding one of
 * these to a drafting path on purpose, you are changing KTD8 — do it with the
 * sweep watermark advanced past existing matches, and update this list.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Drafting modules, by name (so a new drafter is covered the day it lands). */
const DRAFTING = /(draft|roundup|round-up|achievement|sweep|post-commit-social)/i;
/** Named explicitly as well: these must exist, so a rename can't empty the list. */
const MUST_COVER = [
  "lib/draft-sweep.ts",
  "lib/roundup.ts",
  "lib/roundup-central.ts",
  "lib/central-achievements.ts",
  "lib/match-summary-drafter.ts",
  "lib/draft-featured-player.ts",
  "lib/post-commit-social.ts",
  "lib/engines/match-day.ts",
  "lib/engines/team-list.ts",
  "routes/internal-draft-sweep.ts",
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(SRC, p).replace(/\\/g, "/");
const all = [...sourceFiles(join(SRC, "lib")), ...sourceFiles(join(SRC, "routes"))];
const drafting = all.filter(
  (p) =>
    MUST_COVER.includes(rel(p)) ||
    rel(p).startsWith("lib/engines/") ||
    DRAFTING.test(rel(p).split("/").pop()!),
);

/** Anything that reads or applies the club layer (boundary, history, corrections). */
const CLUB_LAYER = [
  "club-overlay-surfaces",
  "loadClubOverlay",
  "loadClubOverlayData",
  "buildClubStats",
  "applyClubOverlay",
  "resolveClubCorrections",
  "resolveCorrections",
  "overlayMilestones",
  "clubMilestoneOverlay",
  "loadCentralMatchDetailWithOverlay",
  "loadMatchDetailForSource",
  "loadMatchDetailForRequest",
  "loadGradeLeaderboard",
  "loadGradeDistribution",
  "loadVsClub",
  "centralPlayerPartials",
  "centralParticipantMatchLines",
  "clubHistoryRowsTable",
  "clubHistoryBoundariesTable",
  "clubHistoryBatchesTable",
  "clubCorrectionsTable",
];

/** The names a file imports from the overlay module (static and dynamic imports). */
function overlayImports(source: string): string[] {
  const names: string[] = [];
  const re =
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'](?:\.\.?\/)+(?:lib\/)?club-overlay["']/g;
  for (const m of source.matchAll(re)) {
    for (const part of m[1]!.split(",")) {
      const name = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]!
        .trim();
      if (name) names.push(name);
    }
  }
  if (/import\(\s*["'](?:\.\.?\/)+(?:lib\/)?club-overlay["']\s*\)/.test(source)) {
    names.push("<dynamic import>");
  }
  return names;
}

const ALLOWED_FROM_OVERLAY = new Set(["loadClubIdentity", "buildClubIdentity", "ClubIdentity"]);

describe("KTD8: the drafting paths are untouched by the club overlay", () => {
  it("covers every drafting module", () => {
    const covered = drafting.map(rel);
    for (const f of MUST_COVER) expect(covered, f).toContain(f);
    // The overlay itself is not a drafter, whatever it is called.
    expect(covered).not.toContain("lib/club-overlay.ts");
    expect(covered).not.toContain("lib/club-overlay-surfaces.ts");
  });

  it.each(drafting.map((p) => [rel(p), p] as const))(
    "%s reads no boundary, club history or correction",
    (_name, path) => {
      const source = readFileSync(path, "utf8");
      const used = CLUB_LAYER.filter((token) => source.includes(token));
      expect(used).toEqual([]);
      const fromOverlay = overlayImports(source).filter((n) => !ALLOWED_FROM_OVERLAY.has(n));
      expect(fromOverlay).toEqual([]);
    },
  );

  it("the drafters' match read is the plain central one, not the overlaid public one", () => {
    const matchDetail = readFileSync(join(SRC, "lib/match-detail.ts"), "utf8");
    // `loadCentralMatchDetail` (what the drafters call) loads only the identity…
    const plain = /export async function loadCentralMatchDetail\([\s\S]*?\r?\n}\r?\n/.exec(
      matchDetail,
    );
    expect(plain?.[0]).toBeTruthy();
    expect(plain![0]).toContain("loadClubIdentity");
    expect(plain![0]).not.toMatch(/loadClubOverlay|resolveClubCorrections|beforeBoundary/);
    // …and the public match page goes through the overlaid entry point.
    expect(matchDetail).toMatch(
      /loadMatchDetailForSource[\s\S]*?return loadCentralMatchDetailWithOverlay\(source, matchId\)/,
    );
    for (const drafter of ["lib/match-summary-drafter.ts", "lib/draft-featured-player.ts"]) {
      const source = readFileSync(join(SRC, drafter), "utf8");
      expect(source, drafter).toMatch(/\bloadCentralMatchDetail\(/);
    }
  });
});
