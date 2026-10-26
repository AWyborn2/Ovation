import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FigmaError,
  createFigmaClient,
  figmaClientFromEnv,
  loadFigmaFrames,
  parseFigmaUrl,
  type FigmaClient,
  type FigmaFetch,
} from "./figma";
import type { FigmaNodesResponse } from "./figma-types";

const TOKEN = "figd_test-token-never-shown";
const KEY = "AbCdEfGhIjKlMnOpQrStUv";

const FIXTURE = JSON.parse(
  readFileSync(new URL("./__fixtures__/figma-century.json", import.meta.url), "utf8"),
) as FigmaNodesResponse;

type Call = { url: string; headers: Record<string, string> };

/** A fetch that answers from `respond` and records each call. */
function fakeFetch(
  respond: (url: URL) => { status?: number; body?: unknown; headers?: Record<string, string> },
) {
  const calls: Call[] = [];
  const fn: FigmaFetch = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const { status = 200, body = {}, headers = {} } = respond(new URL(url));
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      json: async () => body,
    };
  };
  return { fn, calls };
}

async function errorOf(promise: Promise<unknown>): Promise<FigmaError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(FigmaError);
    return err as FigmaError;
  }
  throw new Error("expected a FigmaError");
}

describe("parseFigmaUrl", () => {
  it("reads design, file and prototype links, with node ids", () => {
    expect(parseFigmaUrl(`https://www.figma.com/design/${KEY}/Looks?node-id=10-1&t=abc`)).toEqual({
      fileKey: KEY,
      nodeIds: ["10:1"],
    });
    expect(parseFigmaUrl(`https://figma.com/file/${KEY}/Looks`)).toEqual({
      fileKey: KEY,
      nodeIds: [],
    });
    expect(parseFigmaUrl(`https://www.figma.com/proto/${KEY}/Looks?node-id=1%3A2`).nodeIds).toEqual(
      ["1:2"],
    );
    expect(parseFigmaUrl(KEY)).toEqual({ fileKey: KEY, nodeIds: [] });
  });

  it("uses the branch's own key for a branch link", () => {
    const branch = "ZyXwVuTsRqPoNmLkJiHg";
    expect(
      parseFigmaUrl(`https://www.figma.com/design/${KEY}/branch/${branch}/Looks`).fileKey,
    ).toBe(branch);
  });

  it("refuses links that aren't Figma design files", () => {
    for (const bad of [
      `https://www.figma.com/board/${KEY}/Ideas`,
      `https://www.figma.com/slides/${KEY}/Deck`,
      `https://evil.example/design/${KEY}/Looks`,
      `http://www.figma.com/design/${KEY}/Looks`,
      "not a link",
    ]) {
      expect(() => parseFigmaUrl(bad), bad).toThrow(FigmaError);
    }
  });
});

describe("Figma client (T8.2)", () => {
  it("sends the token only in its header, and asks for whole subtrees with transforms", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: FIXTURE }));
    const client = createFigmaClient({ token: TOKEN, fetch: fn });
    const res = await client.getNodes(KEY, ["10:1", "20:1"]);
    expect(Object.keys(res.nodes)).toEqual(["10:1", "20:1"]);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe(`https://api.figma.com/v1/files/${KEY}/nodes`);
    expect(url.searchParams.get("ids")).toBe("10:1,20:1");
    expect(url.searchParams.get("geometry")).toBe("paths");
    expect(calls[0]!.url).not.toContain(TOKEN);
    expect(calls[0]!.headers).toEqual({ "X-Figma-Token": TOKEN });
  });

  it("asks for many nodes in batches and merges them", async () => {
    const { fn, calls } = fakeFetch((url) => ({
      body: {
        name: "File",
        nodes: Object.fromEntries(
          (url.searchParams.get("ids") ?? "").split(",").map((id) => [id, null]),
        ),
      },
    }));
    const ids = Array.from({ length: 120 }, (_, i) => `1:${i}`);
    const res = await createFigmaClient({ token: TOKEN, fetch: fn }).getNodes(KEY, ids);
    expect(calls).toHaveLength(3);
    expect(Object.keys(res.nodes)).toHaveLength(120);
  });

  it("exports SVG and PNG renders", async () => {
    const { fn, calls } = fakeFetch(() => ({
      body: { err: null, images: { "10:9": "https://figma-alpha-api.s3/x.svg" } },
    }));
    const client = createFigmaClient({ token: TOKEN, fetch: fn });
    expect(await client.getImages(KEY, ["10:9"], { format: "svg" })).toEqual({
      "10:9": "https://figma-alpha-api.s3/x.svg",
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe(`/v1/images/${KEY}`);
    expect(url.searchParams.get("format")).toBe("svg");
    await client.getImages(KEY, ["10:8"], { format: "png", scale: 2 });
    expect(new URL(calls[1]!.url).searchParams.get("scale")).toBe("2");
  });

  it("says how to replace an expired or revoked token, without showing it", async () => {
    for (const status of [401, 403]) {
      const { fn } = fakeFetch(() => ({ status, body: { status, err: "Invalid token" } }));
      const err = await errorOf(createFigmaClient({ token: TOKEN, fetch: fn }).getFile(KEY));
      expect(err.code).toBe("token");
      expect(err.message).toMatch(/expired or been revoked/);
      expect(err.message).toMatch(/FIGMA_ACCESS_TOKEN/);
      expect(err.message).not.toContain(TOKEN);
    }
  });

  it("tells a file the account can't open, a missing file and rate limits apart", async () => {
    const run = async (status: number, body: unknown, headers: Record<string, string> = {}) => {
      const { fn } = fakeFetch(() => ({ status, body, headers }));
      return errorOf(createFigmaClient({ token: TOKEN, fetch: fn }).getFile(KEY));
    };
    expect((await run(403, { status: 403, err: "Forbidden" })).code).toBe("forbidden");
    expect((await run(404, { status: 404, err: "Not found" })).code).toBe("not-found");
    const limited = await run(429, {}, { "retry-after": "30" });
    expect(limited).toMatchObject({ code: "rate-limited", retryAfterSeconds: 30 });
    expect((await run(500, "oops")).code).toBe("http");
  });

  it("reports a network failure", async () => {
    const fn: FigmaFetch = async () => {
      throw new TypeError("fetch failed");
    };
    expect((await errorOf(createFigmaClient({ token: TOKEN, fetch: fn }).getFile(KEY))).code).toBe(
      "network",
    );
  });

  it("is off until FIGMA_ACCESS_TOKEN is set", () => {
    vi.stubEnv("FIGMA_ACCESS_TOKEN", "");
    expect(() => figmaClientFromEnv()).toThrow(/FIGMA_ACCESS_TOKEN isn't set/);
    vi.stubEnv("FIGMA_ACCESS_TOKEN", TOKEN);
    expect(figmaClientFromEnv()).toBeDefined();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});

describe("loadFigmaFrames", () => {
  const client = (
    file: unknown,
    nodes: FigmaNodesResponse,
  ): FigmaClient & { asked: string[][] } => {
    const asked: string[][] = [];
    return {
      asked,
      getFile: async () => file as never,
      getNodes: async (_key, ids) => {
        asked.push([...ids]);
        return nodes;
      },
      getImages: async () => ({}),
    };
  };

  it("loads the frames a link names, with their styles", async () => {
    const c = client(null, FIXTURE);
    const frames = await loadFigmaFrames(c, { fileKey: KEY, nodeIds: ["10:1", "20:1"] });
    expect(frames.frames.map((f) => f.name)).toEqual(["card/square", "Century — story"]);
    expect(Object.keys(frames.styles).sort()).toEqual(["S:accent", "S:ink", "S:panel"]);
    expect(frames.missing).toEqual([]);
  });

  it("takes every top-level frame of a file when the link names none", async () => {
    const file = {
      name: "Looks",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "0:1",
            name: "Page 1",
            type: "CANVAS",
            children: [
              { id: "10:1", name: "card/square", type: "FRAME" },
              { id: "5:5", name: "Sticky", type: "STICKY" },
              {
                id: "7:7",
                name: "Stories",
                type: "SECTION",
                children: [{ id: "20:1", name: "s", type: "FRAME" }],
              },
            ],
          },
        ],
      },
    };
    const c = client(file, { ...FIXTURE, nodes: { ...FIXTURE.nodes, "9:9": null } });
    const frames = await loadFigmaFrames(c, { fileKey: KEY, nodeIds: [] });
    expect(c.asked).toEqual([["10:1", "20:1"]]);
    expect(frames.frames).toHaveLength(2);
  });

  it("lists the node ids Figma couldn't find", async () => {
    const c = client(null, { name: "Looks", nodes: { "9:9": null } });
    expect((await loadFigmaFrames(c, { fileKey: KEY, nodeIds: ["9:9"] })).missing).toEqual(["9:9"]);
  });
});
