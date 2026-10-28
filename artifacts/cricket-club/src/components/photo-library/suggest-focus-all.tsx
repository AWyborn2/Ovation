import { useEffect, useRef, useState } from "react";
import type { FocusBox } from "@workspace/scorecard/photo-focus";
import { Button } from "@/components/ui/button";
import { suggestUploadFocus } from "@/lib/face-suggestions";

type Run =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number; saved: number }
  | { phase: "finished"; done: number; total: number; saved: number; stopped: boolean };

/**
 * Suggest a focus box for every library photo that has none yet (photo focus
 * areas): the same face suggestion an upload makes, run over the photos
 * already in the library, one at a time on this device. Photos with a box
 * (set or suggested) are never touched, and the admin can stop at any point.
 */
export function SuggestFocusAll({
  photos,
  save,
  onSaved,
}: {
  photos: ReadonlyArray<{ id: number; url: string; focusBox?: FocusBox | null }>;
  save: (photoId: number, box: FocusBox) => Promise<unknown>;
  /** After each new suggestion (to refresh the library). */
  onSaved: () => void;
}) {
  const [run, setRun] = useState<Run>({ phase: "idle" });
  const abort = useRef<AbortController | null>(null);
  // Leaving the page stops the run.
  useEffect(() => () => abort.current?.abort(), []);

  const todo = photos.filter((p) => !p.focusBox);
  if (run.phase === "idle" && todo.length === 0) return null;

  const start = async () => {
    const queue = todo.map((p) => ({ id: p.id, url: p.url }));
    const controller = new AbortController();
    abort.current = controller;
    setRun({ phase: "running", done: 0, total: queue.length, saved: 0 });
    let last = 0;
    const saved = await suggestUploadFocus(queue, save, undefined, {
      signal: controller.signal,
      onProgress: (done, savedSoFar) => {
        setRun({ phase: "running", done, total: queue.length, saved: savedSoFar });
        // Refresh every few new suggestions so the badges appear as it goes.
        if (savedSoFar - last >= 5) {
          last = savedSoFar;
          onSaved();
        }
      },
    });
    onSaved();
    setRun((r) => ({
      phase: "finished",
      done: r.phase === "idle" ? 0 : r.done,
      total: queue.length,
      saved,
      stopped: controller.signal.aborted,
    }));
  };

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
      role="status"
      aria-label="Suggest focus for the library"
    >
      {run.phase === "running" ? (
        <>
          <span>
            Finding faces: {run.done} of {run.total} photos checked, {run.saved} suggested. Keep
            this page open.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => abort.current?.abort()}>
            Stop
          </Button>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">
            {run.phase === "finished"
              ? `${run.stopped ? "Stopped. " : "Done. "}Suggested a focus for ${run.saved} of ${run.done} photos checked.${todo.length > 0 ? ` ${todo.length} still have no focus.` : ""}`
              : `${todo.length} ${todo.length === 1 ? "photo has" : "photos have"} no focus yet.`}
          </span>
          {todo.length > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={() => void start()}>
              Suggest focus from faces
            </Button>
          )}
        </>
      )}
    </div>
  );
}
