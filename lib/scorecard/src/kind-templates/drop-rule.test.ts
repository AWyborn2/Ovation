/**
 * The drop rule (T1.5): a layer whose bound tokens are all hidden or empty is
 * dropped; core fields are always visible. Per preset, through the club's
 * visible set as `resolveVisibleFields` builds it.
 */
import { describe, expect, it } from "vitest";
import { resolveVisibleFields } from "../card-content/settings";
import { CONTENT_PRESETS, type ContentPreset } from "./fields";
import type { PageKey, TemplateLayerV2 } from "./format";
import { layerDropped, layerTokens, tokenHidden, type DropRuleContext } from "./drop-rule";

const box = { square: { x: 0, y: 0, w: 50, h: 10 } };
const text = (content: string, extra: Partial<TemplateLayerV2> = {}): TemplateLayerV2 =>
  ({ id: content, kind: "text", content, geometry: box, ...extra }) as TemplateLayerV2;
const image = (content: string): TemplateLayerV2 => ({
  id: content,
  kind: "image",
  content,
  geometry: box,
});
const photo: TemplateLayerV2 = { id: "photo", kind: "photo", geometry: box };
const shape: TemplateLayerV2 = { id: "panel", kind: "shape", geometry: box };

/** A card that has a value for every token except the listed ones. */
const ctx = (
  kind: string,
  page: PageKey,
  preset: ContentPreset | null,
  empty: string[] = [],
): DropRuleContext => ({
  kind,
  page,
  has: (token) => !empty.includes(token),
  visible: preset ? resolveVisibleFields(kind, { preset }) : null,
});

/** Which presets keep a layer (the rest drop it). */
const keptAt = (layer: TemplateLayerV2, kind: string, page: PageKey, empty: string[] = []) =>
  CONTENT_PRESETS.filter((p) => !layerDropped(layer, ctx(kind, page, p, empty)));

describe("which tokens a layer binds", () => {
  it("reads text, live fields, images, repeats and the photo", () => {
    expect(layerTokens(text("Round {{roundLabel}} · {{ venue }} {{roundLabel}}"))).toEqual([
      "roundLabel",
      "venue",
    ]);
    expect(layerTokens(text("", { bind: "grade" } as Partial<TemplateLayerV2>))).toEqual(["grade"]);
    expect(layerTokens(image("{{opposition.logo}}"))).toEqual(["opposition.logo"]);
    expect(layerTokens(image("https://cdn.example.org/x.png"))).toEqual([]);
    expect(layerTokens(photo)).toEqual(["photo"]);
    expect(
      layerTokens({
        id: "r",
        kind: "rows",
        geometry: box,
        rows: { repeat: "sponsors", rowHeight: 8, cells: [] },
      }),
    ).toEqual(["sponsors"]);
    expect(layerTokens(shape)).toEqual([]);
  });
});

describe("Match Day fixture page, per preset", () => {
  it("drops the round outside Standard and Full, literal text and all", () => {
    expect(keptAt(text("Round {{roundLabel}}"), "matchDay", "fixture")).toEqual([
      "standard",
      "full",
    ]);
  });

  it("shows ladder positions, the last meeting and milestone watch at Full only", () => {
    expect(keptAt(text("{{ladder.club}} v {{ladder.opposition}}"), "matchDay", "fixture")).toEqual([
      "full",
    ]);
    expect(keptAt(text("{{lastMeeting}}"), "matchDay", "fixture")).toEqual(["full"]);
    expect(keptAt(text("{{milestoneWatch}}"), "matchDay", "fixture")).toEqual(["full"]);
  });

  it("drops the opposition crest and the photo at Minimal", () => {
    expect(keptAt(image("{{opposition.logo}}"), "matchDay", "fixture")).toEqual([
      "standard",
      "full",
    ]);
    expect(keptAt(photo, "matchDay", "fixture")).toEqual(["standard", "full"]);
  });

  it("never hides a core field, at any preset or choice", () => {
    const opposition = text("v {{opposition.name}}");
    expect(keptAt(opposition, "matchDay", "fixture")).toEqual([...CONTENT_PRESETS]);
    const nothingVisible: DropRuleContext = {
      kind: "matchDay",
      page: "fixture",
      has: () => true,
      visible: new Set(),
    };
    expect(tokenHidden("opposition.name", nothingVisible)).toBe(false);
    expect(layerDropped(opposition, nothingVisible)).toBe(false);
    expect(tokenHidden("roundLabel", nothingVisible)).toBe(true);
  });

  it("drops a visible field with no value", () => {
    expect(keptAt(text("Round {{roundLabel}}"), "matchDay", "fixture", ["roundLabel"])).toEqual([]);
    expect(
      keptAt(text("v {{opposition.name}}"), "matchDay", "fixture", ["opposition.name"]),
    ).toEqual([]);
  });

  it("keeps a layer while any of its tokens shows", () => {
    // The round is hidden at Minimal, but the ground is core.
    expect(keptAt(text("{{venue}} · {{roundLabel}}"), "matchDay", "fixture")).toEqual([
      ...CONTENT_PRESETS,
    ]);
    // At Standard the round shows even when the ground is empty.
    expect(keptAt(text("{{venue}} · {{roundLabel}}"), "matchDay", "fixture", ["venue"])).toEqual([
      "standard",
      "full",
    ]);
  });

  it("never drops a layer that binds nothing, and always shows club identity", () => {
    expect(keptAt(shape, "matchDay", "fixture")).toEqual([...CONTENT_PRESETS]);
    expect(keptAt(text("GAME DAY"), "matchDay", "fixture")).toEqual([...CONTENT_PRESETS]);
    expect(keptAt(text("{{clubName}}"), "matchDay", "fixture")).toEqual([...CONTENT_PRESETS]);
  });
});

describe("carousel pages, per preset", () => {
  it("title page: the round and the livestream follow their presets", () => {
    expect(keptAt(text("{{weekendTitle}}"), "matchDay", "title")).toEqual([...CONTENT_PRESETS]);
    expect(keptAt(text("{{roundLabel}}"), "matchDay", "title")).toEqual(["standard", "full"]);
    expect(keptAt(text("Watch: {{livestream}}"), "matchDay", "title")).toEqual(["full"]);
    // The cover photo, as a photo layer or as an image token.
    expect(keptAt(photo, "matchDay", "title")).toEqual(["standard", "full"]);
    expect(keptAt(image("{{photo}}"), "matchDay", "title")).toEqual(["standard", "full"]);
  });

  it("sponsors page: the list is core, the extra blocks Full only", () => {
    const list: TemplateLayerV2 = {
      id: "list",
      kind: "rows",
      geometry: box,
      rows: { repeat: "sponsors", rowHeight: 8, cells: [] },
    };
    expect(keptAt(list, "matchDay", "sponsors")).toEqual([...CONTENT_PRESETS]);
    expect(keptAt(list, "matchDay", "sponsors", ["sponsors"])).toEqual([]);
    expect(keptAt(text("{{sponsorThanks}}"), "matchDay", "sponsors")).toEqual(["full"]);
    expect(keptAt(text("{{nextHomeMatch}} {{nextHomeWhen}}"), "matchDay", "sponsors")).toEqual([
      "full",
    ]);
  });
});

describe("Match Summary and Team List, per preset", () => {
  it("keeps the performers (core on a match summary) and drops them when the set has none", () => {
    expect(keptAt(text("{{club.performers}}"), "matchSummary", "result")).toEqual([
      ...CONTENT_PRESETS,
    ]);
    // The Results set blanks them: an empty token drops the box.
    expect(keptAt(text("{{club.performers}}"), "results", "result", ["club.performers"])).toEqual(
      [],
    );
  });

  it("drops the result's crest and photo at Minimal", () => {
    expect(keptAt(image("{{opposition.logo}}"), "matchSummary", "result")).toEqual([
      "standard",
      "full",
    ]);
    expect(keptAt(photo, "matchSummary", "result")).toEqual(["standard", "full"]);
  });

  it("drops a team list's round and photo at Minimal; the players are core", () => {
    expect(keptAt(text("{{broadcastRoundLabel}}"), "teamList", "team")).toEqual([
      "standard",
      "full",
    ]);
    expect(keptAt(image("{{squadPhoto}}"), "teamList", "team")).toEqual(["standard", "full"]);
    expect(keptAt(photo, "teamList", "team")).toEqual(["standard", "full"]);
    const players: TemplateLayerV2 = {
      id: "xi",
      kind: "rows",
      geometry: box,
      rows: { repeat: "players", rowHeight: 6, cells: [] },
    };
    expect(keptAt(players, "teamList", "team")).toEqual([...CONTENT_PRESETS]);
  });
});

describe("groups", () => {
  const group = (children: TemplateLayerV2[]): TemplateLayerV2 => ({
    id: "g",
    kind: "group",
    geometry: box,
    stack: { direction: "column" },
    children,
  });

  it("drops a group once every child is dropped", () => {
    const g = group([text("Round {{roundLabel}}"), text("{{lastMeeting}}")]);
    expect(keptAt(g, "matchDay", "fixture")).toEqual(["standard", "full"]);
    expect(keptAt(g, "matchDay", "fixture", ["roundLabel"])).toEqual(["full"]);
  });

  it("keeps a group with a static child, and an empty group", () => {
    expect(keptAt(group([text("{{lastMeeting}}"), shape]), "matchDay", "fixture")).toEqual([
      ...CONTENT_PRESETS,
    ]);
    expect(keptAt(group([]), "matchDay", "fixture")).toEqual([...CONTENT_PRESETS]);
  });
});

describe("without a visible set (the render path)", () => {
  it("drops on empty values alone", () => {
    const render = (empty: string[]) => ctx("matchDay", "fixture", null, empty);
    expect(layerDropped(text("Round {{roundLabel}}"), render([]))).toBe(false);
    expect(layerDropped(text("Round {{roundLabel}}"), render(["roundLabel"]))).toBe(true);
    expect(layerDropped(text("{{ladder.club}}"), render([]))).toBe(false);
  });
});
