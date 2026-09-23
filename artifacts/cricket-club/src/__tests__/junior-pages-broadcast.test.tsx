import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { screen, cleanup } from "@testing-library/react";
import JuniorsPremierships from "@/pages/juniors-premierships";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SRC = join(__dirname, "..");
const juniorFiles = [
  ...readdirSync(join(SRC, "pages"))
    .filter((f) => f.startsWith("juniors-") && f.endsWith(".tsx"))
    .map((f) => join(SRC, "pages", f)),
  ...readdirSync(join(SRC, "components", "junior-stats"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(SRC, "components", "junior-stats", f)),
  join(SRC, "components", "scorecard", "junior-scorecard.tsx"),
];

describe("junior pages (Broadcast U13)", () => {
  it("carry no raw hex colours — theme tokens only", () => {
    for (const file of juniorFiles) {
      const src = readFileSync(file, "utf8");
      expect({ file, hex: src.match(/#[0-9a-fA-F]{6}\b/g) }).toEqual({ file, hex: null });
    }
  });

  it("carry no Halls Head literals", () => {
    for (const file of juniorFiles) {
      expect({ file, hit: /hhcc|halls head/i.test(readFileSync(file, "utf8")) }).toEqual({
        file,
        hit: false,
      });
    }
  });

  it("read only juniors data hooks (juniors isolation)", () => {
    // The one sanctioned senior read is the junior player page's link to the
    // same person's senior career — a cross-link, never a blended stat.
    const allowed = new Set(["useGetPlayer"]);
    for (const file of juniorFiles) {
      const hooks = readFileSync(file, "utf8").match(/\buse(Get|List)[A-Z]\w+/g) ?? [];
      const senior = hooks.filter((h) => !/Junior/.test(h) && !allowed.has(h));
      expect({ file, senior }).toEqual({ file, senior: [] });
    }
  });
});

describe("Juniors premierships", () => {
  it("renders the empty state when there are none", async () => {
    installApiMock({ "/api/juniors/premierships": [] });
    renderAt(<JuniorsPremierships />, "/juniors/premierships");
    expect(await screen.findByText("No junior premierships found")).toBeTruthy();
  });
});
