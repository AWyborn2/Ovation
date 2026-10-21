import { describe, expect, it } from "vitest";
import {
  fitMatrix,
  fitVariantLabel,
  pageSizes,
  pageUsesPhoto,
  pageUsesSponsors,
} from "./fit-matrix";
import type { TemplateDocumentV2, TemplateLayerV2, TemplatePage } from "./format";

const ALL = { square: box(), portrait: box(), story: box(), landscape: box() };
function box() {
  return { x: 10, y: 10, w: 50, h: 10 };
}

let n = 0;
const text = (content: string, extra: Partial<TemplateLayerV2> = {}): TemplateLayerV2 =>
  ({ id: `t${n++}`, kind: "text", content, geometry: ALL, ...extra }) as TemplateLayerV2;
const photo = (): TemplateLayerV2 => ({ id: `p${n++}`, kind: "photo", geometry: ALL });
const sponsorRows = (): TemplateLayerV2 =>
  ({
    id: `r${n++}`,
    kind: "rows",
    geometry: ALL,
    rows: { repeat: "sponsors", rowHeight: 5, cells: [] },
  }) as unknown as TemplateLayerV2;
const page = (...layers: TemplateLayerV2[]): TemplatePage => ({ layers });
const doc = (pages: TemplateDocumentV2["pages"]): TemplateDocumentV2 => ({
  formatVersion: 2,
  pages,
});

describe("fitMatrix (T2.1)", () => {
  it("a single-card kind: sizes × photo where a layer uses the photo", () => {
    const d = doc({ card: page(text("{{playerName}}"), photo()) });
    const variants = fitMatrix(d, "milestone");
    expect(variants).toHaveLength(4 * 2);
    expect(variants.every((v) => v.preset === undefined && !v.junior)).toBe(true);
    // Without a photo layer there is no photo dimension.
    expect(fitMatrix(doc({ card: page(text("{{playerName}}")) }), "milestone")).toHaveLength(4);
  });

  it("covers only the sizes a page has layers on, and skips hidden layers", () => {
    const squareOnly = text("{{playerName}}", { sizes: ["square"] });
    const hidden = text("{{headline}}", { hidden: true });
    const d = doc({ card: page(squareOnly, hidden) });
    expect(pageSizes(d, "card")).toEqual(["square"]);
    expect(fitMatrix(d, "milestone")).toHaveLength(1);
  });

  it("Match Day: four pages, presets, photo and sponsors branches, and a junior pass", () => {
    const d = doc({
      fixture: page(text("{{opposition.name}}"), photo(), text("{{sponsorPresentedBy}}")),
      title: page(text("{{weekendTitle}}"), text("x", { showWhen: { photo: true } })),
      day: page(text("{{dayHeading}}")),
      sponsors: page(sponsorRows()),
    });
    const variants = fitMatrix(d, "matchDay");
    const count = (p: string) => variants.filter((v) => v.page === p).length;
    expect(count("fixture")).toBe(4 * 3 * 2 * 2 + 4);
    expect(count("title")).toBe(4 * 3 * 2);
    expect(count("day")).toBe(4 * 3);
    expect(count("sponsors")).toBe(4 * 3 * 2);
    expect(variants.filter((v) => v.page === "day").every((v) => v.junior)).toBe(true);
    const junior = variants.filter((v) => v.page === "fixture" && v.junior);
    expect(junior.every((v) => v.preset === "full" && v.photo === false)).toBe(true);
  });

  it("Match Summary is checked as the Results set too", () => {
    const d = doc({ result: page(text("{{result}}"), photo()), day: page(text("{{dayHeading}}")) });
    const variants = fitMatrix(d, "matchSummary");
    expect(variants.filter((v) => v.contentKind === "results")).toHaveLength(4 * 3 * 2 + 4 + 4 * 3);
    expect(variants).toHaveLength(2 * (4 * 3 * 2 + 4 + 4 * 3));
  });

  it("leaves out pages the template doesn't have", () => {
    const d = doc({ fixture: page(text("{{venue}}")) });
    expect(new Set(fitMatrix(d, "matchDay").map((v) => v.page))).toEqual(new Set(["fixture"]));
  });

  it("finds photo and sponsor use through tokens, slots and conditions", () => {
    const squad = doc({
      team: page(text("x"), { id: "i", kind: "image", content: "{{squadPhoto}}", geometry: ALL }),
    });
    expect(pageUsesPhoto(squad, "teamList", "team")).toBe(true);
    const cond = doc({ card: page(text("x", { showWhen: { sponsors: false } })) });
    expect(pageUsesSponsors(cond, "card")).toBe(true);
    expect(pageUsesSponsors(doc({ card: page(text("{{clubName}}")) }), "card")).toBe(false);
  });

  it("labels every variant uniquely", () => {
    const d = doc({
      fixture: page(text("{{opposition.name}}"), photo(), text("{{sponsorPresentedBy}}")),
      day: page(text("{{dayHeading}}")),
    });
    const labels = fitMatrix(d, "matchDay").map(fitVariantLabel);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("fixture.story.full.no-photo.sponsors-max.junior");
  });
});
