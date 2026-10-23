import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleSetDocument,
  freeSetFromDocument,
  isSetDocument,
  setFromDesign,
  setPageDocument,
  setTemplateKind,
  setTypeOfKind,
  SET_TYPES,
  type DataSetType,
  type SetDocument,
} from "./set-document";
import { templateDocumentErrors } from "./validate";

const BUNDLES = path.resolve(__dirname, "../../../template-bundles");

/** Every look folder's kind documents. */
function looks(): Array<{ look: string; docs: Map<string, unknown> }> {
  const out: Array<{ look: string; docs: Map<string, unknown> }> = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const dir = path.join(BUNDLES, look);
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, "look.json"))) continue;
    // A design system's looks (a `family`) design one kind each, so they assemble no sets.
    if (
      (JSON.parse(readFileSync(path.join(dir, "look.json"), "utf8")) as { family?: string }).family
    )
      continue;
    const docs = new Map<string, unknown>();
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json") || file === "look.json") continue;
      const parsed = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
        document: unknown;
      };
      docs.set(file.replace(/\.json$/, ""), parsed.document);
    }
    out.push({ look, docs });
  }
  return out;
}

const DATA_SETS: DataSetType[] = ["teamLists", "matchDay", "results", "matchSummary"];

describe("set kinds", () => {
  it("round-trips every set type through its stored kind", () => {
    for (const type of SET_TYPES) expect(setTypeOfKind(setTemplateKind(type))).toBe(type);
    expect(setTypeOfKind("teamList")).toBeNull();
    expect(setTypeOfKind("set:nope")).toBeNull();
  });

  it("refuses an unknown set kind", () => {
    expect(templateDocumentErrors({}, "set:nope")[0]).toMatch(/isn't a set type/);
  });
});

describe("assembling every look's set templates", () => {
  const all = looks();

  it("finds the looks", () => {
    expect(all.length).toBeGreaterThanOrEqual(10);
  });

  for (const { look, docs } of all) {
    for (const type of DATA_SETS) {
      it(`${look} ${type} assembles into a valid set`, () => {
        const built = assembleSetDocument(type, (kind) => docs.get(kind));
        expect(built).not.toBeNull();
        const doc = built!.document;
        expect(isSetDocument(doc)).toBe(true);
        expect(templateDocumentErrors(doc, setTemplateKind(type))).toEqual([]);
        // Cover first, sponsors last, every repeating page in between.
        expect(doc.pages[0]?.slot).toBe("cover");
        expect(doc.pages[doc.pages.length - 1]?.slot).toBe("sponsors");
      });
    }
  }

  it("opens Team lists with the Round Team Lists cover where a look has one", () => {
    const classic = all.find((l) => l.look === "broadcast-classic")!;
    const built = assembleSetDocument("teamLists", (k) => classic.docs.get(k))!;
    expect(built.sources).toEqual(["teamListRound.card", "teamList.team", "matchDay.sponsors"]);
    const gold = all.find((l) => l.look === "gold-foil")!;
    expect(assembleSetDocument("teamLists", (k) => gold.docs.get(k))!.sources[0]).toBe(
      "matchDay.title",
    );
  });

  it("copies each page's layers exactly as its kind's card has them", () => {
    const kit = all.find((l) => l.look === "club-kit")!;
    const built = assembleSetDocument("matchDay", (k) => kit.docs.get(k))!.document;
    const md = kit.docs.get("matchDay") as { pages: Record<string, { layers: unknown }> };
    for (const page of built.pages) expect(page.layers).toEqual(md.pages[page.page]!.layers);
    // A page as a kind document is that kind page alone.
    const fixture = built.pages.find((p) => p.slot === "fixture")!;
    expect(Object.keys(setPageDocument(built, fixture).pages)).toEqual(["fixture"]);
  });

  it("is null when a page the set needs has no source", () => {
    expect(assembleSetDocument("teamLists", () => undefined)).toBeNull();
  });
});

describe("set validation", () => {
  const kit = looks().find((l) => l.look === "club-kit")!;
  const base = (): SetDocument => assembleSetDocument("matchDay", (k) => kit.docs.get(k))!.document;
  const errors = (doc: unknown) => templateDocumentErrors(doc, setTemplateKind("matchDay"));

  it("names the page a layer problem is on", () => {
    const doc = base();
    doc.pages[1]!.layers = [{ id: "x", kind: "nope" } as never];
    expect(errors(doc).join(" ")).toMatch(/^Page 2 \(Fixture\): /);
  });

  it("refuses a page in the wrong slot or of the wrong kind", () => {
    const doc = base();
    doc.pages[1] = { ...doc.pages[1]!, kind: "teamList", page: "team" };
    expect(errors(doc).join(" ")).toMatch(/a fixture page draws matchDay's fixture page/);
    const fixed = base();
    fixed.pages[1] = { ...fixed.pages[1]!, role: "fixed" };
    expect(errors(fixed).join(" ")).toMatch(/repeats/);
  });

  it("keeps one design per repeating slot (C2)", () => {
    const doc = base();
    doc.pages.splice(2, 0, { ...doc.pages[1]!, id: "fixture-2" });
    expect(errors(doc).join(" ")).toMatch(/a set has one fixture page/);
  });

  it("allows extra design pages, and a free set of them only", () => {
    const doc = base();
    doc.pages.splice(1, 0, { ...doc.pages[0]!, id: "extra", role: "fixed", slot: "page" });
    expect(errors(doc)).toEqual([]);
    const free = freeSetFromDocument("matchDay", "title", kit.docs.get("matchDay"))!;
    expect(free.pages).toHaveLength(3);
    expect(templateDocumentErrors(free, setTemplateKind("free"))).toEqual([]);
    free.pages[1] = { ...free.pages[1]!, slot: "cover" };
    expect(templateDocumentErrors(free, setTemplateKind("free")).join(" ")).toMatch(
      /design pages only/,
    );
  });

  it("checks a draft's slide order", () => {
    const doc = { ...base(), arrangement: { order: ["cover", "fixture:1"], removed: [] } };
    expect(errors(doc)).toEqual([]);
    expect(errors({ ...base(), arrangement: { order: [1] } }).join(" ")).toMatch(/slide keys/);
  });

  it("refuses a set that says it is another type", () => {
    expect(templateDocumentErrors(base(), setTemplateKind("results")).join(" ")).toMatch(
      /results set/,
    );
  });
});

describe("a set made from one design (part 4)", () => {
  const kit = looks().find((l) => l.look === "club-kit")!;
  const gold = looks().find((l) => l.look === "gold-foil")!;
  const base = assembleSetDocument("teamLists", (k) => kit.docs.get(k))!.document;

  it("puts a Team List design on the team page, the look's other pages around it", () => {
    const set = setFromDesign("teamLists", base, "teamList", gold.docs.get("teamList"))!;
    const gl = gold.docs.get("teamList") as { pages: Record<string, { layers: unknown }> };
    expect(set.pages.find((p) => p.slot === "team")!.layers).toEqual(gl.pages.team!.layers);
    expect(set.pages.find((p) => p.slot === "cover")!.layers).toEqual(base.pages[0]!.layers);
    expect(templateDocumentErrors(set, setTemplateKind("teamLists"))).toEqual([]);
  });

  it("makes a Match Day design the cover and sponsors of any set", () => {
    const md = gold.docs.get("matchDay") as { pages: Record<string, { layers: unknown }> };
    const set = setFromDesign("teamLists", base, "matchDay", md)!;
    expect(set.pages[0]).toMatchObject({ slot: "cover", kind: "matchDay", page: "title" });
    expect(set.pages[0]!.layers).toEqual(md.pages.title!.layers);
    expect(set.pages.at(-1)!.layers).toEqual(md.pages.sponsors!.layers);
    expect(templateDocumentErrors(set, setTemplateKind("teamLists"))).toEqual([]);
  });

  it("opens with a design that fills no page, in place of the cover", () => {
    const set = setFromDesign("teamLists", base, "player", gold.docs.get("player"))!;
    expect(set.pages.map((p) => p.slot)).toEqual(["page", "team", "sponsors"]);
    expect(set.pages[0]).toMatchObject({ kind: "player", page: "card", name: "Cover" });
    expect(templateDocumentErrors(set, setTemplateKind("teamLists"))).toEqual([]);
  });

  it("makes a free set of the design and two copies", () => {
    const set = setFromDesign("free", null, "player", gold.docs.get("player"))!;
    expect(set.pages.map((p) => p.slot)).toEqual(["page", "page", "page"]);
    expect(templateDocumentErrors(set, setTemplateKind("free"))).toEqual([]);
  });

  it("needs the set's own base for a data set", () => {
    expect(setFromDesign("teamLists", null, "player", gold.docs.get("player"))).toBeNull();
    const md = assembleSetDocument("matchDay", (k) => kit.docs.get(k))!.document;
    expect(setFromDesign("teamLists", md, "player", gold.docs.get("player"))).toBeNull();
  });
});
