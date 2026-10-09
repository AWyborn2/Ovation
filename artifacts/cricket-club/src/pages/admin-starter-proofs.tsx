/**
 * Starter proofs (plan U10): a contact sheet of every starter design, for
 * every card kind and size, rendered in this club's brand with sample data,
 * stress data (long names, empty optional lines, nine-row lists) and as a
 * junior card. Used to review starters before the KIND_TEMPLATES switch goes
 * on; kinds a starter hasn't designed yet show their placeholder, labelled.
 */
import { useState } from "react";
import {
  placeholderDocument,
  STARTER_IDS,
  STARTER_NAMES,
  starterDocument,
  TEMPLATE_CARD_KINDS,
  TEMPLATE_SIZE_ORDER,
  type StarterId,
} from "@workspace/scorecard/kind-templates";
import { PackCard } from "@/components/pack-card";
import { BLANK_PACK_ID, type CardAdjustments } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { previewSample, stressSample } from "@/lib/kind-templates/samples";
import { useKindTemplateData } from "@/lib/kind-templates/use-template-data";

type Variant = "sample" | "stress" | "junior";
const VARIANTS: Variant[] = ["sample", "stress", "junior"];

function KindRow({
  starter,
  kind,
  variant,
}: {
  starter: StarterId;
  kind: ShareCardInput["kind"];
  variant: Variant;
}) {
  const { data, clubName } = useKindTemplateData(kind);
  const designed = starterDocument(starter, kind);
  const doc = (designed ?? placeholderDocument(kind)) as CardAdjustments;
  const input = variant === "stress" ? stressSample(kind, clubName) : previewSample(kind, clubName);
  return (
    <section className="border-b border-border py-4" aria-label={`${kind} ${variant}`}>
      <h3 className="mb-2 text-sm font-semibold">
        {kind}
        {!designed && (
          <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900">
            placeholder
          </span>
        )}
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        {TEMPLATE_SIZE_ORDER.map((size) => (
          <figure key={size} className="m-0">
            <PackCard
              input={input}
              size={size}
              sponsorsOn
              junior={variant === "junior"}
              data={data}
              packId={BLANK_PACK_ID}
              adjustments={doc}
              width={size === "landscape" ? 220 : 160}
            />
            <figcaption className="mt-1 text-xs text-muted-foreground">{size}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export default function AdminStarterProofs() {
  const [starter, setStarter] = useState<StarterId>("club-kit");
  const [variant, setVariant] = useState<Variant>("sample");
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Starter proofs</h1>
        <p className="text-sm text-muted-foreground">
          Every starter design for every card kind and size, in your club&apos;s colours. Check each
          one before card kind templates are switched on.
        </p>
      </header>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          Starter
          <select
            className="rounded border border-border bg-background px-2 py-1"
            value={starter}
            onChange={(e) => setStarter(e.target.value as StarterId)}
          >
            {STARTER_IDS.map((id) => (
              <option key={id} value={id}>
                {STARTER_NAMES[id]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Data
          <select
            className="rounded border border-border bg-background px-2 py-1"
            value={variant}
            onChange={(e) => setVariant(e.target.value as Variant)}
          >
            {VARIANTS.map((v) => (
              <option key={v} value={v}>
                {v === "sample" ? "Sample" : v === "stress" ? "Stress test" : "Junior card"}
              </option>
            ))}
          </select>
        </label>
      </div>
      {TEMPLATE_CARD_KINDS.map((kind) => (
        <KindRow key={kind} starter={starter} kind={kind} variant={variant} />
      ))}
    </div>
  );
}
