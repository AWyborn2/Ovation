import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { DEFAULT_TEMPLATES } from "./social-cards";

describe("social-cards: DEFAULT_TEMPLATES brand-leak regression (Phase 4 U1)", () => {
  it("seeds no tenant-specific club nickname into a fresh tenant's default caption templates", () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(t.template).not.toContain("Hammers");
      expect(t.template).not.toContain("Halls Head");
      expect(t.template).not.toContain("HHCC");
    }
  });

  it("rewrites an old seeded template to today's default exactly (migration 0078)", () => {
    const sql = readFileSync(
      fileURLToPath(
        new URL("../../../../lib/db/migrations/0078_caption_seed_nickname.sql", import.meta.url),
      ),
      "utf8",
    );
    const unescape = (s: string) => s.replace(/\\n/g, "\n").replace(/''/g, "'");
    const updates = [
      ...sql.matchAll(
        /SET "template" = E'((?:[^']|'')*)'[\s\S]*?"engine" = '(\w+)'\s+AND "platform" = '(\w+)'\s+AND "template" = E'((?:[^']|'')*)'/g,
      ),
    ];
    expect(updates).toHaveLength(2);
    for (const [, next, engine, platform, old] of updates) {
      const seed = DEFAULT_TEMPLATES.find((t) => t.engine === engine && t.platform === platform);
      expect(unescape(next!)).toBe(seed?.template);
      expect(unescape(old!)).toContain("for the Hammers");
    }
  });
});
