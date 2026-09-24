import { Check } from "lucide-react";
import type {
  BatchImportPreview,
  ImportPreview,
  MatchImportPreview,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export type ImportStep = "upload" | "review" | "publish";

const STEPS: { id: ImportStep; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "review", label: "Review" },
  { id: "publish", label: "Publish" },
];

/** The three-step indicator (Social Studio U24); `done` marks the last step complete. */
export function ImportSteps({ step, done = false }: { step: ImportStep; done?: boolean }) {
  const at = STEPS.findIndex((s) => s.id === step);
  return (
    <ol aria-label="Import steps" className="flex items-center gap-2 text-sm">
      {STEPS.map((s, i) => {
        const complete = i < at || (done && i === at);
        const current = i === at && !done;
        return (
          <li key={s.id} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-border sm:w-10" aria-hidden />}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-full border text-xs font-semibold",
                complete && "border-primary bg-primary text-primary-foreground",
                current && "border-primary text-primary-text",
                !complete && !current && "border-border text-muted-foreground",
              )}
            >
              {complete ? <Check className="h-3.5 w-3.5" aria-label="done" /> : i + 1}
            </span>
            <span className={cn(current ? "font-semibold" : "text-muted-foreground")}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export type PreviewCounts = { newPlayers: number; existing: number; toConfirm: number };

/** New / existing / to-confirm player counts for whichever preview is open. */
export function previewCounts(
  preview: ImportPreview | MatchImportPreview | BatchImportPreview,
): PreviewCounts {
  return {
    newPlayers: preview.newPlayers,
    existing: preview.matchedPlayers,
    toConfirm: preview.suggestedPlayers,
  };
}

/** The review step's headline: what publishing will change. */
export function PreviewSummary({ counts }: { counts: PreviewCounts }) {
  const tiles: { label: string; value: number; hint: string }[] = [
    { label: "New players", value: counts.newPlayers, hint: "Created when you publish" },
    { label: "Existing players", value: counts.existing, hint: "Their totals update" },
    { label: "To confirm", value: counts.toConfirm, hint: "Possible matches to check below" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Import summary">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={cn(
            "rounded-xl border bg-card px-4 py-3",
            t.label === "To confirm" && t.value > 0 ? "border-primary" : "border-border",
          )}
        >
          <p className="text-xs text-muted-foreground">{t.label}</p>
          <p className="text-2xl font-bold tabular-nums">{t.value}</p>
          <p className="text-xs text-muted-foreground">{t.hint}</p>
        </div>
      ))}
    </div>
  );
}
