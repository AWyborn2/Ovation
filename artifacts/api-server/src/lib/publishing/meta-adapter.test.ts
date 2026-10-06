import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setGraphTransport, classifyGraphError, redact, type GraphRequest } from "./meta-client";
import { metaDestination } from "./meta-adapter";
import { DestinationError, type DestinationAccount, type PreparedPost } from "./destination";

const TOKEN = "EAAPageTokenAbcdefghijklmnop";
const account: DestinationAccount = { pageId: "page1", igUserId: "ig1", token: TOKEN };
const saved = { ...process.env };

type Route = (req: GraphRequest, params: URLSearchParams) => { status?: number; json: unknown };
let calls: { method: string; path: string; params: URLSearchParams; req: GraphRequest }[] = [];

function serve(route: Route) {
  calls = [];
  setGraphTransport(async (req) => {
    const u = new URL(req.url);
    const params = req.method === "GET" ? u.searchParams : new URLSearchParams(req.body ?? "");
    const path = u.pathname.replace(/^\/v[\d.]+\//, "");
    calls.push({ method: req.method, path, params, req });
    const out = route({ ...req, url: path }, params);
    return { status: out.status ?? 200, json: out.json };
  });
}

const post = (over: Partial<PreparedPost>): PreparedPost => ({
  platform: "instagram",
  postType: "feed",
  imageUrls: ["https://x.test/a.jpg"],
  caption: "Hello",
  ...over,
});

describe("meta adapter", () => {
  beforeEach(() => {
    process.env.META_APP_SECRET = "app-secret-value";
    process.env.META_GRAPH_VERSION = "v26.0";
  });
  afterEach(() => {
    setGraphTransport(null);
    process.env = { ...saved };
  });

  it("classifies Graph errors into retry classes", () => {
    expect(classifyGraphError(400, { error: { code: 190 } }).kind).toBe("token");
    expect(classifyGraphError(400, { error: { code: 2 } }).kind).toBe("transient");
    expect(classifyGraphError(400, { error: { code: 100, is_transient: true } }).kind).toBe(
      "transient",
    );
    expect(classifyGraphError(400, { error: { code: 506 } }).kind).toBe("duplicate");
    expect(classifyGraphError(400, { error: { code: 100 } }).kind).toBe("permanent");
    expect(classifyGraphError(503, null).kind).toBe("transient");
  });

  it("never puts the token in a URL and always sends a proof", async () => {
    serve(() => ({ json: { id: "c1" } }));
    await metaDestination.createMedia(account, post({}));
    for (const c of calls) {
      expect(c.req.url).not.toContain(TOKEN);
      expect(c.req.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(c.params.get("appsecret_proof")).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("builds an Instagram carousel as children then parent, without publishing", async () => {
    let n = 0;
    serve(() => ({ json: { id: `c${++n}` } }));
    const ids = await metaDestination.createMedia(
      account,
      post({ imageUrls: ["https://x.test/1.jpg", "https://x.test/2.jpg"] }),
    );
    expect(ids).toEqual(["c1", "c2", "c3"]);
    expect(calls.map((c) => c.path)).toEqual(["ig1/media", "ig1/media", "ig1/media"]);
    expect(calls[0].params.get("is_carousel_item")).toBe("true");
    expect(calls[2].params.get("media_type")).toBe("CAROUSEL");
    expect(calls[2].params.get("children")).toBe("c1,c2");
    expect(calls[2].params.get("caption")).toBe("Hello");
    expect(calls.some((c) => c.path.endsWith("media_publish"))).toBe(false);
  });

  it("publishes a FINISHED container and reports IN_PROGRESS as processing", async () => {
    serve((req) =>
      req.url === "c9" ? { json: { status_code: "FINISHED" } } : { json: { id: "media42" } },
    );
    expect(await metaDestination.publish(account, post({}), ["c9"])).toEqual({
      kind: "published",
      postId: "media42",
    });

    serve(() => ({ json: { status_code: "IN_PROGRESS" } }));
    expect(await metaDestination.publish(account, post({}), ["c9"])).toEqual({
      kind: "processing",
    });
  });

  it("fails permanently on a container ERROR and asks for fresh media on EXPIRED", async () => {
    serve(() => ({ json: { status_code: "ERROR" } }));
    await expect(metaDestination.publish(account, post({}), ["c9"])).rejects.toMatchObject({
      kind: "permanent",
    });
    serve(() => ({ json: { status_code: "EXPIRED" } }));
    await expect(metaDestination.publish(account, post({}), ["c9"])).rejects.toMatchObject({
      kind: "transient",
      resetMedia: true,
    });
  });

  it("uploads a Facebook single photo unpublished, then one feed post", async () => {
    serve((req) =>
      req.url === "page1/photos" ? { json: { id: "p1" } } : { json: { id: "post1" } },
    );
    const fb = post({ platform: "facebook" });
    const ids = await metaDestination.createMedia(account, fb);
    expect(ids).toEqual(["p1"]);
    expect(calls[0].params.get("published")).toBe("false");
    const out = await metaDestination.publish(account, fb, ids);
    expect(out).toEqual({ kind: "published", postId: "post1" });
    const feed = calls.find((c) => c.path === "page1/feed")!;
    expect(feed.params.get("attached_media[0]")).toBe(JSON.stringify({ media_fbid: "p1" }));
    expect(feed.params.get("message")).toBe("Hello");
  });

  describe("landed-check (Covers AE7)", () => {
    it("finds a published Instagram container without publishing again", async () => {
      serve(() => ({ json: { status_code: "PUBLISHED" } }));
      expect(await metaDestination.findLanded(account, post({}), ["c1", "c2", "c3"])).toBe(
        "container:c3",
      );
      expect(calls.map((c) => c.path)).toEqual(["c3"]);
    });

    it("finds a Facebook feed post holding a stored photo id", async () => {
      serve(() => ({
        json: {
          data: [
            { id: "other", attachments: { data: [{ target: { id: "zz" } }] } },
            {
              id: "post7",
              attachments: { data: [{ subattachments: { data: [{ target: { id: "p2" } }] } }] },
            },
          ],
        },
      }));
      expect(
        await metaDestination.findLanded(account, post({ platform: "facebook" }), ["p1", "p2"]),
      ).toBe("post7");
    });

    it("finds Page stories for the stored photo ids", async () => {
      serve(() => ({ json: { data: [{ post_id: "s1", media_id: "p1" }] } }));
      const story = post({ platform: "facebook", postType: "story", caption: null });
      expect(await metaDestination.findLanded(account, story, ["p1"])).toBe("s1");
      expect(await metaDestination.findLanded(account, story, ["p1", "p2"])).toBeNull();
    });

    it("re-posts only the stories that did not land", async () => {
      serve((req) =>
        req.url === "page1/stories"
          ? { json: { data: [{ post_id: "s1", media_id: "p1" }] } }
          : { json: { post_id: "s2" } },
      );
      const story = post({ platform: "facebook", postType: "story", caption: null });
      expect(await metaDestination.publish(account, story, ["p1", "p2"])).toEqual({
        kind: "published",
        postId: "s1,s2",
      });
      expect(calls.filter((c) => c.path === "page1/photo_stories")).toHaveLength(1);
    });
  });

  it("keeps tokens and proofs out of thrown errors", async () => {
    serve(() => ({
      status: 400,
      json: { error: { code: 100, message: `bad token ${TOKEN} proof ${"a".repeat(64)}` } },
    }));
    const err = await metaDestination.createMedia(account, post({})).catch((e) => e);
    expect(err).toBeInstanceOf(DestinationError);
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).not.toContain("a".repeat(64));
    expect(redact(`x ${TOKEN} y`)).toBe("x [redacted] y");
  });

  it("reports a revoked token and a removed permission as unhealthy", async () => {
    serve(() => ({ status: 400, json: { error: { code: 190, message: "expired" } } }));
    expect(await metaDestination.checkHealth(account)).toEqual({
      ok: false,
      reason: "Meta access was revoked or expired.",
    });
    serve(() => ({ status: 403, json: { error: { code: 10, message: "perm" } } }));
    expect(await metaDestination.checkHealth(account)).toMatchObject({ ok: false });
    serve(() => ({ json: { id: "x" } }));
    expect(await metaDestination.checkHealth(account)).toEqual({ ok: true });
  });
});
