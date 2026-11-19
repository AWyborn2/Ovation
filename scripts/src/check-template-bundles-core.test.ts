/** The bundle fit check's selection and report (L2-B, T2.8). */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fitMatrix, normaliseDocument } from "@workspace/scorecard/kind-templates";
import type { TemplateFitReport } from "@workspace/scorecard/kind-templates";
import {
  BUNDLES_BELOW_FOUR_SIZES,
  bundleSizeErrors,
  checkBundleSizes,
  checkFailed,
  gateFailures,
  readBundleTargets,
  renderReport,
  requiredBundleSizes,
  selectChanged,
  setReportFromParts,
  type FitTarget,
} from "./check-template-bundles-core";
import { readBundles } from "../../lib/template-bundles/generate-index.mjs";

const root = mkdtempSync(path.join(tmpdir(), "bundles-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function bundle(look: string, kind: string, document: unknown, lookFile: object = {}) {
  const dir = path.join(root, "lib", "template-bundles", look);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "look.json"), JSON.stringify({ name: look, ...lookFile }));
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

describe("a look's sizes (plan 2026-11-19-portrait-story-sizes, Stage 5)", () => {
  const ALL = ["square", "portrait", "story", "landscape"] as const;
  const NEW = ["portrait", "story"] as const;
  type Size = (typeof ALL)[number];
  const box = { x: 0, y: 0, w: 100, h: 100 };
  /** A shape layer with a box on each of `sizes`; `own` sets its `sizes` list. */
  const layer = (id: string, sizes: readonly Size[], own?: readonly Size[] | "none") => ({
    kind: "shape",
    id,
    style: { fill: "#000" },
    geometry: Object.fromEntries(sizes.map((s) => [s, box])),
    ...(own === "none" ? {} : { sizes: [...(own ?? sizes)] }),
  });
  const doc = (pages: Record<string, unknown[]>) => ({
    formatVersion: 2,
    pages: Object.fromEntries(Object.entries(pages).map(([k, layers]) => [k, { layers }])),
  });
  const target = (document: unknown, lookSizes?: unknown, kind = "matchDay"): FitTarget => ({
    id: `x/${kind}`,
    kind,
    document,
    ...(lookSizes === undefined ? {} : { lookSizes }),
  });

  it("passes a Portrait and Story look that covers exactly those on every page", () => {
    const d = doc({ fixture: [layer("bg", NEW)], title: [layer("bg", NEW), layer("t", NEW)] });
    expect(bundleSizeErrors(target(d, [...NEW]))).toEqual([]);
  });

  it("fails a sizes look with a square layer, naming the page and layer", () => {
    const d = doc({ fixture: [layer("bg", NEW), layer("sq", ["square"])] });
    expect(bundleSizeErrors(target(d, [...NEW]))).toEqual([
      "page fixture has a layer on square, which the look doesn't design (sq)",
    ]);
  });

  it("fails a sizes look with a landscape layer, even one hidden inside a group", () => {
    const group = {
      kind: "group",
      id: "g",
      sizes: [...NEW],
      geometry: { portrait: box, story: box },
      children: [{ ...layer("wide", ["landscape"]), hidden: true }],
    };
    const d = doc({ fixture: [layer("bg", NEW), group] });
    expect(bundleSizeErrors(target(d, [...NEW]))).toEqual([
      "page fixture has a layer on landscape, which the look doesn't design (wide)",
    ]);
  });

  it("fails a sizes look whose layer has no sizes of its own: it is on every size", () => {
    // The layer has boxes on portrait and story only, so the fit matrix wouldn't
    // check square, but the document still puts the layer there.
    const d = doc({ fixture: [layer("bg", NEW, "none")] });
    expect(bundleSizeErrors(target(d, [...NEW]))).toEqual([
      "page fixture has a layer on square, which the look doesn't design (bg)",
      "page fixture has a layer on landscape, which the look doesn't design (bg)",
    ]);
  });

  it("fails a sizes look with a page that misses one of its sizes", () => {
    const d = doc({ fixture: [layer("bg", NEW)], title: [layer("t", ["portrait"])] });
    expect(bundleSizeErrors(target(d, [...NEW]))).toEqual(["page title doesn't cover story"]);
  });

  it("passes a look without sizes that covers all four on every page", () => {
    const d = doc({ fixture: [layer("bg", ALL, "none")], title: [layer("t", ALL)] });
    expect(bundleSizeErrors(target(d))).toEqual([]);
    // Format v1: the kind's one page.
    const v1 = { layers: [layer("bg", ALL, "none")] };
    expect(bundleSizeErrors(target(v1, undefined, "player"))).toEqual([]);
  });

  it("fails a look without sizes that loses landscape", () => {
    const d = doc({
      fixture: [layer("bg", ALL, "none")],
      title: [layer("t", ["square", "portrait", "story"])],
    });
    expect(bundleSizeErrors(target(d))).toEqual(["page title doesn't cover landscape"]);
  });

  it("fails a look without sizes that is Portrait and Story only", () => {
    const d = doc({ fixture: [layer("bg", NEW)] });
    expect(bundleSizeErrors(target(d))).toEqual(["page fixture doesn't cover square, landscape"]);
  });

  it("refuses a look.json sizes that isn't a list of distinct card sizes", () => {
    const d = doc({ fixture: [layer("bg", NEW)] });
    const notAList = "look.json: sizes must be a non-empty list of card sizes";
    expect(bundleSizeErrors(target(d, []))).toEqual([notAList]);
    expect(bundleSizeErrors(target(d, "portrait"))).toEqual([notAList]);
    expect(bundleSizeErrors(target(d, ["portrait", "feed"]))[0]).toMatch(/unknown size "feed"/);
    expect(bundleSizeErrors(target(d, ["portrait", "portrait"]))).toEqual([
      "look.json: sizes names a size twice",
    ]);
  });

  it("stops the bundle index generator on a bad look.json sizes", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "bundle-index-"));
    try {
      mkdirSync(path.join(dir, "new-look"));
      const write = (look: object) =>
        writeFileSync(path.join(dir, "new-look", "look.json"), JSON.stringify(look));
      write({ name: "New", sizes: ["portrait", "story"] });
      expect(readBundles(dir)).toEqual([{ slug: "new-look", kinds: [] }]);
      write({ name: "New", sizes: ["portrait", "tall"] });
      expect(() => readBundles(dir)).toThrow(/new-look\/look\.json: sizes names an unknown size/);
      write({ name: "New", sizes: [] });
      expect(() => readBundles(dir)).toThrow(/sizes must be a non-empty list/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails a template with no pages", () => {
    expect(bundleSizeErrors(target({ formatVersion: 2, pages: {} }))).toEqual(["no pages"]);
  });

  it("reads a look's sizes from look.json onto its templates, and leaves other looks without", () => {
    bundle("story-look", "player", { layers: [layer("bg", NEW)] }, { sizes: [...NEW] });
    bundle("four-look", "player", { layers: [layer("bg", ALL, "none")] });
    const targets = readBundleTargets(root);
    const story = targets.filter((t) => t.id === "story-look/player");
    expect(story[0]?.lookSizes).toEqual([...NEW]);
    expect(targets.find((t) => t.id === "four-look/player")).not.toHaveProperty("lookSizes");
    expect(checkBundleSizes(story)).toEqual([]);
    expect(checkBundleSizes(targets.filter((t) => t.id === "four-look/player"))).toEqual([]);
  });

  it("fit-checks only the sizes a page covers: a new look skips square and landscape", () => {
    // fitMatrix is what the browser check draws; the size checks above keep a
    // stray square layer, or an existing look's lost size, from slipping past it.
    const sizesOf = (d: unknown) => [
      ...new Set(fitMatrix(normaliseDocument(d, "player"), "player").map((v) => v.size)),
    ];
    expect(sizesOf({ layers: [layer("bg", NEW)] })).toEqual([...NEW]);
    expect(sizesOf({ layers: [layer("bg", ALL, "none")] })).toEqual([...ALL]);
  });

  it("holds a pinned older template to the sizes it has: it can't lose another", () => {
    const three = ["square", "portrait", "landscape"] as const;
    const d = doc({ result: [layer("bg", three)] });
    const t = target(d, undefined, "matchSummary");
    expect(bundleSizeErrors({ ...t, id: "omg-classic/matchSummary" })).toEqual([]);
    // Unpinned, the same document is missing Story.
    expect(bundleSizeErrors({ ...t, id: "other/matchSummary" })).toEqual([
      "page result doesn't cover story",
    ]);
    const lost = doc({ result: [layer("bg", ["square", "portrait"])] });
    expect(
      bundleSizeErrors({
        ...target(lost, undefined, "matchSummary"),
        id: "omg-classic/matchSummary",
      }),
    ).toEqual(["page result doesn't cover landscape"]);
  });

  it("passes every committed bundle, each current look fit-checked at every size it has", () => {
    const repo = path.resolve(__dirname, "../..");
    const all = readBundleTargets(repo);
    expect(all.length).toBeGreaterThan(0);
    expect(checkBundleSizes(all)).toEqual([]);
    const kinds = all.filter((x) => !x.parts);
    // Every look today is from before the change: none sets sizes.
    expect(kinds.filter((t) => t.lookSizes !== undefined).map((t) => t.id)).toEqual([]);
    // The pinned list names real templates that still lack a size; take one off when it has all four.
    const ids = new Set(kinds.map((t) => t.id));
    for (const id of Object.keys(BUNDLES_BELOW_FOUR_SIZES)) {
      expect(ids.has(id), id).toBe(true);
      expect(BUNDLES_BELOW_FOUR_SIZES[id]!.length, id).toBeLessThan(4);
    }
    for (const t of kinds) {
      const sizes = new Set(
        fitMatrix(normaliseDocument(t.document, t.kind), t.kind).map((v) => v.size),
      );
      expect([...sizes].sort(), t.id).toEqual([...requiredBundleSizes(t)!].sort());
    }
    // All but the pinned few at all four.
    expect(kinds.filter((t) => requiredBundleSizes(t)!.length < 4).map((t) => t.id)).toEqual(
      Object.keys(BUNDLES_BELOW_FOUR_SIZES).sort(),
    );
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
    // so they assemble no sets; nor does a pack with no match day, result or team list
    // design (Sponsored Player).
    const family = (look: string) =>
      !!(
        JSON.parse(
          readFileSync(path.join(repo, "lib/template-bundles", look, "look.json"), "utf8"),
        ) as {
          family?: string;
        }
      ).family;
    const setKinds = ["matchDay", "matchSummary", "teamList"];
    const designsSets = (look: string) =>
      all.some((t) => !t.parts && setKinds.some((k) => t.id === `${look}/${k}`));
    const looks = new Set(
      all
        .filter((t) => !t.parts)
        .map((t) => t.id.split("/")[0]!)
        .filter((look) => !family(look) && designsSets(look)),
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
