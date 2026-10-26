/** Page token catalogues (T1.4): each page's tokens and their ADR-010 content fields. */
import { describe, expect, it } from "vitest";
import { contentFields, KIND_FIELDS, TEMPLATE_CARD_KINDS } from "./fields";
import { kindPages, primaryPage } from "./pages";
import {
  pageRepeat,
  pageTokenKeys,
  pageTokens,
  tokenContentField,
  type PageTokenCatalogue,
} from "./page-tokens";

const allTokens = (cat: PageTokenCatalogue) => [
  ...cat.fields,
  ...cat.images,
  ...cat.repeats,
  ...cat.repeats.flatMap((r) => r.fields),
];

describe("page token catalogues", () => {
  it("has a catalogue for every page of every kind, and none for pages a kind lacks", () => {
    for (const kind of [...TEMPLATE_CARD_KINDS, "results"]) {
      for (const page of kindPages(kind)) expect(pageTokens(kind, page)).not.toBeNull();
    }
    expect(pageTokens("ladder", "title")).toBeNull();
    expect(pageTokens("teamList", "day")).toBeNull();
  });

  it("extends KIND_FIELDS: a kind's single card binds everything it always could", () => {
    for (const kind of TEMPLATE_CARD_KINDS) {
      const cat = pageTokens(kind, primaryPage(kind))!;
      const v1 = KIND_FIELDS[kind];
      for (const f of v1.fields) expect(cat.fields.map((t) => t.key)).toContain(f.key);
      for (const i of v1.images) expect(cat.images.map((t) => t.key)).toContain(i.key);
      // Match Summary's match graphics rows come after the kind's own (M9).
      expect(cat.repeats.map((r) => r.key).slice(0, v1.repeats.length)).toEqual(
        v1.repeats.map((r) => r.key),
      );
    }
  });

  it("gives Match Summary's card the match graphics content (M9)", () => {
    const cat = pageTokens("matchSummary", "result")!;
    expect(cat.repeats.map((r) => r.key)).toEqual([
      "innings1.batting",
      "innings1.bowling",
      "innings1.pairs",
      "innings2.batting",
      "innings2.bowling",
      "innings2.pairs",
    ]);
    const keys = cat.fields.map((f) => f.key);
    for (const k of ["venue", "competition", "innings1.score", "innings2.scoreDash", "club.short"])
      expect(keys).toContain(k);
    expect(cat.images.map((i) => i.key)).toEqual(
      expect.arrayContaining(["innings1.logo", "innings2.logo", "winner.logo", "loser.logo"]),
    );
    const pairs = cat.repeats.find((r) => r.key === "innings1.pairs")!;
    expect(pairs.fields.map((f) => f.key)).toEqual(
      expect.arrayContaining(["batSurname", "batRuns", "bowlFiguresDash", "bowlOvers"]),
    );
    expect(pairs.content).toBe("result.performers");
  });

  it("lists each token once per page", () => {
    for (const kind of [...TEMPLATE_CARD_KINDS, "results"]) {
      for (const page of kindPages(kind)) {
        const cat = pageTokens(kind, page)!;
        const keys = [...cat.fields, ...cat.images].map((t) => t.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it("names only the kind's own content fields, from the page's own slide", () => {
    const slideOf: Record<string, Record<string, string>> = {
      matchDay: { fixture: "fixture", title: "title", day: "fixture", sponsors: "sponsors" },
      matchSummary: { result: "result", day: "result" },
      teamList: { team: "team" },
    };
    for (const kind of TEMPLATE_CARD_KINDS) {
      const known = new Set(contentFields(kind).map((f) => f.key));
      for (const page of kindPages(kind)) {
        for (const token of allTokens(pageTokens(kind, page)!)) {
          if (!token.content) continue;
          expect(known.has(token.content), `${kind}/${page}/${token.key}`).toBe(true);
          expect(token.content.split(".")[0]).toBe(slideOf[kind]?.[page]);
        }
      }
    }
  });

  it("gives non-content kinds no content fields (always shown)", () => {
    for (const kind of TEMPLATE_CARD_KINDS) {
      if (["matchDay", "matchSummary", "teamList"].includes(kind)) continue;
      expect(allTokens(pageTokens(kind, "card")!).every((t) => !t.content)).toBe(true);
    }
  });

  it("maps the ADR-010 examples", () => {
    expect(tokenContentField("matchDay", "fixture", "roundLabel")).toBe("fixture.round");
    expect(tokenContentField("matchDay", "fixture", "opposition.logo")).toBe(
      "fixture.oppositionCrest",
    );
    expect(tokenContentField("matchDay", "fixture", "photo")).toBe("fixture.photo");
    expect(tokenContentField("matchDay", "title", "weekendTitle")).toBe("title.heading");
    expect(tokenContentField("matchDay", "title", "dateRange")).toBe("title.dates");
    expect(tokenContentField("matchDay", "title", "photo")).toBe("title.coverPhoto");
    expect(tokenContentField("matchDay", "sponsors", "sponsors")).toBe("sponsors.logos");
    expect(tokenContentField("matchDay", "sponsors", "photo")).toBe("sponsors.background");
    expect(tokenContentField("matchSummary", "result", "club.performers")).toBe(
      "result.performers",
    );
    expect(tokenContentField("results", "result", "opposition.logo")).toBe(
      "result.oppositionCrest",
    );
    expect(tokenContentField("teamList", "team", "photo")).toBe("team.photo");
    expect(tokenContentField("teamList", "team", "players")).toBe("team.players");
    // Club identity and layout values are always shown.
    expect(tokenContentField("matchDay", "fixture", "clubName")).toBeNull();
    expect(tokenContentField("ladder", "card", "competitionName")).toBeNull();
    // Day slides have no photo.
    expect(tokenContentField("matchDay", "day", "photo")).toBeNull();
  });

  it("adds the new repeats: day rows and sponsors", () => {
    expect(pageRepeat("matchDay", "day", "dayRows")?.fields.map((f) => f.key)).toEqual(
      expect.arrayContaining(["grade", "opposition", "time", "crest"]),
    );
    expect(pageRepeat("matchSummary", "day", "dayRows")?.fields.map((f) => f.key)).toEqual(
      expect.arrayContaining(["grade", "opposition", "word", "clubScore", "oppScore", "crest"]),
    );
    expect(pageRepeat("results", "day", "dayRows")).not.toBeNull();
    expect(pageRepeat("matchDay", "sponsors", "sponsors")?.fields.map((f) => f.key)).toEqual([
      "name",
      "logo",
    ]);
    expect(pageRepeat("matchDay", "fixture", "sponsors")).toBeNull();
  });

  it("lets every page use the club crest and ground photo", () => {
    for (const kind of [...TEMPLATE_CARD_KINDS, "results"]) {
      for (const page of kindPages(kind)) {
        const keys = pageTokenKeys(kind, page);
        expect(keys.has("clubLogo")).toBe(true);
        expect(keys.has("groundPhoto")).toBe(true);
      }
    }
  });

  it("returns copies, so a caller can't change the catalogue", () => {
    const a = pageTokens("matchDay", "title")!;
    a.fields.push({ key: "x", label: "x" });
    expect(pageTokens("matchDay", "title")!.fields.some((f) => f.key === "x")).toBe(false);
  });
});
