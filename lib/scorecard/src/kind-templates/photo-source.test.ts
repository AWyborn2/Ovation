/**
 * Photo layer sources: a photo layer's optional `source` (a team list player
 * or a photo collection) — what the validator accepts, how a stored source is
 * read (leniently: a bad one reads as none), and which layers of a document
 * have one, keyed by their link or id.
 */
import { describe, expect, it } from "vitest";
import { photoLayerKey, readPhotoSource, sourcedPhotoLayers } from "./normalise";
import { primaryPage } from "./pages";
import { templateDocumentErrors } from "./validate";

const box = { x: 10, y: 10, w: 80, h: 40 };
const geometry = { square: box };
const photo = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: "photo",
  geometry,
  ...over,
});
const doc = (layers: unknown[], page: string = primaryPage("teamList")) => ({
  formatVersion: 2,
  pages: { [page]: { layers } },
});
const errors = (source: unknown, kind = "photo") =>
  templateDocumentErrors(
    doc([kind === "photo" ? photo("p", { source }) : { ...photo("p", { source }), kind }]),
    "teamList",
  );

describe("photo layer source validation", () => {
  it("accepts player picks and a collection", () => {
    for (const pick of ["random", "captain", "viceCaptain", "keeper"])
      expect(errors({ kind: "player", pick })).toEqual([]);
    expect(errors({ kind: "player", pick: "position", position: 12 })).toEqual([]);
    expect(errors({ kind: "collection", collectionId: 4 })).toEqual([]);
  });

  it("refuses malformed sources, and a source on anything but a photo", () => {
    expect(errors({ kind: "player", pick: "twelfth" }).join()).toMatch(/pick must be one of/);
    expect(errors({ kind: "player", pick: "position" }).join()).toMatch(/position must be/);
    expect(errors({ kind: "player", pick: "position", position: 13 }).join()).toMatch(
      /position must be/,
    );
    expect(errors({ kind: "player", pick: "captain", position: 2 }).join()).toMatch(
      /only for the player at a list position/,
    );
    expect(errors({ kind: "collection", collectionId: 0 }).join()).toMatch(/collection id/);
    expect(errors({ kind: "collection", collectionId: 2, extra: 1 }).join()).toMatch(/unknown/);
    expect(errors({ kind: "folder" }).join()).toMatch(/"player" or "collection"/);
    expect(errors("captain").join()).toMatch(/must be \{ kind/);
    expect(
      templateDocumentErrors(
        doc([
          {
            id: "i",
            kind: "image",
            content: "{{clubLogo}}",
            geometry,
            source: { kind: "player", pick: "random" },
          },
        ]),
        "teamList",
      ).join(),
    ).toMatch(/isn't a photo/);
  });
});

describe("reading a photo layer's source", () => {
  it("reads a valid source and drops anything else", () => {
    expect(readPhotoSource(photo("p", { source: { kind: "player", pick: "keeper" } }))).toEqual({
      kind: "player",
      pick: "keeper",
    });
    expect(
      readPhotoSource(photo("p", { source: { kind: "player", pick: "position", position: 3 } })),
    ).toEqual({ kind: "player", pick: "position", position: 3 });
    // A stray position on a role pick is dropped.
    expect(
      readPhotoSource(photo("p", { source: { kind: "player", pick: "captain", position: 3 } })),
    ).toEqual({ kind: "player", pick: "captain" });
    expect(
      readPhotoSource(photo("p", { source: { kind: "collection", collectionId: 7 } })),
    ).toEqual({ kind: "collection", collectionId: 7 });
    for (const bad of [
      { kind: "player", pick: "position", position: 0 },
      { kind: "player", pick: "nope" },
      { kind: "collection", collectionId: "7" },
      { kind: "folder", folderId: 1 },
      null,
    ])
      expect(readPhotoSource(photo("p", { source: bad }))).toBeNull();
    expect(
      readPhotoSource({ id: "i", kind: "image", source: { kind: "player", pick: "random" } }),
    ).toBeNull();
  });

  it("lists a document's sourced photo layers once per key, groups and pages included", () => {
    const source = { kind: "player", pick: "captain" };
    const layers = sourcedPhotoLayers(
      {
        formatVersion: 2,
        pages: {
          card: {
            layers: [
              photo("plain"),
              photo("square", { link: "hero", source }),
              photo("story", { link: "hero", source }),
              {
                id: "g",
                kind: "group",
                geometry,
                children: [photo("inner", { source: { kind: "collection", collectionId: 2 } })],
              },
            ],
          },
          title: { layers: [photo("cover", { source: { kind: "player", pick: "random" } })] },
        },
      },
      "matchDay",
    );
    expect(layers).toEqual([
      { key: "link:hero", source },
      { key: "inner", source: { kind: "collection", collectionId: 2 } },
      { key: "cover", source: { kind: "player", pick: "random" } },
    ]);
    // A v1 document reads as its kind's primary page.
    expect(
      sourcedPhotoLayers(
        { layers: [photo("p", { source: { kind: "player", pick: "keeper" } })] },
        "teamList",
      ),
    ).toEqual([{ key: "p", source: { kind: "player", pick: "keeper" } }]);
    expect(sourcedPhotoLayers(null, "teamList")).toEqual([]);
    expect(photoLayerKey({ id: "a" })).toBe("a");
    expect(photoLayerKey({ id: "a", link: "b" })).toBe("link:b");
  });
});
