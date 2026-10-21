/** The bundle fit check's selection and report (L2-B, T2.8). */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { TemplateFitReport } from "@workspace/scorecard/kind-templates";
import {
  checkFailed,
  readBundleTargets,
  renderReport,
  selectChanged,
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
