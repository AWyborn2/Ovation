import type { CardLayoutLayer } from "@workspace/api-client-react";
import type { EditorLayer } from "@/lib/share-card";

// Convert the editor's working layers back into the minimal saved layout: only
// built-in `element` layers that actually differ from their pristine defaults,
// plus every custom layer in full. Keeping unchanged elements out means a card
// the admin never touched saves nothing and stays pixel-identical.
export function editorToSaved(
  layers: EditorLayer[],
  pristine: EditorLayer[],
): CardLayoutLayer[] {
  const pById = new Map(pristine.map((p) => [p.id, p]));
  const out: CardLayoutLayer[] = [];
  for (const l of layers) {
    if (l.editKind === "element") {
      const p = pById.get(l.id);
      if (!p) continue;
      // The full-bleed feature/background layer can't be moved or resized, so its
      // geometry must NEVER be persisted: its natural rect is the render canvas,
      // which differs per size (square/portrait/story). Persisting a square-sized
      // rect would shrink the background on taller sizes via savedRectToPx (which
      // scales by 1080, not the render height). Only its effects/z/visibility are
      // meaningful, so we emit those and leave geometry to the built-in default.
      const geometryLocked = !l.resizable;
      // The Background layer is geometry-locked but may carry an uploaded
      // full-bleed image. We persist ONLY its image fields (url/fit/focal/zoom),
      // never its locked geometry, so the custom background round-trips while
      // staying correct across square/portrait/story sizes.
      const bgImage = l.id === "background";
      const geomChanged =
        !geometryLocked &&
        (p.x !== l.x ||
          p.y !== l.y ||
          p.w !== l.w ||
          p.h !== l.h ||
          p.focalX !== l.focalX ||
          p.focalY !== l.focalY ||
          p.zoom !== l.zoom);
      const imgChanged =
        bgImage &&
        (p.url !== l.url ||
          p.fit !== l.fit ||
          p.focalX !== l.focalX ||
          p.focalY !== l.focalY ||
          p.zoom !== l.zoom);
      const changed =
        geomChanged ||
        imgChanged ||
        p.z !== l.z ||
        p.hidden !== l.hidden ||
        JSON.stringify(p.effects ?? null) !== JSON.stringify(l.effects ?? null);
      if (!changed) continue;
      out.push({
        id: l.id,
        kind: "element",
        ...(geometryLocked
          ? {}
          : {
              x: l.x,
              y: l.y,
              w: l.w,
              h: l.h,
              focalX: l.focalX,
              focalY: l.focalY,
              zoom: l.zoom,
            }),
        ...(bgImage && l.url
          ? {
              url: l.url,
              fit: l.fit ?? "cover",
              focalX: l.focalX,
              focalY: l.focalY,
              zoom: l.zoom,
            }
          : {}),
        z: l.z,
        hidden: l.hidden,
        vAnchor: l.vAnchor,
        effects: l.effects,
      });
    } else {
      out.push({
        id: l.id,
        kind: l.editKind,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        z: l.z,
        hidden: l.hidden,
        vAnchor: l.vAnchor,
        url: l.url,
        shape: l.shape,
        fit: l.fit,
        focalX: l.focalX,
        focalY: l.focalY,
        zoom: l.zoom,
        color: l.color,
        radius: l.radius,
        text: l.text,
        fontSize: l.fontSize,
        fontWeight: l.fontWeight,
        align: l.align,
        fontFamily: l.fontFamily,
        uppercase: l.uppercase,
        assetId: l.assetId,
        field: l.field,
        effects: l.effects,
      });
    }
  }
  return out;
}
