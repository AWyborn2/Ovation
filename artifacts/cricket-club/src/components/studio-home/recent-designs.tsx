/**
 * Studio home → Continue designing, and the full "Your designs" page: the
 * club's drafts, own templates and carousel sets, newest first, each opening
 * where it is edited.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Layers } from "lucide-react";
import {
  getGetClubTemplateQueryKey,
  getListCardSetsQueryKey,
  getListClubTemplatesQueryKey,
  getListSocialDraftsQueryKey,
  useGetClubTemplate,
  useListCardSets,
  useListClubTemplates,
  useListSocialDrafts,
  type CardSet,
  type SocialDraft,
} from "@workspace/api-client-react";
import { PackCard } from "@/components/pack-card";
import { LoadingState, QueryError } from "@/components/data-states";
import {
  TemplateThumb,
  WhenVisible,
  usePreviewInput,
  type LibraryPreview,
} from "@/components/template-library/previews";
import { sizeLabel } from "@/components/template-library/library-browser";
import { kindLabel } from "@/lib/social-studio";
import { SIZES, type ShareCardInput } from "@/lib/share-card";
import { BLANK_PACK_ID, type CardAdjustments, type PackCardData } from "@/lib/pack-render";
import { draftSetDocument, setDraftLayout, setDraftSlides, slideDocument } from "@/lib/set-draft";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { editedAgo, recentDesigns, type RecentDesign } from "@/lib/studio-home";

/** The club's recent work, merged from its drafts, templates and sets. */
export function useRecentDesigns(limit?: number) {
  const draftsQ = useListSocialDrafts(undefined, {
    query: { queryKey: getListSocialDraftsQueryKey() },
  });
  const templatesQ = useListClubTemplates(undefined, {
    query: { queryKey: getListClubTemplatesQueryKey() },
  });
  const setsQ = useListCardSets({ query: { queryKey: getListCardSetsQueryKey() } });
  const items = useMemo(
    () =>
      recentDesigns(
        {
          drafts: draftsQ.data as SocialDraft[] | undefined,
          templates: templatesQ.data?.templates,
          sets: setsQ.data as CardSet[] | undefined,
        },
        limit,
      ),
    [draftsQ.data, templatesQ.data, setsQ.data, limit],
  );
  const queries = [draftsQ, templatesQ, setsQ];
  return {
    items,
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.every((q) => q.isError),
    refetch: () => queries.forEach((q) => q.refetch()),
  };
}

const typeLabel = (d: RecentDesign) =>
  d.type === "draft" ? "Draft" : d.type === "template" ? "Template" : "Carousel set";

function DraftThumb({ draft, preview }: { draft: SocialDraft; preview: LibraryPreview }) {
  const input = draft.cardInput as ShareCardInput;
  const kind = String(input?.kind ?? "announcement");
  // A set with its own design: its first slide, on its page.
  const set = setDraftLayout(draft) ? draftSetDocument(draft.adjustments) : null;
  const first = set ? setDraftSlides(draft, set, preview.dataFor("matchDay"))[0] : null;
  if (set && first) {
    return (
      <WhenVisible aspect={`${SIZES.square.w} / ${SIZES.square.h}`}>
        <PackCard
          input={first.input}
          size="square"
          sponsorsOn={first.sponsorsOn}
          junior={first.junior}
          data={first.data}
          packId={BLANK_PACK_ID}
          adjustments={slideDocument(set, first)}
        />
      </WhenVisible>
    );
  }
  const carousel = readQueuedCarousel(draft.cardInput);
  if (carousel?.slides[0]) {
    // A queued set not yet edited as one: its first slide on its assembled design.
    const slide = carousel.slides[0];
    return (
      <WhenVisible aspect={`${SIZES.square.w} / ${SIZES.square.h}`}>
        <PackCard
          input={slide.input as ShareCardInput}
          size="square"
          sponsorsOn={slide.sponsorsOn}
          junior={slide.junior}
          data={slide.data as PackCardData}
          packId={BLANK_PACK_ID}
          adjustments={(draft.adjustments ?? null) as CardAdjustments | null}
        />
      </WhenVisible>
    );
  }
  if (draft.templateVersion != null) {
    return (
      <TemplateThumb
        document={draft.adjustments}
        kind={kind}
        input={input}
        data={preview.dataFor(kind)}
      />
    );
  }
  return (
    <WhenVisible aspect={`${SIZES.square.w} / ${SIZES.square.h}`}>
      <PackCard
        input={input}
        size="square"
        sponsorsOn
        junior={false}
        data={preview.dataFor(kind)}
        packId={draft.packId}
        adjustments={(draft.adjustments ?? null) as CardAdjustments | null}
      />
    </WhenVisible>
  );
}

function ClubTemplateThumb({
  id,
  kind,
  preview,
}: {
  id: number;
  kind: string;
  preview: LibraryPreview;
}) {
  const q = useGetClubTemplate(id, {
    query: { queryKey: getGetClubTemplateQueryKey(id), staleTime: 60_000 },
  });
  const input = usePreviewInput(kind, preview.clubName);
  if (!q.data) return <div className="aspect-square rounded-md bg-muted" />;
  return (
    <TemplateThumb
      document={q.data.document}
      kind={kind}
      input={input}
      data={preview.dataFor(kind)}
    />
  );
}

function DesignTile({ design, preview }: { design: RecentDesign; preview: LibraryPreview }) {
  const title = design.type === "draft" ? kindLabel(design.kind) : design.name;
  const meta = [
    typeLabel(design),
    design.type === "set" ? `${design.slides} slides` : kindLabel(design.kind),
    design.size ? sizeLabel(design.size) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <Link
        href={design.href}
        aria-label={`Open ${title}`}
        className="bc-lift block rounded-xl border border-border bg-card p-2"
      >
        {design.type === "draft" ? (
          <DraftThumb draft={design.draft} preview={preview} />
        ) : design.type === "template" ? (
          <ClubTemplateThumb id={design.id} kind={design.kind} preview={preview} />
        ) : (
          <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-md bg-primary/10 text-primary-text">
            <Layers className="h-8 w-8" aria-hidden />
            <span className="text-xs font-medium">{design.slides} slides</span>
          </div>
        )}
        <p className="mt-2 truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
        <p className="truncate text-xs text-muted-foreground">{editedAgo(design.editedAt)}</p>
      </Link>
    </li>
  );
}

export function DesignGrid({
  designs,
  preview,
}: {
  designs: RecentDesign[];
  preview: LibraryPreview;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {designs.map((d) => (
        <DesignTile key={`${d.type}-${d.id}`} design={d} preview={preview} />
      ))}
    </ul>
  );
}

/** Continue designing: at most 12 of the club's latest designs. */
export function ContinueDesigning({ preview }: { preview: LibraryPreview }) {
  const recent = useRecentDesigns(12);
  return (
    <section aria-labelledby="continue-designing-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="continue-designing-heading" className="text-lg font-semibold">
          Continue designing
        </h2>
        <Link href="/admin/social/designs" className="text-sm text-primary-text hover:underline">
          See all
        </Link>
      </div>
      {recent.isError ? (
        <QueryError onRetry={recent.refetch} />
      ) : recent.isLoading ? (
        <LoadingState label="Loading your designs…" />
      ) : recent.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing yet. Pick something to create above, and it shows here to pick up again.
        </p>
      ) : (
        <DesignGrid designs={recent.items} preview={preview} />
      )}
    </section>
  );
}

type TypeFilter = "" | RecentDesign["type"];

/** "Your designs": everything Continue designing draws from, with filters. */
export function YourDesigns({ preview }: { preview: LibraryPreview }) {
  const recent = useRecentDesigns();
  const [type, setType] = useState<TypeFilter>("");
  const [kind, setKind] = useState("");
  const kinds = [...new Set(recent.items.flatMap((d) => (d.type === "set" ? [] : [d.kind])))].sort(
    (a, b) => kindLabel(a).localeCompare(kindLabel(b)),
  );
  const shown = recent.items.filter(
    (d) => (!type || d.type === type) && (!kind || (d.type !== "set" && d.kind === kind)),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-[26px] font-bold uppercase leading-none">Your designs</h2>
        <Link href="/admin/social" className="text-sm text-primary-text hover:underline">
          Back to Home
        </Link>
      </div>
      <div className="flex flex-wrap gap-3">
        <label
          htmlFor="designs-type"
          className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
        >
          Type
          <select
            id="designs-type"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={type}
            onChange={(e) => setType(e.target.value as TypeFilter)}
          >
            <option value="">Everything</option>
            <option value="draft">Drafts</option>
            <option value="template">Templates</option>
            <option value="set">Carousel sets</option>
          </select>
        </label>
        <label
          htmlFor="designs-kind"
          className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
        >
          Card
          <select
            id="designs-kind"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">Every card</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {recent.isError ? (
        <QueryError onRetry={recent.refetch} />
      ) : recent.isLoading ? (
        <LoadingState label="Loading your designs…" />
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No designs match.
        </p>
      ) : (
        <DesignGrid designs={shown} preview={preview} />
      )}
    </div>
  );
}
