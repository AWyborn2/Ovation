import {
  placeholderDocument,
  STARTER_IDS,
  STARTER_NAMES,
  starterDocument,
  type StarterId,
} from "@workspace/scorecard/kind-templates";
import { PackCard } from "@/components/pack-card";
import { BLANK_PACK_ID, type CardAdjustments, type PackCardData } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";

const BLURB: Record<StarterId, string> = {
  "club-kit": "Bold club colours, big type, the crest up front.",
  broadcast: "A dark, TV-graphics look with crisp panels.",
};

/**
 * First open of a kind with no template (R13): pick a starter design, shown in
 * the club's colours with sample data. The template is created from it and
 * can then be changed freely.
 */
export function StarterChooser({
  kind,
  label,
  input,
  data,
  busy,
  error,
  onPick,
  title,
  blurb,
}: {
  kind: string;
  label: string;
  input: ShareCardInput;
  data: PackCardData | null;
  busy: boolean;
  error: string | null;
  onPick: (starter: StarterId) => void;
  /** Heading and line above the choices (defaults: first-time wording). */
  title?: string;
  blurb?: string;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 p-8 text-center">
      <div>
        <h1 className="font-serif text-2xl font-bold uppercase">
          {title ?? `Design your ${label} card`}
        </h1>
        <p className="mt-1 text-sm text-[var(--ed-ink2)]">
          {blurb ?? "Pick a starting design. You can change everything about it afterwards."}
        </p>
      </div>
      <div className="grid w-full gap-5 sm:grid-cols-2">
        {STARTER_IDS.map((id) => {
          const doc = (starterDocument(id, kind) ?? placeholderDocument(kind)) as CardAdjustments;
          return (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={() => onPick(id)}
              aria-label={`Start from ${STARTER_NAMES[id]}`}
              className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--ed-line)] bg-[var(--ed-panel)] p-4 transition-colors hover:border-[var(--ed-accent)] disabled:opacity-60"
            >
              <PackCard
                input={input}
                size="square"
                sponsorsOn
                junior={false}
                data={data}
                packId={BLANK_PACK_ID}
                adjustments={doc}
                width={240}
              />
              <span className="font-semibold">{STARTER_NAMES[id]}</span>
              <span className="text-xs text-[var(--ed-ink2)]">{BLURB[id]}</span>
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--ed-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
