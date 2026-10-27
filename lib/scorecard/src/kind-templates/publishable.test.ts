import { describe, expect, it } from "vitest";
import {
  publishableDocument,
  publishableElementLayers,
  palettesUsed,
  type PublishIdentity,
} from "./publishable";

const club: PublishIdentity = {
  logoUrl: "/api/storage/objects/brand/crest.png",
  clubNames: ["Halls Head Cricket Club", "Halls Head"],
  sponsorNames: ["Coastal Plumbing", "Ace"],
  sponsorLogoUrls: ["/api/storage/objects/sponsors/coastal.png"],
  colours: { "--gold": "#F5B400", "--panel": "#00305C", "--ink": "#ffffff" },
};

const box = { square: { x: 0, y: 0, w: 50, h: 10 } };

describe("publishableDocument", () => {
  const doc = {
    formatVersion: 2,
    pages: {
      title: {
        background: { colour: "#00305c" },
        layers: [
          { id: "crest", kind: "image", geometry: box, content: club.logoUrl },
          { id: "name", kind: "text", geometry: box, content: "Halls Head Cricket Club" },
          { id: "hello", kind: "text", geometry: box, content: "Welcome to Halls Head!" },
          {
            id: "thanks",
            kind: "text",
            geometry: box,
            content: "Proudly backed by Coastal Plumbing",
          },
          { id: "space", kind: "text", geometry: box, content: "Make space for everyone" },
          { id: "field", kind: "text", geometry: box, content: "{{teamName}} v {{opposition}}" },
        ],
      },
      fixture: {
        layers: [
          {
            id: "g",
            kind: "group",
            geometry: box,
            children: [
              { id: "sp", kind: "image", geometry: box, content: club.sponsorLogoUrls![0] },
              {
                id: "pic",
                kind: "image",
                geometry: box,
                content: "/api/storage/objects/library/x.jpg",
              },
              {
                id: "art",
                kind: "image",
                geometry: box,
                content:
                  "/api/storage/public-objects/library/0b6f3f3e-1d2c-4a1b-9b11-2b3c4d5e6f70.png",
              },
              { id: "band", kind: "shape", geometry: box, style: { background: "#F5B400" } },
            ],
          },
        ],
      },
    },
  };

  const { document, changes, flags } = publishableDocument(doc, club);
  const pages = (
    document as {
      pages: Record<string, { layers: Array<Record<string, unknown>>; background?: unknown }>;
    }
  ).pages;
  const title = pages.title!.layers;
  const group = pages.fixture!.layers[0]!.children as Array<Record<string, unknown>>;

  it("swaps the crest, sponsor logos, photos and colours on every page, groups included", () => {
    expect(title[0]).toMatchObject({ id: "crest", kind: "image", content: "{{clubLogo}}" });
    expect(group[0]).toMatchObject({ id: "sp", kind: "image", content: "{{sponsor1}}" });
    expect(group[1]).toMatchObject({ id: "pic", kind: "photo" });
    expect(group[1]).not.toHaveProperty("content");
    // Library art stays.
    expect(group[2]!.content).toMatch(/^\/api\/storage\/public-objects\/library\//);
    expect(group[3]!.style).toEqual({ background: "var(--gold)" });
    expect(pages.title!.background).toEqual({ colour: "var(--panel)" });
    expect(changes.map((c) => `${c.page}:${c.layerId}:${c.what}`).sort()).toEqual(
      [
        "fixture:band:clubColour",
        "fixture:pic:photo",
        "fixture:sp:sponsorLogo",
        "title:background:clubColour",
        "title:crest:clubLogo",
        "title:name:clubName",
      ].sort(),
    );
  });

  it("makes the club's whole name a field and flags names inside other text", () => {
    expect(title[1]!.content).toBe("{{clubName}}");
    // Flagged, not rewritten: the author decides.
    expect(title[2]!.content).toBe("Welcome to Halls Head!");
    expect(flags).toEqual([
      { page: "title", layerId: "hello", kind: "clubName", text: "Halls Head" },
      { page: "title", layerId: "thanks", kind: "sponsorName", text: "Coastal Plumbing" },
    ]);
  });

  it("matches whole words only, and leaves fields alone", () => {
    // "Ace" is a sponsor; "space" must not match it.
    expect(flags.some((f) => f.layerId === "space")).toBe(false);
    expect(title[5]!.content).toBe("{{teamName}} v {{opposition}}");
  });

  it("leaves a document with nothing of the club's unchanged", () => {
    const clean = {
      formatVersion: 2,
      pages: {
        card: { layers: [{ id: "t", kind: "text", geometry: box, content: "{{playerName}}" }] },
      },
    };
    const out = publishableDocument(clean, club);
    expect(out.document).toEqual(clean);
    expect(out.changes).toEqual([]);
    expect(out.flags).toEqual([]);
  });

  it("reads a v1 document's layers as the card page", () => {
    const out = publishableDocument(
      { layers: [{ id: "c", kind: "image", geometry: box, content: club.logoUrl }] },
      club,
    );
    expect((out.document as { layers: Array<{ content: string }> }).layers[0]!.content).toBe(
      "{{clubLogo}}",
    );
    expect(out.changes).toEqual([{ page: "card", layerId: "c", what: "clubLogo" }]);
  });
});

describe("publishableElementLayers", () => {
  it("keeps Save as element's rules: renumbered ids, sample text, hidden and unknown kinds left out", () => {
    const { layers, skipped } = publishableElementLayers(
      [
        { id: "a", kind: "text", content: "Go Halls Head", name: "Title", locked: true },
        { id: "b", kind: "text", content: "plain words" },
        { id: "c", kind: "medal", name: "Medal" },
        { id: "d", kind: "shape", hidden: true },
        { id: "e", kind: "image", content: "https://example.org/a.png" },
        { id: "f", kind: "group", children: [{ id: "x", kind: "text", bind: "playerName" }] },
      ],
      club,
    );
    expect(layers).toEqual([
      { id: "e1", kind: "text", content: "Go {{clubName}}" },
      { id: "e2", kind: "text", content: "Text" },
      { id: "e5", kind: "photo" },
      {
        id: "e6",
        kind: "group",
        children: [{ id: "e6-1", kind: "text", content: "{{playerName}}" }],
      },
    ]);
    expect(skipped).toEqual(["Medal"]);
  });

  it("names the palettes a style uses", () => {
    expect(palettesUsed([{ style: { color: "var(--ck-stage)" } }])).toEqual(["club-kit"]);
    expect(palettesUsed([{ style: { color: "var(--gold)" } }])).toEqual([]);
  });
});
