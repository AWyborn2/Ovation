import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PREVIEW_BUNDLE, PREVIEW_READY } from "@/lib/kiosk-preview-messages";
import type { HonoursDisplayForm } from "../use-honours-display-settings";

const TV_W = 1920;
const TV_H = 1080;
/** Wait for typing to settle before restarting the preview. */
const SETTLE_MS = 300;

/**
 * The live TV preview (honours kiosk redesign B4): the real TV page in a
 * 1920×1080 frame scaled to fit, playing the unsaved settings. "Replay item"
 * plays just the selected rotation item; "Play rotation" plays the lot. Any
 * change restarts it.
 */
export function KioskPreview({
  form,
  token,
}: {
  form: HonoursDisplayForm;
  /** The rotation item to replay; null previews the whole rotation. */
  token: string | null;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  const [mode, setMode] = useState<"item" | "rotation">(token ? "item" : "rotation");
  const [replays, setReplays] = useState(0);

  // Selecting another item previews it.
  useEffect(() => setMode(token ? "item" : "rotation"), [token]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.source !== frameRef.current?.contentWindow) return;
      if ((e.data as { type?: string } | null)?.type === PREVIEW_READY) setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const playing = mode === "item" && token ? token : null;
  const payload = JSON.stringify(form.previewBundle(playing));

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      frameRef.current?.contentWindow?.postMessage(
        { type: PREVIEW_BUNDLE, bundle: JSON.parse(payload), nonce: Date.now() + replays },
        window.location.origin,
      );
    }, SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [ready, payload, replays]);

  const scale = width / TV_W;
  return (
    <section className="space-y-2" aria-label="TV preview" data-testid="kiosk-preview">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Preview
        </span>
        <span className="min-w-0 flex-1 truncate text-xs" data-testid="kiosk-preview-now">
          {playing ? form.seqLabel(playing) : "Whole rotation"}
        </span>
        {form.dirty && (
          <span
            className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
            data-testid="kiosk-preview-unsaved"
          >
            Unsaved changes
          </span>
        )}
      </div>
      <div
        ref={boxRef}
        className="relative w-full overflow-hidden rounded border bg-black"
        style={{ aspectRatio: `${TV_W} / ${TV_H}` }}
      >
        <iframe
          ref={frameRef}
          src="/honours-display/preview"
          title="TV preview"
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: TV_W, height: TV_H, transform: `scale(${scale})` }}
          data-testid="kiosk-preview-frame"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!token}
          onClick={() => {
            setMode("item");
            setReplays((n) => n + 1);
          }}
          data-testid="kiosk-preview-replay"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Replay item
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setMode("rotation");
            setReplays((n) => n + 1);
          }}
          data-testid="kiosk-preview-rotation"
        >
          <Play className="mr-1.5 h-3.5 w-3.5" /> Play rotation
        </Button>
      </div>
    </section>
  );
}
