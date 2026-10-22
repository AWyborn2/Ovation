import { describe, expect, it } from "vitest";
import type { TemplateDocumentV2, TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import { parseArgs } from "../../convert-pack";
import { withDocument, type KindConversion } from "./convert";
import { lookReport } from "./report";

const box = { square: { x: 0, y: 0, w: 10, h: 10 } };
const shape = (id: string) => ({ id, kind: "shape", geometry: box }) as TemplateLayerV2;

const raw: KindConversion = {
  kind: "century",
  document: { formatVersion: 2, pages: { card: { layers: [shape("a")] } } } as TemplateDocumentV2,
  pages: [
    {
      kind: "century",
      page: "card",
      source: "card.single",
      alternatives: [],
      sizes: ["square"],
      layers: { shape: 1 },
      stacks: 0,
      unknownTokens: [],
      polish: ["filter: drop-shadow(…) not mapped"],
      untokenised: [],
      motion: {},
      renders: {},
    },
  ],
};

describe("re-checking a polished look", () => {
  it("counts the bundle's layers, not the raw conversion's", () => {
    const polished = {
      formatVersion: 2,
      pages: {
        card: {
          layers: [
            shape("a"),
            {
              id: "g",
              kind: "group",
              geometry: box,
              stack: { direction: "column" },
              children: [shape("b"), shape("c")],
            } as TemplateLayerV2,
          ],
        },
      },
    } as TemplateDocumentV2;
    const conv = withDocument(raw, polished);
    expect(conv.document).toBe(polished);
    expect(conv.pages[0]).toMatchObject({ layers: { shape: 3, group: 1 }, stacks: 1 });
    expect(conv.pages[0]!.renders).toBe(raw.pages[0]!.renders);
  });

  it("reports the polish status, the time logged and the listed kinds", () => {
    const opts = {
      look: "Club Kit",
      packId: "club-kit-v1",
      conversions: [raw],
      checks: { "century.card": { square: { pixelMatch: 0.97, warnings: [] } } },
      generatedAt: "2026-10-22",
    };
    const report = lookReport({ ...opts, polish: { halfDays: 6, listed: 1 } });
    expect(report).toContain("# Club Kit: conversion report");
    expect(report).toContain("**polished, pending Ash's sign-off**; 1 of 1 kinds listed");
    expect(report).toContain("- Polish time logged: 6 hd.");
    expect(report).toContain("Converter notes (from the raw conversion):");
    expect(report).toContain("| square | 97% | none |");
    const first = lookReport(opts);
    expect(first).toContain("# Club Kit: raw conversion report");
    expect(first).toContain("- Polish time logged: 0 hd (raw conversion).");
  });

  it("--recheck reads the committed bundles and renders them", () => {
    const opts = parseArgs(["--pack=club-kit-v1", "--recheck", "--polish-hd=4.5"]);
    expect(opts).toMatchObject({ recheck: true, bundles: true, mapOnly: true, polishHd: 4.5 });
    expect(opts.convertOut.replace(/\\/g, "/")).toMatch(/lib\/template-bundles$/);
    expect(() => parseArgs(["--recheck", "--no-check"])).toThrow(/--recheck/);
    expect(() => parseArgs(["--recheck", "--polish-hd=lots"])).toThrow(/half-days/);
  });
});
