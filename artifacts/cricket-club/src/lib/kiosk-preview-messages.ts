import type { HonourDisplayBundle } from "@workspace/api-client-react";

/**
 * Messages between the kiosk settings page and its live preview frame
 * (honours kiosk redesign B4). Both are this app on the same origin; the frame
 * accepts a bundle only from its parent window on that origin.
 */
export const PREVIEW_READY = "ovation:kiosk-preview-ready";
export const PREVIEW_BUNDLE = "ovation:kiosk-preview-bundle";

export interface PreviewBundleMessage {
  type: typeof PREVIEW_BUNDLE;
  bundle: HonourDisplayBundle;
  /** Changes on every send, so the frame restarts the player. */
  nonce: number;
}

export function isPreviewBundleMessage(data: unknown): data is PreviewBundleMessage {
  const d = data as Partial<PreviewBundleMessage> | null;
  return (
    !!d &&
    d.type === PREVIEW_BUNDLE &&
    typeof d.nonce === "number" &&
    !!d.bundle &&
    Array.isArray(d.bundle.boards) &&
    !!d.bundle.settings
  );
}
