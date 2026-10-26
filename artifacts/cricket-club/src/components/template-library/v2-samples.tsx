/**
 * The template proofs sheet's format v2 samples (L1-D, T1.24): each v2
 * feature drawn at every size in the club's colours, with worst-case content
 * (the fit check's), per preset where stacks collapse and with and without
 * the photo where a condition swaps it.
 */
import {
  CONTENT_PRESETS,
  TEMPLATE_SIZE_ORDER,
  worstCaseCard,
} from "@workspace/scorecard/kind-templates";
import { PackCard } from "@/components/pack-card";
import { BLANK_PACK_ID, type CardAdjustments } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { PREVIEW_PHOTO, useKindTemplateData } from "@/lib/kind-templates/use-template-data";
import { V2_SAMPLES, type V2Sample } from "@/lib/kind-templates/v2-samples";
import { FitCheckButton } from "./fit-check-button";

type Row = { label: string; input: ShareCardInput; photo: boolean };

/** The rows a sample is drawn in: one per preset, per photo branch, or just one. */
function rowsFor(sample: V2Sample): Row[] {
  const page = sample.kind === "matchDay" ? "fixture" : "card";
  const card = (preset: (typeof CONTENT_PRESETS)[number] | undefined, photo: boolean) =>
    worstCaseCard(sample.kind, {
      page,
      contentKind: sample.kind,
      ...(preset ? { preset } : {}),
      photo,
      junior: false,
    }).input as unknown as ShareCardInput;
  if (sample.presets)
    return CONTENT_PRESETS.map((preset) => ({
      label: preset,
      input: card(preset, true),
      photo: true,
    }));
  if (sample.photoBranches)
    return [
      { label: "photo", input: card(undefined, true), photo: true },
      { label: "no photo", input: card(undefined, false), photo: false },
    ];
  return [{ label: "", input: card(undefined, true), photo: true }];
}

function SampleRow({ sample, scale }: { sample: V2Sample; scale: number }) {
  const { data } = useKindTemplateData(sample.kind as ShareCardInput["kind"]);
  return (
    <section className="border-b border-border py-4" aria-label={sample.label}>
      <h3 className="mb-1 text-sm font-semibold">{sample.label}</h3>
      <div className="mb-2">
        <FitCheckButton key={sample.id} document={sample.document} kind={sample.kind} />
      </div>
      {rowsFor(sample).map((row) => (
        <div key={row.label || "only"} className="mb-3">
          {row.label && <p className="mb-1 text-xs text-muted-foreground">{row.label}</p>}
          <div className="flex flex-wrap items-end gap-3">
            {TEMPLATE_SIZE_ORDER.map((size) => (
              <figure key={size} className="m-0">
                <PackCard
                  input={row.input}
                  size={size}
                  sponsorsOn
                  junior={false}
                  data={{ ...data, photoUrl: row.photo ? PREVIEW_PHOTO : null }}
                  packId={BLANK_PACK_ID}
                  adjustments={sample.document as unknown as CardAdjustments}
                  animate={sample.animate === true}
                  width={(size === "landscape" ? 220 : 160) * scale}
                />
                <figcaption className="mt-1 text-xs text-muted-foreground">{size}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Every v2 sample, at the proofs sheet's preview scale. */
export function V2Samples({ scale }: { scale: number }) {
  return (
    <div>
      {V2_SAMPLES.map((sample) => (
        <SampleRow key={sample.id} sample={sample} scale={scale} />
      ))}
    </div>
  );
}
