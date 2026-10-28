import { normaliseFocusBox, type FocusBox } from "@workspace/scorecard/photo-focus";

/**
 * Face suggestions for the photo focus editor (photo focus areas, decision 5).
 *
 * MediaPipe Face Detector (Apache 2.0, the short-range BlazeFace model, about
 * 1 MB) runs on the admin's device: the photo is read from the page, never sent
 * anywhere. The library and model load only when an admin asks for faces. The
 * suggestions are boxes; linking one to a player is always the admin's choice.
 */

/** The package version the WebAssembly files must match (package.json pins it). */
const MEDIAPIPE_VERSION = "1.1.1";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

type Detector = {
  detect(image: HTMLImageElement | HTMLCanvasElement): { detections: RawDetection[] };
};
type RawDetection = {
  boundingBox?: { originX: number; originY: number; width: number; height: number };
  categories: Array<{ score: number }>;
};

let detector: Promise<Detector> | null = null;

function loadDetector(): Promise<Detector> {
  detector ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(WASM_BASE);
    return FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.5,
    });
  })().catch((err: unknown) => {
    // A failed load (offline, blocked) can be retried later.
    detector = null;
    throw err;
  });
  return detector;
}

/** An image the detector can read (same-origin library photos are). */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The photo could not be read."));
    img.src = src;
  });
}

/** A square part of the photo to scan, in pixels; null size = the whole photo. */
export type FaceScanTile = { x: number; y: number; size: number | null };

/**
 * The parts of a photo to scan for faces. The short-range model only finds a
 * face that fills roughly 15–35% of what it looks at, so a team photo's faces
 * (a few per cent of the frame) are invisible to a whole-photo scan. Besides
 * the whole photo, this scans overlapping squares a half and a quarter of the
 * photo's short side (each overlapping its neighbours by half, so every face
 * that size range covers sits whole in one of them).
 */
export function faceScanTiles(width: number, height: number): FaceScanTile[] {
  const tiles: FaceScanTile[] = [{ x: 0, y: 0, size: null }];
  const short = Math.min(width, height);
  for (const share of [0.5, 0.25]) {
    const size = Math.round(short * share);
    if (size < 64) continue;
    const step = size / 2;
    const starts = (length: number) => {
      const out: number[] = [];
      for (let p = 0; p + size < length; p += step) out.push(Math.round(p));
      out.push(length - size);
      return [...new Set(out)];
    };
    for (const y of starts(height)) for (const x of starts(width)) tiles.push({ x, y, size });
  }
  return tiles;
}

/** A face found in pixels of the photo, with the detector's confidence. */
export type FoundFace = { x: number; y: number; w: number; h: number; score: number };

/**
 * One box per face from overlapping scans: the most confident first, and a box
 * that mostly overlaps one already kept (the same face seen from two tiles) is
 * dropped.
 */
export function mergeFaces(found: readonly FoundFace[]): FoundFace[] {
  const kept: FoundFace[] = [];
  for (const f of [...found].sort((a, b) => b.score - a.score)) {
    const dup = kept.some((k) => {
      const ix = Math.max(0, Math.min(k.x + k.w, f.x + f.w) - Math.max(k.x, f.x));
      const iy = Math.max(0, Math.min(k.y + k.h, f.y + f.h) - Math.max(k.y, f.y));
      // Shared area over the smaller box: a cut-off view of a face inside a
      // whole one counts as the same face.
      return (ix * iy) / Math.min(k.w * k.h, f.w * f.h) > 0.5;
    });
    if (!dup) kept.push(f);
  }
  return kept;
}

/** The size the scanned squares are drawn at (the model looks at 128 × 128). */
const SCAN_PX = 256;
/**
 * The confidence a face found in a square needs (the whole-photo scan takes the
 * detector's 0.5). Zoomed-in squares of a close-up mistake shirts and hands for
 * faces at around 0.5–0.65; real faces in a team photo score 0.75 and up.
 */
const TILE_MIN_SCORE = 0.7;

/** The faces on a photo, as boxes in fractions of it, most confident first. */
export async function findFaces(src: string): Promise<FocusBox[]> {
  const [faces, img] = await Promise.all([loadDetector(), loadImage(src)]);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return [];
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SCAN_PX;
  const ctx = canvas.getContext("2d");
  const found: FoundFace[] = [];
  for (const tile of faceScanTiles(w, h)) {
    let source: HTMLImageElement | HTMLCanvasElement = img;
    let scale = 1;
    if (tile.size !== null) {
      if (!ctx) break;
      ctx.drawImage(img, tile.x, tile.y, tile.size, tile.size, 0, 0, SCAN_PX, SCAN_PX);
      source = canvas;
      scale = tile.size / SCAN_PX;
    }
    for (const d of faces.detect(source).detections) {
      const b = d.boundingBox;
      const score = d.categories[0]?.score ?? 0;
      if (!b || (tile.size !== null && score < TILE_MIN_SCORE)) continue;
      found.push({
        x: tile.x + b.originX * scale,
        y: tile.y + b.originY * scale,
        w: b.width * scale,
        h: b.height * scale,
        score,
      });
    }
  }
  return mergeFaces(found).flatMap((f) => {
    const box = normaliseFocusBox({ x: f.x / w, y: f.y / h, w: f.w / w, h: f.h / h });
    return box ? [box] : [];
  });
}

/**
 * The area a player takes up, from their face: a little wider than the face
 * either side and down to about the waist, so a tall frame keeps head and
 * shoulders rather than a face filling the frame.
 */
export function personBoxFromFace(face: FocusBox): FocusBox {
  const x0 = Math.max(0, face.x - face.w);
  const y0 = Math.max(0, face.y - face.h * 0.5);
  const x1 = Math.min(1, face.x + face.w * 2);
  const y1 = Math.min(1, face.y + face.h * 4);
  return normaliseFocusBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }) ?? face;
}

/**
 * The focus box to suggest for a photo from its faces: everyone found, head to
 * about the waist. Null when no face is found.
 */
export async function suggestFocusBox(src: string): Promise<FocusBox | null> {
  return unionBox((await findFaces(src)).map(personBoxFromFace));
}

/**
 * Suggest a focus box for each newly uploaded photo (photo focus areas, upload
 * suggestion), one at a time on the admin's device, and save it as a
 * suggestion through `save`. A photo with no face, or one that can't be read,
 * keeps its centred crop; a failure never stops the others. Resolves to the
 * number of photos given a suggestion.
 */
export async function suggestUploadFocus(
  photos: ReadonlyArray<{ id: number; url: string }>,
  save: (photoId: number, box: FocusBox) => Promise<unknown>,
  suggest: (src: string) => Promise<FocusBox | null> = suggestFocusBox,
  opts: {
    /** After each photo: how many are done, and how many were given a suggestion. */
    onProgress?: (done: number, saved: number) => void;
    /** Stops before the next photo (a long run over the whole library). */
    signal?: AbortSignal;
  } = {},
): Promise<number> {
  let saved = 0;
  let done = 0;
  for (const photo of photos) {
    if (opts.signal?.aborted) break;
    try {
      const box = await suggest(photo.url);
      if (!box) continue;
      await save(photo.id, box);
      saved++;
    } catch {
      // No suggestion for this one (detector offline, photo unreadable).
    } finally {
      opts.onProgress?.(++done, saved);
    }
  }
  return saved;
}

/** The smallest box holding every box (a group's focus from its people). */
export function unionBox(boxes: readonly FocusBox[]): FocusBox | null {
  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return normaliseFocusBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}
