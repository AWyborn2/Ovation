/**
 * Library assets (ADR-011 §2 "Assets", T3.12).
 *
 * Images a library template draws (from the console, the AI designer or a
 * Figma import) are copied to public object storage under `library/`. A
 * library document may reference only those, the images shipped with the web
 * app for the element library (`/library-assets/`), `{{tokens}}` and slots — never a
 * club's own uploads or any other address — so nothing in the library points
 * at a tenant's assets. Club copies may reference the club's uploads, as
 * today, so the policy applies to library rows only.
 *
 * Where Replit's storage sidecar isn't running (the local dev stack),
 * `LOCAL_OBJECT_STORAGE_DIR` stands in for public object storage: assets are
 * written to `<dir>/public/library/` and served by the same
 * `/storage/public-objects/*` route. Production never sets it.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isBundledImage } from "@workspace/scorecard/kind-templates";
import { env } from "../../config";
import { objectStorageClient, ObjectStorageService } from "../objectStorage";

/** Where every library asset is served from. */
export const LIBRARY_ASSET_PREFIX = "/api/storage/public-objects/library/";

const ASSET_NAME = /^[0-9a-f-]{36}\.(png|jpg|webp|svg)$/;

/** Namespace URIs inside SVG markup are identifiers, not fetched addresses. */
const NAMESPACE_URI = /^https?:\/\/www\.w3\.org\//;

const isLibraryUrl = (url: string): boolean =>
  (url.startsWith(LIBRARY_ASSET_PREFIX) &&
    ASSET_NAME.test(url.slice(LIBRARY_ASSET_PREFIX.length))) ||
  isBundledImage(url);

/** Every address a string refers to: absolute URLs, CSS `url(...)` targets and root paths. */
function addressesIn(value: string, key: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(/(?:[a-z][a-z0-9+.-]*:)?\/\/[^\s"'()<>]+/gi)) out.push(m[0]);
  for (const m of value.matchAll(/url\(\s*['"]?([^'")\s]+)/gi)) {
    if (m[1] && !m[1].startsWith("#")) out.push(m[1]);
  }
  // An image layer's `content` (or any `src`/`url`) holding a bare path.
  if (["content", "src", "url", "href"].includes(key) && /^\/[^/]/.test(value.trim())) {
    out.push(value.trim());
  }
  return out.filter((url) => !NAMESPACE_URI.test(url));
}

/**
 * The addresses in a library document that break the asset policy, with where
 * they sit. Empty when the document references only library assets, tokens
 * and slots.
 */
export function libraryAssetPolicyErrors(document: unknown): string[] {
  const errors: string[] = [];
  const walk = (value: unknown, at: string, key: string) => {
    if (typeof value === "string") {
      for (const url of addressesIn(value, key)) {
        if (!isLibraryUrl(url)) {
          errors.push(
            `${at} refers to ${url.slice(0, 80)}; library templates may only use library images.`,
          );
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${at}[${i}]`, key));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, at ? `${at}.${k}` : k, k);
    }
  };
  walk(document, "", "");
  return errors;
}

export type LibraryAssetType = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";

const EXT: Record<LibraryAssetType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const CONTENT_TYPE: Record<string, LibraryAssetType> = Object.fromEntries(
  Object.entries(EXT).map(([type, ext]) => [ext, type as LibraryAssetType]),
);

/** The dev-only folder standing in for public object storage, or null. */
export function localPublicDir(): string | null {
  const dir = env.LOCAL_OBJECT_STORAGE_DIR();
  return dir ? path.resolve(dir, "public") : null;
}

/**
 * Store one library asset and return its URL. Writes to the dev folder when
 * `LOCAL_OBJECT_STORAGE_DIR` is set, else to the first public object search
 * path under `library/`.
 */
export async function saveLibraryAsset(
  bytes: Buffer,
  contentType: LibraryAssetType,
): Promise<string> {
  const name = `${randomUUID()}.${EXT[contentType]}`;
  const local = localPublicDir();
  if (local) {
    await mkdir(path.join(local, "library"), { recursive: true });
    await writeFile(path.join(local, "library", name), bytes);
    return `${LIBRARY_ASSET_PREFIX}${name}`;
  }
  const [searchPath] = new ObjectStorageService().getPublicObjectSearchPaths();
  const full = `${searchPath!.replace(/\/$/, "")}/library/${name}`.replace(/^\//, "");
  const [bucketName, ...rest] = full.split("/");
  await objectStorageClient
    .bucket(bucketName!)
    .file(rest.join("/"))
    .save(bytes, { contentType, resumable: false });
  return `${LIBRARY_ASSET_PREFIX}${name}`;
}

/**
 * A file under the dev folder for `/storage/public-objects/<filePath>`, or
 * null when there is no dev folder or no such library asset. Only `library/`
 * asset names resolve, so nothing else on disk can be reached.
 */
export async function readLocalPublicObject(
  filePath: string,
): Promise<{ bytes: Buffer; contentType: LibraryAssetType } | null> {
  const local = localPublicDir();
  if (!local) return null;
  const m = /^library\/([0-9a-f-]{36}\.(png|jpg|webp|svg))$/.exec(filePath);
  if (!m) return null;
  try {
    const bytes = await readFile(path.join(local, "library", m[1]!));
    return { bytes, contentType: CONTENT_TYPE[m[2]!]! };
  } catch {
    return null;
  }
}
