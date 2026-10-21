/**
 * Figma REST client for the template import (ADR-011 §9, T8.2).
 *
 * Read only, with the scope Ovation's token has ("File content: read"):
 * `GET /v1/files/:key`, `GET /v1/files/:key/nodes` and `GET /v1/images/:key`.
 * Variables need Figma Enterprise, so colours come from styles instead
 * (`figma-map.ts`, decision O7).
 *
 * The token goes in the `X-Figma-Token` header and nowhere else: never in a
 * URL, a log line or an error message. A refused token (expired or revoked)
 * gives one clear message saying how to replace it.
 */
import { env } from "../../config";
import type {
  FigmaFileResponse,
  FigmaImagesResponse,
  FigmaNode,
  FigmaNodesResponse,
  FigmaStyleMeta,
} from "./figma-types";

const FIGMA_API = "https://api.figma.com";
const FIGMA_TIMEOUT_MS = 30_000;
/** Node ids per request: keeps the query string well under URL limits. */
const IDS_PER_REQUEST = 50;

export type FigmaErrorCode =
  | "not-configured"
  | "bad-url"
  | "token"
  | "forbidden"
  | "not-found"
  | "rate-limited"
  | "http"
  | "network";

export class FigmaError extends Error {
  constructor(
    readonly code: FigmaErrorCode,
    message: string,
    readonly status?: number,
    /** For `rate-limited`: Figma's `Retry-After`, in seconds. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "FigmaError";
  }
}

export const FIGMA_MESSAGES = {
  notConfigured: "The Figma import is off: FIGMA_ACCESS_TOKEN isn't set.",
  token:
    "Figma refused the access token: it has expired or been revoked. Make a new personal access " +
    "token in Figma (Settings → Security, scope File content: read only), put it in " +
    "FIGMA_ACCESS_TOKEN and try again.",
  forbidden:
    "Figma won't open this file for Ovation's account. Share the file with the designer account, " +
    "or check the token has the File content: read scope.",
  notFound: "Figma can't find that file or frame. Check the link.",
  network: "Couldn't reach Figma. Try again in a minute.",
} as const;

// ── Links ───────────────────────────────────────────────────────────────────

/** A Figma file key and the node ids a link points at (`1-2` in a link is node `1:2`). */
export type FigmaLink = { fileKey: string; nodeIds: string[] };

const FILE_KEY = /^[A-Za-z0-9]{10,64}$/;
const NODE_ID = /^[A-Za-z0-9:;-]{3,100}$/;

/**
 * Reads a Figma design link (`figma.com/design/<key>/…?node-id=1-2`, the
 * older `/file/` and `/proto/` forms, branch links) or a bare file key.
 * FigJam boards, Slides and Make files aren't designs, so they're refused.
 */
export function parseFigmaUrl(input: string): FigmaLink {
  const text = input.trim();
  if (FILE_KEY.test(text)) return { fileKey: text, nodeIds: [] };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new FigmaError("bad-url", "That isn't a Figma link.");
  }
  if (url.protocol !== "https:" || !/^(www\.)?figma\.com$/i.test(url.hostname))
    throw new FigmaError("bad-url", "That isn't a Figma link.");
  const parts = url.pathname.split("/").filter(Boolean);
  const [type, key] = parts;
  if (type === "board" || type === "slides" || type === "make" || type === "deck")
    throw new FigmaError(
      "bad-url",
      "That's not a Figma design file. Import a design (figma.com/design/…).",
    );
  if (type !== "design" && type !== "file" && type !== "proto")
    throw new FigmaError("bad-url", "That isn't a link to a Figma design file.");
  // A branch link names the branch's own key after `/branch/`.
  const branch = parts[2] === "branch" ? parts[3] : undefined;
  const fileKey = branch ?? key;
  if (!fileKey || !FILE_KEY.test(fileKey))
    throw new FigmaError("bad-url", "That Figma link has no file key.");
  const nodeIds: string[] = [];
  const nodeParam = url.searchParams.get("node-id");
  if (nodeParam) {
    for (const raw of nodeParam.split(",")) {
      const id = raw.trim().replace(/-/g, ":");
      if (NODE_ID.test(id)) nodeIds.push(id);
    }
  }
  return { fileKey, nodeIds };
}

// ── Client ──────────────────────────────────────────────────────────────────

/** The slice of `fetch` the client uses, so tests can pass their own. */
export type FigmaFetch = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export type FigmaClient = {
  /** The file's tree, `depth` levels down (1 = pages, 2 = each page's top-level frames). */
  getFile(fileKey: string, opts?: { depth?: number }): Promise<FigmaFileResponse>;
  /** Whole subtrees for `ids`, with transforms and sizes (`geometry=paths`). */
  getNodes(fileKey: string, ids: readonly string[]): Promise<FigmaNodesResponse>;
  /** Renders of `ids` as temporary download URLs (null where a node didn't render). */
  getImages(
    fileKey: string,
    ids: readonly string[],
    opts: { format: "svg" | "png"; scale?: number },
  ): Promise<Record<string, string | null>>;
};

export type FigmaClientOptions = {
  token: string;
  fetch?: FigmaFetch;
  baseUrl?: string;
  timeoutMs?: number;
};

export function createFigmaClient(opts: FigmaClientOptions): FigmaClient {
  const fetchImpl: FigmaFetch = opts.fetch ?? (fetch as unknown as FigmaFetch);
  const base = opts.baseUrl ?? FIGMA_API;
  const timeoutMs = opts.timeoutMs ?? FIGMA_TIMEOUT_MS;

  async function get<T>(path: string, query: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams(query).toString();
    const url = `${base}${path}${qs ? `?${qs}` : ""}`;
    let res: Awaited<ReturnType<FigmaFetch>>;
    try {
      res = await fetchImpl(url, {
        headers: { "X-Figma-Token": opts.token },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new FigmaError("network", FIGMA_MESSAGES.network);
    }
    if (res.ok) return (await res.json()) as T;
    throw await responseError(res);
  }

  const keyPath = (fileKey: string) => {
    if (!FILE_KEY.test(fileKey))
      throw new FigmaError("bad-url", "That Figma file key isn't valid.");
    return encodeURIComponent(fileKey);
  };

  return {
    getFile(fileKey, { depth } = {}) {
      return get<FigmaFileResponse>(
        `/v1/files/${keyPath(fileKey)}`,
        depth ? { depth: String(depth) } : {},
      );
    },

    async getNodes(fileKey, ids) {
      const path = `/v1/files/${keyPath(fileKey)}/nodes`;
      const merged: FigmaNodesResponse = { name: "", nodes: {} };
      for (const chunk of chunks(ids, IDS_PER_REQUEST)) {
        const res = await get<FigmaNodesResponse>(path, {
          ids: chunk.join(","),
          geometry: "paths",
        });
        merged.name = res.name;
        merged.lastModified = res.lastModified;
        merged.version = res.version;
        Object.assign(merged.nodes, res.nodes);
      }
      return merged;
    },

    async getImages(fileKey, ids, { format, scale }) {
      const path = `/v1/images/${keyPath(fileKey)}`;
      const images: Record<string, string | null> = {};
      for (const chunk of chunks(ids, IDS_PER_REQUEST)) {
        const query: Record<string, string> = { ids: chunk.join(","), format };
        if (format === "png" && scale) query.scale = String(scale);
        if (format === "svg") query.svg_outline_text = "true";
        const res = await get<FigmaImagesResponse>(path, query);
        if (res.err) throw new FigmaError("http", `Figma couldn't render the frames (${res.err}).`);
        Object.assign(images, res.images);
      }
      return images;
    },
  };
}

/** The client on Ovation's token; `not-configured` when FIGMA_ACCESS_TOKEN is unset. */
export function figmaClientFromEnv(fetchImpl?: FigmaFetch): FigmaClient {
  const token = env.FIGMA_ACCESS_TOKEN();
  if (!token) throw new FigmaError("not-configured", FIGMA_MESSAGES.notConfigured);
  return createFigmaClient({ token, fetch: fetchImpl });
}

async function responseError(res: Awaited<ReturnType<FigmaFetch>>): Promise<FigmaError> {
  // Figma's error body is `{ status, err }`; only `err` is read, and only to tell a bad
  // token from a file the account can't open.
  let err = "";
  try {
    const body = (await res.json()) as { err?: unknown; message?: unknown };
    err = String(body?.err ?? body?.message ?? "");
  } catch {
    // Not JSON: the status decides.
  }
  if (res.status === 401 || (res.status === 403 && /token|expired|revoked/i.test(err)))
    return new FigmaError("token", FIGMA_MESSAGES.token, res.status);
  if (res.status === 403) return new FigmaError("forbidden", FIGMA_MESSAGES.forbidden, 403);
  if (res.status === 404) return new FigmaError("not-found", FIGMA_MESSAGES.notFound, 404);
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after"));
    const seconds = Number.isFinite(retry) && retry > 0 ? retry : undefined;
    return new FigmaError(
      "rate-limited",
      `Figma is rate limiting Ovation's account. Try again${seconds ? ` in ${seconds} s` : " shortly"}.`,
      429,
      seconds,
    );
  }
  return new FigmaError("http", `Figma answered ${res.status}.`, res.status);
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── Frames ──────────────────────────────────────────────────────────────────

/** Node types that can be a page frame. */
const FRAME_TYPES = new Set(["FRAME", "COMPONENT", "INSTANCE"]);

/** What an import maps: candidate page frames and the styles their nodes use. */
export type FigmaFrames = {
  fileName: string;
  version?: string;
  frames: FigmaNode[];
  styles: Record<string, FigmaStyleMeta>;
  /** Node ids asked for that Figma couldn't find. */
  missing: string[];
};

/**
 * The candidate page frames of a link: the frames it names (a page or a
 * section names its top-level frames), or every top-level frame of the file
 * when it names none. Fetched whole, with transforms, for `figmaToTemplate`.
 */
export async function loadFigmaFrames(client: FigmaClient, link: FigmaLink): Promise<FigmaFrames> {
  const ids = await frameIds(client, link);
  if (ids.length === 0) return { fileName: "", frames: [], styles: {}, missing: [] };
  return framesFromNodes(await client.getNodes(link.fileKey, ids), ids);
}

/** The node ids a link names, or the file's top-level frames when it names none. */
export async function frameIds(client: FigmaClient, link: FigmaLink): Promise<string[]> {
  if (link.nodeIds.length) return link.nodeIds;
  const file = await client.getFile(link.fileKey, { depth: 2 });
  return topLevelFrames(file.document).map((n) => n.id);
}

/** The candidate frames and styles of a nodes response (a page or section gives its frames). */
export function framesFromNodes(res: FigmaNodesResponse, ids: readonly string[]): FigmaFrames {
  const frames: FigmaNode[] = [];
  const styles: Record<string, FigmaStyleMeta> = {};
  const missing: string[] = [];
  for (const id of ids) {
    const entry = res.nodes[id];
    if (!entry) {
      missing.push(id);
      continue;
    }
    Object.assign(styles, entry.styles ?? {});
    frames.push(
      ...(FRAME_TYPES.has(entry.document.type) ? [entry.document] : topLevelFrames(entry.document)),
    );
  }
  return { fileName: res.name, version: res.version, frames, styles, missing };
}

/** The frames directly on a page, a section or the document's pages. */
export function topLevelFrames(node: FigmaNode): FigmaNode[] {
  const out: FigmaNode[] = [];
  for (const child of node.children ?? []) {
    if (FRAME_TYPES.has(child.type)) out.push(child);
    else if (child.type === "CANVAS" || child.type === "SECTION")
      out.push(...topLevelFrames(child));
  }
  return out;
}
