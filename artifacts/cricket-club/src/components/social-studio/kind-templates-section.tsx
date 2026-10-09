import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, PenSquare } from "lucide-react";
import {
  dismissKindTemplateNotice,
  getGetKindTemplateQueryKey,
  getListKindTemplatesQueryKey,
  useGetKindTemplate,
  type KindTemplateSummary,
} from "@workspace/api-client-react";
import {
  placeholderDocument,
  STARTER_NAMES,
  starterDocument,
  starterForPack,
  TEMPLATE_CARD_KINDS,
} from "@workspace/scorecard/kind-templates";
import { PackCard } from "@/components/pack-card";
import { Button } from "@/components/ui/button";
import { BLANK_PACK_ID, type CardAdjustments, type PackCardData } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { kindLabel, packName, type CardKind } from "@/lib/social-studio";

const editHref = (kind: string) => `/admin/social/templates/${kind}`;

/** A pack's name, readable even once the pack has left the catalogue ("gold-foil-v1" → "Gold Foil"). */
function retiredPackName(id: string): string {
  const name = packName(id);
  if (name !== id) return name;
  return id
    .replace(/-vd+$/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function KindRow({
  kind,
  summary,
  currentPackId,
  input,
  data,
}: {
  kind: CardKind;
  summary: KindTemplateSummary | undefined;
  currentPackId: string | null;
  input: ShareCardInput | undefined;
  data: PackCardData | null;
}) {
  // A kind with a template previews its own design; one without shows the
  // starter it will begin from (the one its current pack maps to).
  const templateQ = useGetKindTemplate(kind, {
    query: { queryKey: getGetKindTemplateQueryKey(kind), enabled: !!summary, retry: false },
  });
  const starter = starterForPack(summary?.replacedPackId ?? currentPackId);
  const doc = (templateQ.data?.document ??
    starterDocument(starter, kind) ??
    placeholderDocument(kind)) as CardAdjustments;
  const label = kindLabel(kind);

  return (
    <li className="flex items-center gap-4 rounded-xl border border-border bg-card p-3">
      <div className="w-24 shrink-0 overflow-hidden rounded-md">
        {input && (
          <PackCard
            input={input}
            size="square"
            sponsorsOn
            junior={false}
            data={data}
            packId={BLANK_PACK_ID}
            adjustments={doc}
            width={96}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {summary
            ? `Your design · version ${summary.version}` +
              (summary.waitingDrafts > 0
                ? ` · ${summary.waitingDrafts} waiting ${summary.waitingDrafts === 1 ? "card" : "cards"}`
                : "")
            : `Not designed yet · starts from ${STARTER_NAMES[starter]}`}
        </p>
      </div>
      <Button size="sm" variant="outline" asChild>
        <Link href={editHref(kind)} aria-label={`Edit the ${label} template`}>
          <PenSquare className="mr-1 h-3.5 w-3.5" aria-hidden /> Edit
        </Link>
      </Button>
    </li>
  );
}

/**
 * The Studio's card designs when card kind templates are on (plan U9): one
 * row per card kind with its design and an Edit link, replacing the per-kind
 * pack choice. A banner names any retired design pack a template replaced
 * and links to each affected kind until dismissed (R19).
 */
export function KindTemplatesSection({
  templates,
  packIdByKind,
  inputByKind,
  dataByKind,
}: {
  templates: KindTemplateSummary[];
  /** The pack each kind uses today, for kinds not designed yet. */
  packIdByKind: ReadonlyMap<CardKind, string | null>;
  inputByKind: Map<CardKind, ShareCardInput>;
  dataByKind: Map<string, PackCardData>;
}) {
  const qc = useQueryClient();
  const [dismissing, setDismissing] = useState(false);
  const byKind = new Map(templates.map((t) => [t.kind, t]));
  const packFor = (kind: string): string | null => packIdByKind.get(kind as CardKind) ?? null;

  const replaced = templates.filter((t) => t.replacedPackId && !t.noticeDismissed);
  const replacedPacks = [...new Set(replaced.map((t) => t.replacedPackId!))];

  const dismiss = async () => {
    setDismissing(true);
    try {
      await Promise.all(replaced.map((t) => dismissKindTemplateNotice(t.kind)));
    } finally {
      setDismissing(false);
      qc.invalidateQueries({ queryKey: getListKindTemplatesQueryKey() });
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="kind-templates-heading">
      <div>
        <h2
          id="kind-templates-heading"
          className="font-serif text-[26px] font-bold uppercase leading-none"
        >
          Card designs
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each kind of card has one design. Change it once and every new card of that kind uses it.
        </p>
      </div>

      {replaced.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">
              {replacedPacks.map(retiredPackName).join(" and ")}{" "}
              {replacedPacks.length === 1 ? "has" : "have"} been retired.
            </p>
            <p className="text-muted-foreground">
              These cards now start from a similar design. Check they still look right:{" "}
              {replaced.map((t, i) => (
                <span key={t.kind}>
                  {i > 0 && ", "}
                  <Link href={editHref(t.kind)} className="font-medium text-primary-text underline">
                    {kindLabel(t.kind)}
                  </Link>
                </span>
              ))}
              .
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={dismiss} disabled={dismissing}>
            Dismiss
          </Button>
        </div>
      )}

      <ul className="grid gap-2 lg:grid-cols-2">
        {TEMPLATE_CARD_KINDS.map((kind) => (
          <KindRow
            key={kind}
            kind={kind as CardKind}
            summary={byKind.get(kind)}
            currentPackId={packFor(kind)}
            input={inputByKind.get(kind as CardKind)}
            data={dataByKind.get(kind) ?? null}
          />
        ))}
      </ul>
    </section>
  );
}
