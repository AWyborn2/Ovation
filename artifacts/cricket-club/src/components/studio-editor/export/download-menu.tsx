import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { downloadBlob, SIZES } from "@/lib/share-card";
import { cn } from "@/lib/utils";
import {
  DOWNLOAD_FORMATS,
  PLATFORM_HINT,
  downloadFilename,
  isClip,
  outputSize,
  renderDownload,
  type CardRender,
  type DownloadFormat,
} from "./download";

const SCALES = [1, 2, 3] as const;

const chip = (on: boolean) =>
  cn(
    "h-8 rounded-lg border px-2.5 text-sm font-semibold transition-colors disabled:opacity-40",
    on
      ? "border-[var(--ed-accent)] bg-[var(--ed-accent)] text-[var(--ed-on-accent)]"
      : "border-[var(--ed-line)] bg-[var(--ed-card)] hover:border-[var(--ed-ink2)]",
  );

/**
 * The editor's Download menu (U18): format, 1–3× scale and where the size
 * fits, then one button. Clips show render progress; closing the menu stops
 * waiting for them.
 */
export function DownloadMenu({ card, baseName }: { card: CardRender; baseName: string }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<DownloadFormat>("png");
  const [scale, setScale] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) abort.current?.abort();
  }, [open]);

  const out = outputSize(card.size, format, scale);

  const run = async () => {
    setError(null);
    setBusy(true);
    setProgress(isClip(format) ? 0 : null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const blob = await renderDownload(card, format, scale, setProgress, ctrl.signal);
      downloadBlob(blob, downloadFilename(baseName, card.size, format, scale));
    } catch (e) {
      if ((e as { name?: string }).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Download failed");
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Download"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--ed-line)] px-3 text-sm font-semibold hover:bg-[var(--ed-card)]"
        >
          <Download className="h-4 w-4" aria-hidden />
          <span className="hidden lg:inline">Download</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="studio-editor w-80 space-y-4 border-[var(--ed-line)] bg-[var(--ed-panel)] text-[var(--ed-ink)]"
      >
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--ed-ink2)]">
            Format
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {DOWNLOAD_FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                title={f.hint}
                aria-pressed={format === f.value}
                className={chip(format === f.value)}
                onClick={() => setFormat(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--ed-ink2)]">
            {DOWNLOAD_FORMATS.find((f) => f.value === format)!.hint}
          </p>
        </fieldset>

        <fieldset className="space-y-1.5" disabled={format === "pdf"}>
          <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--ed-ink2)]">
            Scale
          </legend>
          <div className="flex gap-1.5">
            {SCALES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={format !== "pdf" && scale === s}
                className={chip(format !== "pdf" && scale === s)}
                onClick={() => setScale(s)}
              >
                {s}×
              </button>
            ))}
          </div>
        </fieldset>

        <div className="rounded-lg bg-[var(--ed-card)] px-3 py-2 text-sm">
          <p className="font-semibold">
            {SIZES[card.size].label} · {out.w} × {out.h} px
            {format === "pdf" ? " · vector" : ""}
          </p>
          <p className="text-xs text-[var(--ed-ink2)]">{PLATFORM_HINT[card.size]}</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-[var(--ed-danger)]">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[var(--ed-accent)] text-sm font-bold text-[var(--ed-on-accent)] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          {busy
            ? progress !== null
              ? `Rendering ${Math.round(progress * 100)}%`
              : "Rendering…"
            : `Download ${format.toUpperCase()}`}
        </button>
      </PopoverContent>
    </Popover>
  );
}
