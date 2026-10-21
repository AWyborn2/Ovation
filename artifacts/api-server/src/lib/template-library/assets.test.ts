/** Library asset policy and coverage (ADR-011 T3.12, T3.3). No database. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import {
  LIBRARY_ASSET_PREFIX,
  libraryAssetPolicyErrors,
  localPublicDir,
  readLocalPublicObject,
  saveLibraryAsset,
} from "./assets";
import { coversSize, documentCoverage } from "./coverage";

const LIB = `${LIBRARY_ASSET_PREFIX}0f8fad5b-d9cb-469f-a165-70867728950e.png`;

describe("library asset policy", () => {
  it("accepts tokens, slots and library images", () => {
    const doc = {
      layers: [
        { id: "a", kind: "image", content: "{{clubLogo}}", geometry: {} },
        { id: "b", kind: "image", content: LIB, geometry: {} },
        { id: "c", kind: "text", content: "{{playerName}} — visit our ground", geometry: {} },
        {
          id: "d",
          kind: "vector",
          svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#g)"/></svg>',
          geometry: {},
        },
      ],
    };
    expect(libraryAssetPolicyErrors(doc)).toEqual([]);
  });

  it("refuses a club upload, any other address and CSS url()s", () => {
    const doc = {
      formatVersion: 2,
      pages: {
        card: {
          layers: [
            { id: "a", kind: "image", content: "/api/storage/objects/uploads/abc", geometry: {} },
            { id: "b", kind: "image", content: "https://example.com/logo.png", geometry: {} },
            {
              id: "c",
              kind: "shape",
              style: { background: "url(/api/storage/objects/x)" },
              geometry: {},
            },
            {
              id: "d",
              kind: "image",
              content: `${LIBRARY_ASSET_PREFIX}../secret.png`,
              geometry: {},
            },
          ],
        },
      },
    };
    const errors = libraryAssetPolicyErrors(doc);
    expect(errors).toHaveLength(4);
    expect(errors[0]).toContain("pages.card.layers[0].content");
  });
});

describe("dev filesystem store (LOCAL_OBJECT_STORAGE_DIR)", () => {
  const saved = process.env.LOCAL_OBJECT_STORAGE_DIR;
  const deployment = process.env.REPLIT_DEPLOYMENT;
  let dir: string | null = null;
  afterEach(async () => {
    if (saved === undefined) delete process.env.LOCAL_OBJECT_STORAGE_DIR;
    else process.env.LOCAL_OBJECT_STORAGE_DIR = saved;
    if (deployment === undefined) delete process.env.REPLIT_DEPLOYMENT;
    else process.env.REPLIT_DEPLOYMENT = deployment;
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it("writes library assets to disk and serves only library asset names", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ovation-lib-"));
    process.env.LOCAL_OBJECT_STORAGE_DIR = dir;
    const url = await saveLibraryAsset(Buffer.from("png-bytes"), "image/png");
    expect(url.startsWith(LIBRARY_ASSET_PREFIX)).toBe(true);
    expect(libraryAssetPolicyErrors({ layers: [{ content: url }] })).toEqual([]);
    const name = url.slice(LIBRARY_ASSET_PREFIX.length);
    const got = await readLocalPublicObject(`library/${name}`);
    expect(got?.contentType).toBe("image/png");
    expect(got?.bytes.toString()).toBe("png-bytes");
    expect(await readLocalPublicObject(`library/../../${name}`)).toBeNull();
    expect(await readLocalPublicObject("uploads/whatever.png")).toBeNull();
  });

  it("is ignored on a Replit deployment", () => {
    process.env.LOCAL_OBJECT_STORAGE_DIR = "/tmp/anything";
    process.env.REPLIT_DEPLOYMENT = "1";
    expect(localPublicDir()).toBeNull();
  });
});

describe("coverage", () => {
  it("reads a v1 document as its kind's primary page and lists the sizes it designs", () => {
    const cov = documentCoverage(placeholderDocument("matchDay"), "matchDay");
    expect(cov.pages).toEqual(["fixture"]);
    expect(cov.sizes.length).toBeGreaterThan(0);
    expect(coversSize(cov, cov.sizes[0]!)).toBe(true);
  });

  it("covers a size only when every page has layers on it", () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    const doc = {
      formatVersion: 2,
      pages: {
        fixture: { layers: [{ id: "a", kind: "shape", geometry: { square: box, story: box } }] },
        title: {
          layers: [{ id: "b", kind: "shape", sizes: ["square"], geometry: { square: box } }],
        },
      },
    };
    expect(documentCoverage(doc, "matchDay")).toEqual({
      pages: ["title", "fixture"],
      sizes: ["square"],
    });
    expect(documentCoverage({ layers: [] }, "milestone")).toEqual({ pages: [], sizes: [] });
  });
});
