/**
 * The Figma import (ADR-011 §9, L8-B, T8.6–T8.8): a Figma design becomes an
 * unlisted console template in the library, with an import report.
 *
 * 1. Fetch the link's frames (`loadFigmaFrames`) and map them once
 *    (`figmaToTemplate`) to learn which nodes need Figma's renders.
 * 2. Fetch those renders: SVG for vectors (sanitised to the format's
 *    allowlist) and 2× PNG for image fills, copied to `library/` so the
 *    template never loads from Figma.
 * 3. Map again with the renders, then save the document as a console
 *    template: validated like every library version and sent to the fit job.
 *
 * Figma's temporary render URLs are fetched once and never stored or logged.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { kindFields, sanitiseSvg } from "@workspace/scorecard/kind-templates";
import { saveLibraryAsset } from "../template-library/assets";
import {
  createConsoleTemplate,
  MAX_LIBRARY_NAME,
  type ConsoleTemplateView,
} from "../template-library/console";
import { TemplateLibraryError } from "../template-library/errors";
import {
  type FigmaError,
  figmaClientFromEnv,
  loadFigmaFrames,
  parseFigmaUrl,
  type FigmaClient,
} from "./figma";
import type { FontCatalogueEntry } from "./figma-fonts";
import { figmaToTemplate, type FigmaFrameMatch, type FigmaReportLine } from "./figma-map";

/** An image render the import copies, at most. */
export const MAX_RENDER_BYTES = 5 * 1024 * 1024;
/** Raw SVG from Figma, before cleaning, at most. */
const MAX_RAW_SVG = 256 * 1024;
const RENDER_TIMEOUT_MS = 30_000;

export type FigmaImportRequest = {
  fileUrl: string;
  kind: string;
  name?: string;
  lookId?: number | null;
};

export type FigmaImportOutcome = {
  template: ConsoleTemplateView;
  fileName: string;
  frames: FigmaFrameMatch[];
  report: FigmaReportLine[];
  fonts: Array<{ from: string; to: string }>;
  /** How many vectors and images came from Figma's renders. */
  rendered: { vectors: number; images: number };
};

/** Downloads a render (Figma's CDN): its bytes, or null when it failed. */
export type RenderDownload = (url: string) => Promise<Buffer | null>;

export type FigmaImportDeps = {
  client?: FigmaClient;
  download?: RenderDownload;
  saveAsset?: (bytes: Buffer, type: "image/png") => Promise<string>;
  fonts?: readonly FontCatalogueEntry[];
};

const fetchRender: RenderDownload = async (url) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(RENDER_TIMEOUT_MS) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return bytes.length > MAX_RENDER_BYTES ? null : bytes;
  } catch {
    return null;
  }
};

let catalogue: FontCatalogueEntry[] | null = null;

/** The web app's Google Fonts catalogue, from the server bundle (dist) or the source tree. */
export function fontCatalogue(): FontCatalogueEntry[] {
  if (catalogue) return catalogue;
  const candidates = [
    "../../cricket-club/src/lib/google-fonts-catalogue.json",
    "../../../../cricket-club/src/lib/google-fonts-catalogue.json",
  ].map((rel) => fileURLToPath(new URL(rel, import.meta.url)));
  const file = candidates.find((f) => existsSync(f));
  if (!file) {
    throw new TemplateLibraryError(409, {
      error: "The font catalogue isn't on this server, so Figma text can't be matched to fonts.",
    });
  }
  catalogue = JSON.parse(readFileSync(file, "utf8")) as FontCatalogueEntry[];
  return catalogue;
}

/**
 * Figma's SVG export with what the format can't hold taken out first:
 * effect filters (drop shadows render as `<filter>` blocks) and the
 * attributes pointing at them. Everything else must pass `sanitiseSvg`.
 */
export function cleanFigmaSvg(markup: string): ReturnType<typeof sanitiseSvg> {
  const cleaned = markup
    .replace(/<\?xml[^>]*>/gi, "")
    .replace(/<filter\b[\s\S]*?<\/filter>/gi, "")
    .replace(/\sfilter="[^"]*"/gi, "")
    .replace(/\scolor-interpolation-filters="[^"]*"/gi, "")
    .replace(/\sxmlns:xlink="[^"]*"/gi, "")
    .trim();
  return sanitiseSvg(cleaned);
}

let testDeps: FigmaImportDeps | null = null;

/** Test seam: a recorded Figma client, downloads and asset store for the route. */
export function setFigmaImportDeps(next: FigmaImportDeps | null): void {
  testDeps = next;
}

/** A Figma link mapped to a template document, before anything is saved. */
export type FigmaMapped = Omit<FigmaImportOutcome, "template"> & { document: unknown };

/**
 * Steps 1–3 without the save: fetch the link's frames, copy the renders with
 * `saveAsset`, and map. The platform import saves a console template; a club
 * import (`club-figma-import.ts`) saves a private club template.
 */
export async function mapFigmaLink(
  req: { fileUrl: string; kind: string },
  deps: FigmaImportDeps & { client: FigmaClient; saveAsset: (bytes: Buffer, type: "image/png") => Promise<string> },
): Promise<FigmaMapped> {
  assertTemplateKind(req.kind);
  const link = parseFigmaUrl(req.fileUrl);
  const { client, saveAsset } = deps;
  const download = deps.download ?? fetchRender;
  const fonts = deps.fonts ?? fontCatalogue();

  const loaded = await loadFigmaFrames(client, link);
  if (loaded.frames.length === 0) {
    throw new TemplateLibraryError(400, {
      error: link.nodeIds.length
        ? "Figma found none of the frames that link points at."
        : "That Figma file has no frames to import.",
    });
  }
  const input = { kind: req.kind, frames: loaded.frames, styles: loaded.styles, fonts };
  const first = figmaToTemplate(input);
  const extra: FigmaReportLine[] = [];
  if (loaded.missing.length)
    extra.push({
      level: "warn",
      message: `Figma couldn't find ${loaded.missing.length} of the linked frames.`,
    });

  const vectors: Record<string, string> = {};
  const images: Record<string, string> = {};
  const vectorIds = first.deferred.filter((d) => d.what === "vector").map((d) => d.nodeId);
  const imageIds = first.deferred.filter((d) => d.what === "image").map((d) => d.nodeId);
  const layerOf = new Map(first.deferred.map((d) => [d.nodeId, d]));

  if (vectorIds.length) {
    const urls = await client.getImages(link.fileKey, vectorIds, { format: "svg" });
    for (const id of vectorIds) {
      const url = urls[id];
      const bytes = url ? await download(url) : null;
      const d = layerOf.get(id)!;
      const where = { page: d.page, sizes: [d.size], layer: d.layer };
      if (!bytes || bytes.length > MAX_RAW_SVG) {
        extra.push({
          level: "warn",
          ...where,
          message: "Figma's SVG export didn't arrive or is too large.",
        });
        continue;
      }
      const res = cleanFigmaSvg(bytes.toString("utf8"));
      if (res.svg) vectors[id] = res.svg;
      else
        extra.push({
          level: "warn",
          ...where,
          message: `Its SVG uses something vectors can't: ${res.errors[0] ?? "unknown"}`,
        });
    }
  }

  if (imageIds.length) {
    const urls = await client.getImages(link.fileKey, imageIds, { format: "png", scale: 2 });
    for (const id of imageIds) {
      const url = urls[id];
      const bytes = url ? await download(url) : null;
      const isPng = !!bytes && bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47;
      if (!bytes || !isPng) {
        const d = layerOf.get(id)!;
        extra.push({
          level: "warn",
          page: d.page,
          sizes: [d.size],
          layer: d.layer,
          message: "Figma's image render didn't arrive.",
        });
        continue;
      }
      images[id] = await saveAsset(bytes, "image/png");
    }
  }

  const second = figmaToTemplate({ ...input, assets: { vectors, images } });
  return {
    document: second.document,
    fileName: loaded.fileName,
    frames: second.frames,
    report: [...extra, ...second.report],
    fonts: second.fonts,
    rendered: { vectors: Object.keys(vectors).length, images: Object.keys(images).length },
  };
}

/** Refuses a kind templates don't support (before any Figma call). */
export function assertTemplateKind(kind: string): void {
  if (!kindFields(kind)) {
    throw new TemplateLibraryError(400, {
      error: `"${kind}" isn't a card kind templates support.`,
    });
  }
}

/** The template's name: the one given, or "Figma: <file name>". */
export function importName(given: string | undefined, fileName: string, max: number): string {
  return (given?.trim() || `Figma: ${fileName || "import"}`).slice(0, max);
}

export async function importFromFigma(
  req: FigmaImportRequest,
  adminId: number | null,
  deps: FigmaImportDeps = testDeps ?? {},
): Promise<FigmaImportOutcome> {
  assertTemplateKind(req.kind);
  const mapped = await mapFigmaLink(req, {
    ...deps,
    client: deps.client ?? figmaClientFromEnv(),
    saveAsset: deps.saveAsset ?? saveLibraryAsset,
  });
  const { document, ...rest } = mapped;
  const name = importName(req.name, mapped.fileName, MAX_LIBRARY_NAME);
  let template: ConsoleTemplateView;
  try {
    template = await createConsoleTemplate(
      { kind: req.kind, name, lookId: req.lookId ?? null, document },
      adminId,
    );
  } catch (err) {
    // A document the format refuses: say why, with the report that explains the mapping.
    if (err instanceof TemplateLibraryError && err.status === 400) {
      throw new TemplateLibraryError(400, { ...err.body, report: mapped.report });
    }
    throw err;
  }
  return { template, ...rest };
}

/** How a Figma failure answers: its plain message, with a status that says whose it is. */
export function figmaErrorStatus(err: FigmaError): 400 | 404 | 409 | 429 | 502 {
  switch (err.code) {
    case "bad-url":
      return 400;
    case "not-found":
      return 404;
    case "not-configured":
    case "token":
    case "forbidden":
      return 409;
    case "rate-limited":
      return 429;
    default:
      return 502;
  }
}
