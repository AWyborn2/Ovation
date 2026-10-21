/** The fit check's pure rules and report (L2-B). */
import { describe, expect, it } from "vitest";
import type { TemplateDocumentV2, TemplateLayerV2 } from "./format";
import {
  fitReport,
  fitReportSummary,
  MAX_FIT_ISSUES,
  missingCoreFields,
  pageCoreFields,
  pageRepeatCapacities,
  pageRowsCapacity,
  type FitIssue,
} from "./fit-rules";

const at = (x: number, y: number, w: number, h: number) => ({
  square: { x, y, w, h },
  story: { x, y, w, h },
});
const text = (id: string, content: string, extra: Partial<TemplateLayerV2> = {}) =>
  ({ id, kind: "text", content, geometry: at(0, 0, 50, 10), ...extra }) as TemplateLayerV2;
const doc = (pages: TemplateDocumentV2["pages"]) =>
  ({ formatVersion: 2, pages }) as TemplateDocumentV2;

describe("core fields", () => {
  it("lists each content page's core fields", () => {
    expect(pageCoreFields("matchDay", "title")).toEqual(["title.heading", "title.dates"]);
    expect(pageCoreFields("matchDay", "sponsors")).toEqual(["sponsors.logos"]);
    expect(pageCoreFields("matchDay", "day")).toEqual(["dayRows"]);
    expect(pageCoreFields("matchSummary", "result")).toContain("result.performers");
    expect(pageCoreFields("results", "result")).not.toContain("result.performers");
    expect(pageCoreFields("teamList", "team")).toEqual([
      "team.grade",
      "team.players",
      "team.match",
    ]);
    expect(pageCoreFields("ladder", "card")).toEqual([]);
  });

  it("finds the ones a page doesn't bind on a size, through nested groups too", () => {
    const title = doc({
      title: {
        layers: [
          {
            id: "g",
            kind: "group",
            geometry: at(0, 0, 100, 50),
            children: [text("t", "{{weekendTitle}}")],
          },
          text("d", "{{dateRange}}", { sizes: ["story"] }),
        ],
      },
    });
    expect(missingCoreFields(title, "matchDay", "matchDay", "title", "square")).toEqual([
      "title.dates",
    ]);
    expect(missingCoreFields(title, "matchDay", "matchDay", "title", "story")).toEqual([]);
  });

  it("counts a list as the sponsors page's and the day slide's core", () => {
    const rows = (repeat: string): TemplateLayerV2 => ({
      id: repeat,
      kind: "rows",
      geometry: at(0, 0, 100, 50),
      rows: { repeat, rowHeight: 5, cells: [] },
    });
    expect(
      missingCoreFields(
        doc({ sponsors: { layers: [rows("sponsors")] } }),
        "matchDay",
        "matchDay",
        "sponsors",
        "square",
      ),
    ).toEqual([]);
    expect(
      missingCoreFields(
        doc({ day: { layers: [rows("dayRows")] } }),
        "matchSummary",
        "results",
        "day",
        "square",
      ),
    ).toEqual([]);
    expect(
      missingCoreFields(doc({ day: { layers: [] } }), "matchDay", "matchDay", "day", "square"),
    ).toEqual(["dayRows"]);
  });

  it("ignores hidden layers", () => {
    const hidden = doc({ title: { layers: [text("t", "{{weekendTitle}}", { hidden: true })] } });
    expect(missingCoreFields(hidden, "matchDay", "matchDay", "title", "square")).toContain(
      "title.heading",
    );
  });
});

describe("list capacity", () => {
  it("reads it from the page's rows layer on each size", () => {
    const list = doc({
      team: {
        layers: [
          {
            id: "xi",
            kind: "rows",
            geometry: at(0, 0, 100, 50),
            rows: { repeat: "players", rowHeight: 5, cells: [] },
          },
        ],
      },
    });
    // 50 % of 1080 = 540 px; rows of 54 px → 10.
    expect(pageRowsCapacity(list, "team", "square", "players")).toBe(10);
    expect(pageRowsCapacity(list, "team", "square", "rows")).toBeNull();
    expect(pageRepeatCapacities(list, "team", "story")).toEqual({ players: 17 });
  });
});

describe("the report", () => {
  const issue = (n: number): FitIssue => ({
    variant: `card.square.${n}`,
    page: "card",
    size: "square",
    reason: n % 2 ? "overflow" : "off-artboard",
  });

  it("passes with no issues, and stamps the renderer and fonts", () => {
    const r = fitReport("player", 8, [], { fonts: "google-fonts:1500", checkedAt: "t" });
    expect(r).toMatchObject({
      status: "pass",
      variants: 8,
      issues: [],
      fonts: "google-fonts:1500",
    });
    expect(r.renderer).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(fitReportSummary(r)).toBe("pass · 8 variants");
  });

  it("caps its issues and counts the rest", () => {
    const many = Array.from({ length: MAX_FIT_ISSUES + 5 }, (_, i) => issue(i));
    const r = fitReport("player", 8, many, { fonts: "x" });
    expect(r.status).toBe("fail");
    expect(r.issues).toHaveLength(MAX_FIT_ISSUES);
    expect(r.truncated).toBe(5);
    expect(
      fitReportSummary(fitReport("player", 8, [issue(1), issue(2), issue(3)], { fonts: "x" })),
    ).toBe("fail · 8 variants · 2 overflow, 1 off-artboard");
  });
});
