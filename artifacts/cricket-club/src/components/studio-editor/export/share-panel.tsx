/**
 * Share → Download for a carousel set in the set editor (studio-create-consolidation
 * S5, New Studio only): pick All, This page or Custom slides, PNG or JPG, then
 * download one image or a zip named after the set with files numbered in slide
 * order. Each slide renders through the same server harness as the editor's own
 * Download, with what the canvas shows. Downloading never publishes anything and
 * never changes the draft's review state.
 */
import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SIZES, type CardSize } from "@/lib/share-card";
import { saveFiles, toFile } from "@/lib/save-files";
import { BLANK_PACK_ID, type CardAdjustments } from "@/lib/pack-render";
import { cn } from "@/lib/utils";
import type { EditorSlide } from "@/components/studio-editor/set-doc";
import { renderDownload } from "./download";
import {
  downloadSafeInput,
  pickedSlides,
  slideFilename,
  zipFilename,
  type PageChoice,
  type StillFormat,
} from "./share-download";

/** What the set editor hands the panel: its slides as they draw now. */
export type SetShareContext = {
  slides: EditorSlide[];
  /** The slide on the canvas. */
  current: string | null;
  size: CardSize;
  documentFor: (slide: EditorSlide) => CardAdjustments;
};

const chip = (on: boolean) =>
  cn(
    "h-8 rounded-lg border px-2.5 text-sm font-semibold transition-colors disabled:opacity-40",
    on
      ? "border-[var(--ed-accent)] bg-[var(--ed-accent)] text-[var(--ed-on-accent)]"
      : "border-[var(--ed-line)] bg-[var(--ed-card)] hover:border-[var(--ed-ink2)]",
  );

export function SharePanel({ set, name }: { set: SetShareContext; name: string }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PageChoice>("all");
  const [custom, setCustom] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<StillFormat>("png");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = set.slides.findIndex((s) => s.key === set.current);
  const picked = pickedSlides(set.slides.length, choice, Math.max(0, current), custom);
  const busy = progress !== null;
  const { w, h } = SIZES[set.size];

  const run = async () => {
    setError(null);
    setProgress({ done: 0, total: picked.length });
    try {
      const files: File[] = [];
      for (const [n, i] of picked.entries()) {
        const slide = set.slides[i]!;
        const blob = await renderDownload(
          {
            input: downloadSafeInput(slide.input),
            size: set.size,
            theme: null,
            data: slide.data,
            packId: BLANK_PACK_ID,
            adjustments: set.documentFor(slide),
            junior: slide.junior,
          },
          format,
          1,
        );
        files.push(toFile(blob, slideFilename(name, i, format)));
        setProgress({ done: n + 1, total: picked.length });
      }
      // One image, or a zip of them on a computer; the share sheet on a phone.
      await saveFiles(files, { zipName: zipFilename(name) });
    } catch (e) {
      setError(
        e instanceof Error ? `Nothing was saved. ${e.message}` : "Download failed. Try again.",
      );
    } finally {
      setProgress(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => !busy && setOpen(v)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--ed-line)] px-3 text-sm font-semibold hover:bg-[var(--ed-card)]"
        >
          <Share2 className="h-4 w-4" aria-hidden />
          Share
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="studio-editor w-80 space-y-4">
        <p className="text-sm font-semibold">Download</p>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-[var(--ed-ink2)]">Pages</legend>
          <div className="flex gap-2">
            {(
              [
                ["all", `All (${set.slides.length})`],
                ["this", "This page"],
                ["custom", "Custom"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={choice === value}
                disabled={busy}
                onClick={() => setChoice(value)}
                className={chip(choice === value)}
              >
                {label}
              </button>
            ))}
          </div>
          {choice === "custom" && (
            <ul className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto">
              {set.slides.map((s, i) => (
                <li key={s.key}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={custom.has(i)}
                      disabled={busy}
                      onChange={() =>
                        setCustom((c) => {
                          const next = new Set(c);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                    />
                    {i + 1}. {s.label}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <p className="text-xs text-[var(--ed-ink2)]">
          Size: {w} × {h}
        </p>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-[var(--ed-ink2)]">File type</legend>
          <div className="flex gap-2">
            {(["png", "jpg"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={format === f}
                disabled={busy}
                onClick={() => setFormat(f)}
                className={chip(format === f)}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          disabled={busy || picked.length === 0}
          onClick={run}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ed-accent)] text-sm font-semibold text-[var(--ed-on-accent)] disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {busy
            ? `Saving ${progress!.done} of ${progress!.total}…`
            : picked.length === 1
              ? "Download 1 image"
              : `Download ${picked.length} images`}
        </button>
        <p className="text-xs text-[var(--ed-ink2)]">
          Downloading doesn&rsquo;t post anything. Send the set to the queue to post it.
        </p>
        {error && (
          <p role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
