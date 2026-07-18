import { PhotoReposition } from "@workspace/cricket-club";

// Fictional action-shot placeholder (explicit width/height so naturalWidth/
// naturalHeight resolve in headless capture).
const ACTION_PHOTO =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">' +
      '<rect width="900" height="600" fill="#4a5b48"/>' +
      '<rect y="430" width="900" height="170" fill="#7a8a5d"/>' +
      '<rect x="330" y="440" width="240" height="40" fill="#c9b48a"/>' +
      '<circle cx="450" cy="220" r="60" fill="#2c3530"/>' +
      '<path d="M330 470c0-72 54-116 120-116s120 44 120 116z" fill="#2c3530"/>' +
      '<rect x="560" y="250" width="10" height="150" rx="4" fill="#d8c9a0" transform="rotate(24 565 250)"/>' +
    "</svg>",
  );

// Drag-to-reposition crop control for a feature share-card photo — 4:5 portrait
// frame, focal point nudged up, mid zoom so the slider thumb sits off the ends.
export function PortraitCrop() {
  // Width kept under the component's 220px frame max-height so the 4:5 frame
  // renders at its true aspect (176 * 5/4 = 220).
  return (
    <div style={{ width: 172 }}>
      <PhotoReposition
        src={ACTION_PHOTO}
        aspect={{ w: 4, h: 5 }}
        value={{ focalX: 0.5, focalY: 0.35, zoom: 1.6 }}
        onChange={() => {}}
      />
    </div>
  );
}

// Square story-tile crop at default zoom.
export function SquareCrop() {
  // 1:1 frame at 216px stays under the 220px max-height clamp.
  return (
    <div style={{ width: 216 }}>
      <PhotoReposition
        src={ACTION_PHOTO}
        aspect={{ w: 1, h: 1 }}
        value={{ focalX: 0.5, focalY: 0.5, zoom: 1 }}
        onChange={() => {}}
      />
    </div>
  );
}
