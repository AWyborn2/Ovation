/**
 * Editor reach over every look (editable-elements plan, Stream A): on every
 * page and size of every bundle in every look (the ten, and Ovation Match
 * Graphics' seven), each layer at any depth
 * and each cell of each list can be selected — it is a layer of some level
 * the editor can enter (the page, a group, a stack or a list), with a box
 * there for the canvas to draw its handles on.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { layerOnSize } from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import { boxOf, childrenOf, type EditorDoc } from "../document";
import { isContainer, scopeDoc } from "../scope";

const BUNDLES = path.resolve(__dirname, "../../../../../../lib/template-bundles");
// A look folder has a look.json; the element library's `elements/` and build output don't.
const LOOKS = readdirSync(BUNDLES).filter((d) => existsSync(path.join(BUNDLES, d, "look.json")));
const SIZES: CardSize[] = ["square", "portrait", "story", "landscape"];

type Doc = { layers?: FreeLayer[]; pages?: Record<string, { layers: FreeLayer[] }> };

describe("editor reach", () => {
  it("reaches every layer and list cell of every look on every size", () => {
    expect(LOOKS.length).toBeGreaterThanOrEqual(17);
    let reached = 0;
    const missed: string[] = [];
    for (const look of LOOKS) {
      const files = readdirSync(path.join(BUNDLES, look)).filter(
        (f) => f.endsWith(".json") && f !== "look.json",
      );
      for (const file of files) {
        const { document } = JSON.parse(readFileSync(path.join(BUNDLES, look, file), "utf8")) as {
          document: Doc;
        };
        const pages = document.pages
          ? Object.entries(document.pages)
          : [["primary", { layers: document.layers ?? [] }] as const];
        for (const [page, { layers }] of pages) {
          const doc: EditorDoc = { layers };
          for (const size of SIZES) {
            // Walk the levels the editor can enter, as double-click and Layers do.
            const visit = (scope: string | null) => {
              for (const l of scopeDoc(doc, scope, size).layers ?? []) {
                if (!layerOnSize(l, size)) continue;
                if (boxOf(l, size)) reached += 1;
                else missed.push(`${look}/${file} ${page} ${size} ${l.id}`);
                if (isContainer(l)) visit(l.id);
              }
            };
            visit(null);
          }
        }
      }
    }
    expect(missed).toEqual([]);
    expect(reached).toBeGreaterThan(10_000);
  }, 60_000);

  it("opens every group and list the bundles hold", () => {
    const count = { groups: 0, lists: 0 };
    const walk = (list: FreeLayer[]) =>
      list.forEach((l) => {
        if (l.kind === "group") count.groups += 1;
        if (l.kind === "rows") count.lists += 1;
        if (l.kind === "group" || l.kind === "rows") expect(isContainer(l)).toBe(true);
        walk(childrenOf(l));
      });
    for (const look of LOOKS) {
      for (const f of readdirSync(path.join(BUNDLES, look)).filter(
        (x) => x.endsWith(".json") && x !== "look.json",
      )) {
        const { document } = JSON.parse(readFileSync(path.join(BUNDLES, look, f), "utf8")) as {
          document: Doc;
        };
        for (const p of Object.values(
          document.pages ?? { primary: { layers: document.layers ?? [] } },
        ))
          walk(p.layers);
      }
    }
    expect(count.groups).toBeGreaterThan(0);
    expect(count.lists).toBeGreaterThan(0);
  });
});
