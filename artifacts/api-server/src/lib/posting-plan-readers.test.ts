/**
 * Reader guard (plan 2026-10-07-001 KTD2): drafting decisions go through
 * lib/posting-plan.ts. No other server module may read the legacy family
 * switches or round-schedule modes to decide what drafts.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "..");

/** Modules allowed to read the legacy columns: the resolver itself and the settings plumbing. */
const ALLOWED = new Set([
  "lib/posting-plan.ts",
  "lib/social-families.ts",
  "lib/round-schedules.ts",
  "routes/social-cards.ts",
]);

/** A test adapter: buildAchievementDrafts still accepts a family config from its unit tests. */
const ALLOWED_LINES = [/familyAllows\(allowed, "achievements", grade, false\)/];

const LEGACY = [
  /familyAllows\(/,
  /resolveFamilyConfig\(/,
  /\.engineMatchSummary\b/,
  /\.engineMilestone\b/,
  /\.engineRoundUp\b/,
  /\bmatchSummaryGradeConfig\b/,
  /matchResultCardsOn\(/,
  /roundResultsCarouselOn\(/,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

describe("Posting Plan reader guard", () => {
  it("no drafting module reads the legacy switches directly", () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, "").trim();
          if (code.startsWith("*") || code.startsWith("/*")) return;
          if (ALLOWED_LINES.some((re) => re.test(code))) return;
          if (LEGACY.some((re) => re.test(code))) offenders.push(`${rel}:${i + 1}: ${code}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
