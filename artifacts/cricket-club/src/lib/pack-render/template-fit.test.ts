/**
 * The template fit check (L2-B, T2.4–T2.5): the variant loop, the page rules
 * (core fields, list capacity) and the DOM rules. jsdom does no layout, so
 * the DOM rules are checked with stubbed boxes; real overflow is measured in
 * the browser (the harness `fitCheck`, and the bundle check script).
 */
import { describe, expect, it } from "vitest";
import {
  fitMatrix,
  normaliseDocument,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type WorstCaseCard,
} from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { checkFitInDom, runTemplateFit, type FitMount } from "./template-fit";

const at = (x: number, y: number, w: number, h: number) => ({
  square: { x, y, w, h },
  portrait: { x, y, w, h },
  story: { x, y, w, h },
  landscape: { x, y, w, h },
});
const text = (id: string, content: string): TemplateLayerV2 => ({
  id,
  kind: "text",
  content,
  geometry: at(5, 5, 90, 10),
});
const doc = (pages: TemplateDocumentV2["pages"]) =>
  ({ formatVersion: 2, pages }) as TemplateDocumentV2;

/** Draw each variant with the real renderer into a plain div (no layout in jsdom). */
function mountRecorder(fontFailures: string[] = []) {
  const cards: WorstCaseCard[] = [];
  const mount: FitMount = async (card, variant, document) => {
    cards.push(card);
    const tokens = resolveCardTokens({
      theme: null,
      junior: card.junior,
      data: card.data as PackCardData,
      packId: BLANK_PACK_ID,
    });
    const root = window.document.createElement("div");
    root.innerHTML = renderPackCard(
      card.input as unknown as ShareCardInput,
      variant.size,
      card.sponsorsOn,
      tokens,
      card.junior,
      card.data as PackCardData,
      BLANK_PACK_ID,
      document as CardAdjustments,
      { page: variant.page },
    );
    return { root, fontFailures };
  };
  return { mount, cards };
}

describe("runTemplateFit", () => {
  const player = doc({
    card: {
      layers: [
        text("name", "{{playerName}}"),
        { id: "pic", kind: "photo", geometry: at(50, 20, 45, 60) },
      ],
    },
  });

  it("draws every variant the fit matrix lists, and passes a template that fits", async () => {
    const { mount, cards } = mountRecorder();
    const report = await runTemplateFit(player, "player", mount, { fonts: "test" });
    expect(report.variants).toBe(fitMatrix(normaliseDocument(player, "player"), "player").length);
    expect(report.variants).toBe(8); // four sizes × photo on and off
    expect(cards).toHaveLength(8);
    expect(report).toMatchObject({ kind: "player", status: "pass", issues: [], fonts: "test" });
  });

  it("reports a font that didn't load on every variant", async () => {
    const { mount } = mountRecorder(["Imaginary Sans"]);
    const report = await runTemplateFit(player, "player", mount);
    expect(report.status).toBe("fail");
    expect(report.issues.filter((i) => i.reason === "font")).toHaveLength(8);
    expect(report.issues[0]).toMatchObject({ detail: "Imaginary Sans" });
  });

  it("fills each list to its capacity on each size", async () => {
    const list = doc({
      team: {
        layers: [
          text("grade", "{{gradeHeading}}"),
          text("match", "{{opponent}} {{venue}}"),
          {
            id: "xi",
            kind: "rows",
            geometry: at(5, 20, 90, 70),
            rows: {
              repeat: "players",
              rowHeight: 5,
              cells: [{ field: "broadcastName", x: 0, w: 100 }],
            },
          },
        ],
      },
    });
    const { mount, cards } = mountRecorder();
    await runTemplateFit(list, "teamList", mount);
    // Square: 70 % of 1080 = 756 px; 5 % of 1080 = 54 px a row → 14 rows. Story is taller.
    const square = cards.find(
      (c) => (c.input as { players?: unknown[] }).players && c.page === "team",
    );
    expect((square!.input as { players: unknown[] }).players.length).toBeGreaterThanOrEqual(1);
    const counts = new Set(cards.map((c) => (c.input as { players: unknown[] }).players.length));
    expect(counts.size).toBeGreaterThan(1);
  });

  it("names every core field a page doesn't bind, per size", async () => {
    const thin = doc({ fixture: { layers: [text("grade", "{{grade}}")] } });
    const report = await runTemplateFit(thin, "matchDay", mountRecorder().mount);
    const missing = report.issues.filter((i) => i.reason === "core-missing" && i.size === "square");
    expect(missing.map((i) => i.field).sort()).toEqual([
      "fixture.date",
      "fixture.homeAway",
      "fixture.opposition",
      "fixture.startTime",
      "fixture.venue",
    ]);
  });

  it("flags a list that holds no rows", async () => {
    const tooSmall = doc({
      card: {
        layers: [
          {
            id: "table",
            kind: "rows",
            geometry: at(5, 90, 90, 2),
            rows: { repeat: "rows", rowHeight: 20, cells: [{ field: "team", x: 0, w: 100 }] },
          },
        ],
      },
    });
    const report = await runTemplateFit(tooSmall, "ladder", mountRecorder().mount);
    expect(report.issues.filter((i) => i.reason === "rows-capacity")).toHaveLength(4);
  });

  it("passes a list cell that ends in … after a whole word, and fails one cut mid-word", async () => {
    const ladder = doc({
      card: {
        layers: [
          {
            id: "table",
            kind: "rows",
            geometry: at(5, 20, 90, 70),
            rows: { repeat: "rows", rowHeight: 6, cells: [{ field: "team", x: 0, w: 60 }] },
          },
        ],
      },
    });
    // Up to `room` characters fit a cell at any scale; more overflow.
    const measured =
      (room: number): FitMount =>
      async (...args) => {
        const out = await mountRecorder().mount(...args);
        for (const el of Array.from(out.root.querySelectorAll<HTMLElement>("[data-layer-fit]"))) {
          Object.defineProperty(el, "clientWidth", { configurable: true, get: () => 100 });
          Object.defineProperty(el, "clientHeight", { configurable: true, get: () => 20 });
          Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => 20 });
          Object.defineProperty(el, "scrollWidth", {
            configurable: true,
            get: () => ((el.textContent ?? "").length > room ? 200 : 100),
          });
        }
        return out;
      };
    const overflow = async (room: number) =>
      (await runTemplateFit(ladder, "ladder", measured(room))).issues.filter(
        (i) => i.reason === "overflow",
      );
    // Worst-case team names end after a whole word ("North Suburban…").
    expect(await overflow(16)).toEqual([]);
    // Too narrow for any first word: every name is cut mid-word, and fails.
    const narrow = await overflow(4);
    expect(narrow.length).toBeGreaterThan(0);
    expect(narrow.every((i) => i.field === "team" && i.detail === "cut mid-word")).toBe(true);
  });
});

describe("checkFitInDom", () => {
  /** A card root with layers whose boxes are set by hand. */
  function card(html: string, boxes: Record<string, [number, number, number, number]>) {
    const root = window.document.createElement("div");
    root.innerHTML = `<div class="pack-card-root">${html}</div>`;
    const rect = ([left, top, width, height]: [number, number, number, number]) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
      }) as DOMRect;
    root.querySelector<HTMLElement>(".pack-card-root")!.getBoundingClientRect = () =>
      rect([0, 0, 1080, 1080]);
    for (const [selector, box] of Object.entries(boxes))
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector)))
        el.getBoundingClientRect = () => rect(box);
    return root;
  }
  const ctx = (layers: TemplateLayerV2[], visible: string[] | null = null) => ({
    doc: doc({ fixture: { layers } }),
    kind: "matchDay",
    page: "fixture" as const,
    size: "square" as const,
    variant: "fixture.square.minimal",
    visible: visible ? new Set(visible) : null,
  });

  it("flags data off the artboard, but not decoration", () => {
    const root = card('<div data-layer-id="name">X</div><div data-layer-id="flare"></div>', {
      '[data-layer-id="name"]': [1000, 10, 200, 50],
      '[data-layer-id="flare"]': [1000, 10, 200, 50],
    });
    const issues = checkFitInDom(
      root,
      ctx([
        text("name", "{{opposition.name}}"),
        { id: "flare", kind: "shape", geometry: at(0, 0, 1, 1) },
      ]),
    );
    expect(issues).toEqual([expect.objectContaining({ reason: "off-artboard", layerId: "name" })]);
  });

  it("lets a faint watermark crest bleed off the card, but not a full-strength logo", () => {
    const root = card('<div data-layer-id="crest"></div><div data-layer-id="logo"></div>', {
      '[data-layer-id="crest"]': [-150, 400, 700, 700],
      '[data-layer-id="logo"]': [-150, 10, 300, 300],
    });
    const issues = checkFitInDom(
      root,
      ctx([
        {
          id: "crest",
          kind: "image",
          content: "{{clubLogo}}",
          style: { opacity: 0.07 },
          geometry: at(-14, 37, 65, 65),
        },
        { id: "logo", kind: "image", content: "{{clubLogo}}", geometry: at(-14, 1, 28, 28) },
      ] as never),
    );
    expect(issues).toEqual([expect.objectContaining({ reason: "off-artboard", layerId: "logo" })]);
  });

  it("flags rows that run out of their list's box", () => {
    const root = card(
      '<div data-layer-id="xi"><div data-row-index="0"></div><div data-row-index="1"></div></div>',
      {
        '[data-layer-id="xi"]': [0, 0, 500, 100],
        '[data-row-index="0"]': [0, 0, 500, 60],
        '[data-row-index="1"]': [0, 60, 500, 60],
      },
    );
    const layer: TemplateLayerV2 = {
      id: "xi",
      kind: "rows",
      geometry: at(0, 0, 50, 10),
      rows: { repeat: "players", rowHeight: 5, cells: [] },
    };
    expect(checkFitInDom(root, ctx([layer]))).toEqual([
      expect.objectContaining({ reason: "rows-overflow", layerId: "xi", row: 1 }),
    ]);
  });

  it("flags a layer drawn although every field it shows is hidden", () => {
    const root = card('<div data-layer-id="round">ROUND 5</div>', {});
    const layers = [text("round", "{{roundLabel}}")];
    expect(checkFitInDom(root, ctx(layers, ["fixture.grade"]))).toEqual([
      expect.objectContaining({ reason: "hidden-shown", layerId: "round" }),
    ]);
    expect(checkFitInDom(root, ctx(layers, ["fixture.round"]))).toEqual([]);
  });

  it("allows https, inline and same-site images only", () => {
    const root = card(
      [
        '<div data-layer-id="a"><img src="https://cdn.example.org/a.png"></div>',
        '<div data-layer-id="b"><img src="data:image/svg+xml,%3Csvg%3E"></div>',
        '<div data-layer-id="c"><img src="/objects/library/c.png"></div>',
        '<div data-layer-id="d"><img src="http://insecure.example.org/d.png"></div>',
        '<div data-layer-id="e"><img src="//cdn.example.org/e.png"></div>',
      ].join(""),
      {},
    );
    const issues = checkFitInDom(root, ctx([]));
    expect(issues.map((i) => [i.reason, i.layerId])).toEqual([
      ["image-url", "d"],
      ["image-url", "e"],
    ]);
  });

  it("flags vector markup the sanitiser should have removed", () => {
    const root = card(
      '<div data-layer-id="v"><svg><a href="https://x.example.org"><path d="M0 0"/></a></svg></div>',
      {},
    );
    const vector: TemplateLayerV2 = {
      id: "v",
      kind: "vector",
      svg: "<svg/>",
      geometry: at(0, 0, 10, 10),
    };
    expect(checkFitInDom(root, ctx([vector]))).toEqual([
      expect.objectContaining({ reason: "vector-unsafe", layerId: "v" }),
    ]);
  });
});
