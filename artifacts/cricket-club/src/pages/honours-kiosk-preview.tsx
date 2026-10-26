import { useEffect, useState } from "react";
import type { HonourDisplayBundle } from "@workspace/api-client-react";
import {
  PREVIEW_READY,
  isPreviewBundleMessage,
  type PreviewBundleMessage,
} from "@/lib/kiosk-preview-messages";
import HonoursKiosk from "./honours-kiosk";

/**
 * The live preview frame on the kiosk settings page (honours kiosk redesign
 * B4): the real TV page, fed the settings page's unsaved settings. It runs in
 * an iframe at TV size so the skins, which size type against the screen, look
 * exactly as they will on the TV.
 */
export default function HonoursKioskPreview() {
  const [state, setState] = useState<{ bundle: HonourDisplayBundle; nonce: number } | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      if (!isPreviewBundleMessage(e.data)) return;
      const { bundle, nonce } = e.data as PreviewBundleMessage;
      setState({ bundle, nonce });
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: PREVIEW_READY }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!state) {
    return (
      <div className="hb-kiosk flex items-center justify-center text-white">
        <div className="text-sm opacity-70">Preparing preview…</div>
      </div>
    );
  }
  return <HonoursKiosk key={state.nonce} fixture={state.bundle} preview />;
}
