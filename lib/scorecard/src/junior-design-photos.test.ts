import { describe, expect, it } from "vitest";
import { isJuniorDesign, juniorSafeDesignWith, photoKey } from "./junior-design-photos";

const lib = (n: string) => `/api/storage/objects/library/${n}`;
const upload = "/api/storage/objects/club-uploads/logo";
const image = (id: string, content: string) => ({ id, kind: "image", content });
const design = (...layers: unknown[]) => ({
  formatVersion: 2,
  pages: { title: { layers: [{ id: "p", kind: "photo" }, ...layers], background: lib("bg") } },
});
const ids = (d: unknown) =>
  (d as { pages: { title: { layers: Array<{ id: string }> } } }).pages.title.layers.map(
    (l) => l.id,
  );
const junior = { sourceMatchIsJunior: true, cardInput: { kind: "matchDay" } };
const rule = { approved: new Set([photoKey(lib("stock"))]) };

describe("juniorSafeDesignWith", () => {
  it("keeps approved junior stock; drops other library photos, raster uploads and backgrounds", () => {
    const safe = juniorSafeDesignWith(
      junior,
      design(image("lib", lib("club")), image("stock", lib("stock")), image("upload", upload), {
        id: "vector",
        kind: "vector",
        svg: "<svg/>",
      }),
      rule,
    );
    // A raster upload might be a photo of a child: the server drops it on save
    // and post (round 3 retest, #8), and now every web draw does too (retest 6).
    // A vector upload is markup, not a stored image, and stays.
    expect(ids(safe.design)).toEqual(["p", "stock", "vector"]);
    expect((safe.design as { pages: { title: object } }).pages.title).not.toHaveProperty(
      "background",
    );
    expect(safe.removed).toBe(3);
  });

  it("fails closed: with no approved list, no library photo is drawn", () => {
    const safe = juniorSafeDesignWith(junior, design(image("stock", lib("stock"))), {
      approved: new Set(),
    });
    expect(ids(safe.design)).toEqual(["p"]);
  });

  it("drops a junior player's photo unless it is the card's own cleared photo", () => {
    const child = design(image("child", "/api/juniors/photos/12"));
    expect(ids(juniorSafeDesignWith(junior, child, rule).design)).toEqual(["p"]);
    const cleared = {
      sourceMatchIsJunior: true,
      cardInput: { kind: "teamList", juniorPhotoAllowed: true },
      photoUrl: "/api/juniors/photos/12",
    };
    expect(ids(juniorSafeDesignWith(cleared, child, rule).design)).toEqual(["p", "child"]);
  });

  it("leaves a senior design as it is", () => {
    const d = design(image("lib", lib("club")));
    expect(
      juniorSafeDesignWith(
        { sourceMatchIsJunior: false, cardInput: { kind: "matchDay" } },
        d,
        rule,
      ),
    ).toEqual({ design: d, removed: 0 });
  });
});

describe("isJuniorDesign", () => {
  it("reads either junior marker", () => {
    expect(isJuniorDesign({ sourceMatchIsJunior: false, cardInput: { junior: true } })).toBe(true);
    expect(isJuniorDesign({ sourceMatchIsJunior: false, cardInput: { kind: "matchDay" } })).toBe(
      false,
    );
  });
});
