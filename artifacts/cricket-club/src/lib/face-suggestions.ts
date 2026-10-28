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

type Detector = { detect(image: HTMLImageElement): { detections: RawDetection[] } };
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

/** The faces on a photo, as boxes in fractions of it, most confident first. */
export async function findFaces(src: string): Promise<FocusBox[]> {
  const [faces, img] = await Promise.all([loadDetector(), loadImage(src)]);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return [];
  return faces
    .detect(img)
    .detections.slice()
    .sort((a, b) => (b.categories[0]?.score ?? 0) - (a.categories[0]?.score ?? 0))
    .flatMap((d) => {
      const b = d.boundingBox;
      const box = b
        ? normaliseFocusBox({ x: b.originX / w, y: b.originY / h, w: b.width / w, h: b.height / h })
        : null;
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
): Promise<number> {
  let saved = 0;
  for (const photo of photos) {
    try {
      const box = await suggest(photo.url);
      if (!box) continue;
      await save(photo.id, box);
      saved++;
    } catch {
      // No suggestion for this one (detector offline, photo unreadable).
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
