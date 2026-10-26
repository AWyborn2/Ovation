/** The bundle fit check's selection and report (L2-B, T2.8). */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { TemplateFitReport } from "@workspace/scorecard/kind-templates";
import {
  checkFailed,
  gateFailures,
  readBundleTargets,
  renderReport,
  selectChanged,
  setReportFromParts,
  type FitTarget,
} from "./check-template-bundles-core";

const root = mkdtempSync(path.join(tmpdir(), "bundles-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function bundle(look: string, kind: string, document: unknown) {
  const dir = path.join(root, "lib", "template-bundles", look);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "look.json"), JSON.stringify({ name: look }));
  writeFileSync(
    path.join(dir, `${kind}.json`),
    JSON.stringify({ name: kind, version: 1, listed: true, document }, null, 2).replace(
      /\n/g,
      "\r\n",
    ),
  );
}

describe("reading the bundles", () => {
  it("lists every look's kinds in order, with their documents and hashes", () => {
    bundle("gold-foil", "player", { layers: [] });
    bundle("club-kit", "matchDay", { formatVersion: 2, pages: {} });
    bundle("club-kit", "ladder", { layers: [] });
    const targets = readBundleTargets(root);
    expect(targets.map((t) => t.id)).toEqual([
      "club-kit/ladder",
      "club-kit/matchDay",
      "gold-foil/player",
    ]);
    expect(targets[1]).toMatchObject({
      kind: "matchDay",
      document: { formatVersion: 2, pages: {} },
      file: "lib/template-bundles/club-kit/matchDay.json",
    });
    // Hashed with Unix line endings, as generate-index and CI hash them.
    expect(targets[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("finds none where there's no bundles folder", () => {
    expect(readBundleTargets(path.join(root, "nowhere"))).toEqual([]);
  });
});

describe("choosing what changed", () => {
  const targets: FitTarget[] = [
    {
      id: "club-kit/ladder",
      kind: "ladder",
      document: {},
      file: "lib/template-bundles/club-kit/ladder.json",
    },
    {
      id: "club-kit/player",
      kind: "player",
      document: {},
      file: "lib/template-bundles/club-kit/player.json",
    },
  ];

  it("checks only the bundle files that changed", () => {
    expect(
      selectChanged(targets, ["lib/template-bundles/club-kit/player.json", "README.md"]).map(
        (t) => t.id,
      ),
    ).toEqual(["club-kit/player"]);
    expect(selectChanged(targets, ["artifacts/api-server/src/app.ts"])).toEqual([]);
  });

  it("checks every bundle when the renderer, format or check changed", () => {
    for (const file of [
      "artifacts/cricket-club/src/lib/pack-render/adjustments.ts",
      "lib/scorecard/src/kind-templates/format.ts",
      "artifacts/cricket-club/src/components/pack-card.tsx",
      "scripts/src/check-template-bundles.ts",
    ])
      expect(selectChanged(targets, [file])).toHaveLength(2);
  });
});

describe("the report", () => {
  const report = (status: "pass" | "fail"): TemplateFitReport => ({
    kind: "player",
    status,
    variants: 8,
    issues:
      status === "pass"
        ? []
        : [
            {
              variant: "card.square.photo",
              page: "card",
              size: "square",
              reason: "overflow",
              layerId: "name",
            },
          ],
    renderer: "r",
    fonts: "f",
    checkedAt: "t",
  });
  const t = (id: string): FitTarget => ({ id, kind: "player", document: {} });

  it("lists each template's result and each failure's issues", () => {
    const checked = [
      { target: t("club-kit/player"), report: report("pass") },
      { target: t("gold-foil/player"), report: report("fail") },
      { target: t("sunset/player"), report: null, error: "harness timeout" },
    ];
    expect(checked.map(checkFailed)).toEqual([false, true, true]);
    const md = renderReport(checked, { selection: "every bundle" });
    expect(md).toContain("3 templates checked (every bundle); 2 failed.");
    expect(md).toContain("| club-kit/player | pass · 8 variants |");
    expect(md).toContain("## gold-foil/player");
    expect(md).toContain("- `card.square.photo` overflow (layer name)");
    expect(md).toContain("The check couldn't run: harness timeout.");
  });

  it("says when there was nothing to check", () => {
    expect(renderReport([], { selection: "changed since origin/main" })).toContain(
      "0 templates checked (changed since origin/main); 0 failed.",
    );
  });
});

describe("what fails the check", () => {
  const pass: TemplateFitReport = {
    kind: "player",
    status: "pass",
    variants: 8,
    issues: [],
    renderer: "r",
    fonts: "f",
    checkedAt: "t",
  };
  const fail: TemplateFitReport = { ...pass, status: "fail" };
  const t = (id: string, listed?: boolean): FitTarget => ({
    id,
    kind: "player",
    document: {},
    listed,
  });

  it("blocks on a listed bundle that fails, unless it's a known failure", () => {
    const gate = gateFailures(
      [
        { target: t("a/player", true), report: fail },
        { target: t("b/player", true), report: fail },
        { target: t("c/player", false), report: fail },
        { target: t("d/player", true), report: pass },
        { target: t("e/player", true), report: null, error: "timeout" },
        { target: t("starter:x/player"), report: fail },
      ],
      { "b/player": "known", "d/player": "fixed since" },
    );
    expect(gate.blocking.map((c) => c.target.id)).toEqual([
      "a/player",
      "e/player",
      "starter:x/player",
    ]);
    expect(gate.known.map((c) => c.target.id)).toEqual(["b/player"]);
    expect(gate.unlisted.map((c) => c.target.id)).toEqual(["c/player"]);
    expect(gate.nowPassing).toEqual(["d/player"]);
  });

  it("reads each bundle's listed flag", () => {
    bundle("neon-night", "player", { layers: [] });
    expect(readBundleTargets(root).find((x) => x.id === "neon-night/player")?.listed).toBe(true);
  });
});

describe("set templates (carousel set editor plan, part 1)", () => {
  const repo = path.resolve(__dirname, "../..");
  const all = readBundleTargets(repo);
  const sets = all.filter((t) => t.parts);

  it("lists four set templates for every look, each page a kind target of the look", () => {
    // A design system's looks (a `family`, Ovation Match Graphics) design one kind each,
    // so they assemble no sets.
    const family = (look: string) =>
      !!(
        JSON.parse(
          readFileSync(path.join(repo, "lib/template-bundles", look, "look.json"), "utf8"),
        ) as {
          family?: string;
        }
      ).family;
    const looks = new Set(
      all
        .filter((t) => !t.parts)
        .map((t) => t.id.split("/")[0]!)
        .filter((look) => !family(look)),
    );
    expect(sets).toHaveLength(looks.size * 4);
    const ids = new Set(all.map((t) => t.id));
    for (const set of sets) {
      // Listed exactly when every kind it is made of is.
      const kinds = new Set(set.parts!.map((p) => p.target));
      expect(set.listed).toBe([...kinds].every((k) => all.find((t) => t.id === k)?.listed));
      for (const part of set.parts!) expect(ids.has(part.target)).toBe(true);
    }
  });

  it("leaves a set unlisted while a part is (the starters' Team List)", () => {
    expect(sets.find((t) => t.id === "broadcast-classic/set:teamLists")?.listed).toBe(false);
    expect(sets.find((t) => t.id === "broadcast-classic/set:matchDay")?.listed).toBe(true);
    expect(sets.find((t) => t.id === "gold-foil/set:teamLists")?.listed).toBe(true);
  });

  it("re-checks a set when a kind it is made of changed", () => {
    const picked = selectChanged(all, ["lib/template-bundles/gold-foil/teamList.json"]).map(
      (t) => t.id,
    );
    expect(picked).toEqual(["gold-foil/teamList", "gold-foil/set:teamLists"]);
  });

  it("takes each page's result from its kind's report, issues renamed by page", () => {
    const set = sets.find((t) => t.id === "club-kit/set:matchDay")!;
    const report = (issues: TemplateFitReport["issues"]): TemplateFitReport => ({
      kind: "matchDay",
      status: issues.length ? "fail" : "pass",
      variants: 40,
      issues,
      renderer: "r",
      fonts: "f",
      checkedAt: "t",
    });
    expect(setReportFromParts(set, new Map())).toBeNull();
    const pass = setReportFromParts(set, new Map([["club-kit/matchDay", report([])]]));
    expect(pass?.status).toBe("pass");
    expect(pass?.variants).toBeGreaterThan(0);
    const fail = setReportFromParts(
      set,
      new Map([
        [
          "club-kit/matchDay",
          report([
            { variant: "fixture.square", page: "fixture", size: "square", reason: "overflow" },
          ]),
        ],
      ]),
    );
    expect(fail?.status).toBe("fail");
    expect(fail?.issues.map((i) => i.variant)).toEqual(["fixture:fixture.square"]);
  });
});
