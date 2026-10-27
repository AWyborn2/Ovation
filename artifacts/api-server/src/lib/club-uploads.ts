import sharp, { type Sharp } from "sharp";
import { MAX_SVG_BYTES, sanitiseSvg } from "@workspace/scorecard/kind-templates";
import { objectUrl } from "./photo-store";
import {
  IngestError,
  MAX_INGEST_BYTES,
  MAX_WIDTH,
  THUMB_WIDTH,
  detectImageKind,
  ingestImage,
} from "./image-ingest";
import type { ClubUploadRow } from "@workspace/db";

/**
 * The Studio editor's Uploads (migration 0073): a club's logos, artwork and
 * SVG shapes, kept apart from the photo library. Unlike library photos, an
 * upload keeps its own format, so a PNG keeps its transparency, and an SVG
 * stays a vector the card can recolour.
 */

/** Where converted uploads are written (`/objects/club-uploads/...`). */
export const CLUB_UPLOAD_PREFIX = "club-uploads";

export type IngestedUpload =
  | {
      kind: "image";
      data: Buffer;
      thumb: Buffer;
      contentType: "image/png" | "image/jpeg" | "image/webp";
      width: number;
      height: number;
    }
  | { kind: "svg"; svg: string; width: number; height: number };

/** Whether the bytes look like SVG markup (after any BOM, XML prolog or comments). */
export function looksLikeSvg(data: Buffer): boolean {
  const head = data
    .subarray(0, 4096)
    .toString("utf8")
    .replace(/^\uFEFF/, "");
  return /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i.test(head);
}

/** Simple style declarations an editor writes as `style`, kept as attributes. */
const STYLE_PROPS = new Set([
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "opacity",
  "stop-color",
  "stop-opacity",
  "clip-rule",
]);

/**
 * Design tools' SVG made ready for the vector allowlist: the prolog, comments,
 * doctype, metadata and editor namespaces go; a `style` attribute's simple
 * declarations become attributes; root attributes a vector doesn't use are
 * dropped. Everything left must still pass `sanitiseSvg`, which is the safety
 * net (no scripts, links, `href`, `style` or event handlers get through).
 */
export function cleanUploadedSvg(markup: string): ReturnType<typeof sanitiseSvg> {
  let s = markup
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[^>]*>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(title|desc|metadata)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(title|desc|metadata)\b[^>]*\/>/gi, "")
    // Editor elements (sodipodi:namedview, inkscape:…) and namespaced attributes.
    .replace(/<([a-z]+:[\w-]+)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<[a-z]+:[\w-]+\b[^>]*\/>/gi, "")
    .replace(/\s(?:xmlns:[\w-]+|[a-z]+:[\w-]+)="[^"]*"/gi, "")
    .replace(/\s(?:zoomAndPan|enable-background|xml:space|data-[\w-]+|class)="[^"]*"/g, "");
  s = s.replace(/\sstyle="([^"]*)"/gi, (_all, css: string) =>
    css
      .split(";")
      .map((decl) => decl.split(":").map((p) => p.trim()))
      .filter(([prop, value]) => prop && value && STYLE_PROPS.has(prop.toLowerCase()))
      .map(([prop, value]) => ` ${prop!.toLowerCase()}="${value!.replace(/"/g, "")}"`)
      .join(""),
  );
  return sanitiseSvg(s.trim());
}

const num = (v: string | undefined): number | null => {
  const n = v == null ? NaN : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** An SVG's drawn size: its viewBox, else width and height, else a square. */
function svgSize(svg: string): { width: number; height: number } {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  const viewBox = /\sviewBox="([^"]*)"/i
    .exec(root)?.[1]
    ?.trim()
    .split(/[\s,]+/);
  const vw = num(viewBox?.[2]);
  const vh = num(viewBox?.[3]);
  if (vw && vh) return { width: Math.round(vw), height: Math.round(vh) };
  const w = num(/\swidth="([^"]*)"/i.exec(root)?.[1]);
  const h = num(/\sheight="([^"]*)"/i.exec(root)?.[1]);
  return w && h ? { width: Math.round(w), height: Math.round(h) } : { width: 100, height: 100 };
}

/** One uploaded file as an upload. Throws IngestError with a message for the admin. */
export async function ingestUpload(data: Buffer): Promise<IngestedUpload> {
  if (data.length > MAX_INGEST_BYTES) {
    throw new IngestError(`File is larger than ${MAX_INGEST_BYTES / 1024 / 1024} MB.`);
  }
  if (looksLikeSvg(data)) {
    const cleaned = cleanUploadedSvg(data.toString("utf8"));
    if (!cleaned.svg) {
      const tooBig = cleaned.errors.some((e) => e.includes("at most"));
      throw new IngestError(
        tooBig
          ? `This SVG is too detailed (vectors can be at most ${MAX_SVG_BYTES / 1024} KB). Simplify it, or upload it as a PNG.`
          : `This SVG uses something cards can't draw (${cleaned.errors[0] ?? "unknown"}). Upload it as a PNG instead.`,
      );
    }
    return { kind: "svg", svg: cleaned.svg, ...svgSize(cleaned.svg) };
  }
  const kind = detectImageKind(data);
  if (kind === "heic" || kind === "avif") {
    // An iPhone photo: the photo ingest's JPEG (HEIC decoded, upright, no EXIF).
    const image = await ingestImage(data);
    return {
      kind: "image",
      data: image.jpeg,
      thumb: image.thumb,
      contentType: "image/jpeg",
      width: image.width,
      height: image.height,
    };
  }
  if (kind !== "png" && kind !== "jpeg" && kind !== "webp") {
    throw new IngestError("Not a supported file (PNG, JPEG, WebP, HEIC or SVG).");
  }
  try {
    // Re-encoded in its own format: a PNG or WebP keeps its transparency.
    // rotate() applies the EXIF orientation; sharp writes no metadata unless
    // asked, so EXIF (GPS included) is dropped.
    const encode = (img: Sharp, quality: number) =>
      kind === "png"
        ? img.png({ compressionLevel: 9 })
        : kind === "webp"
          ? img.webp({ quality })
          : img.jpeg({ quality });
    const main = await encode(
      sharp(data).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true }),
      90,
    ).toBuffer({ resolveWithObject: true });
    const thumb = await encode(
      sharp(main.data).resize({ width: THUMB_WIDTH, withoutEnlargement: true }),
      75,
    ).toBuffer();
    return {
      kind: "image",
      data: main.data,
      thumb,
      contentType: kind === "png" ? "image/png" : kind === "webp" ? "image/webp" : "image/jpeg",
      width: main.info.width,
      height: main.info.height,
    };
  } catch {
    throw new IngestError("This image could not be processed.");
  }
}

/** A file name as an upload's name: no folders or extension, tidy, at most 80 characters. */
export function uploadName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const name = base
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return name || "Upload";
}

export type ClubUploadDto = {
  id: number;
  name: string;
  kind: "image" | "svg";
  url: string | null;
  thumbUrl: string | null;
  svg: string | null;
  width: number;
  height: number;
  createdAt: string;
};

export function presentUpload(row: ClubUploadRow): ClubUploadDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    url: row.objectPath ? objectUrl(row.objectPath) : null,
    thumbUrl: row.thumbPath ? objectUrl(row.thumbPath) : null,
    svg: row.kind === "svg" ? row.svg : null,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt.toISOString(),
  };
}
