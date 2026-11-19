/**
 * Studio home → Continue designing, and the full "Your designs" page: the
 * club's drafts, own templates and carousel sets, newest first, each opening
 * where it is edited. Each tile can be dismissed (a draft, which can be
 * reopened from the queue) or deleted (a template or carousel set).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Trash2 } from "lucide-react";
import {
  deleteCardSet,
  deleteClubTemplate,
  dismissSocialDraft,
  getGetClubTemplateQueryKey,
  getListCardSetsQueryKey,
  getListClubTemplatesQueryKey,
  getListSocialDraftsQueryKey,
  listCardSets,
  listClubTemplates,
  listSocialDrafts,
  useGetClubTemplate,
  type CardSet,
  type SocialDraft,
} from "@workspace/api-client-react";
import { PackCard } from "@/components/pack-card";
import { useJuniorPhotoGuard } from "@/components/studio-editor/junior-photos";
import { useConfirm } from "@/components/confirm-dialog";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { LoadingState, QueryError } from "@/components/data-states";
import { Button } from "@/components/ui/button";
import {
  SetPageThumb,
  TemplateThumb,
  WhenVisible,
  usePreviewInput,
  type LibraryPreview,
  templateKindLabel,
} from "@/components/template-library/previews";
import { isSetDocument } from "@workspace/scorecard/kind-templates";
import { sizeLabel } from "@/components/template-library/library-browser";
import { kindLabel } from "@/lib/social-studio";
import { SIZES, type ShareCardInput } from "@/lib/share-card";
import { BLANK_PACK_ID, type CardAdjustments, type PackCardData } from "@/lib/pack-render";
import { draftSetDocument, setDraftLayout, setDraftSlides, slideDocument } from "@/lib/set-draft";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { editedAgo, recentDesigns, type RecentDesign } from "@/lib/studio-home";

/**
 * Only the queue's open drafts: Your designs leaves posted and dismissed ones
 * out, so it asks the API not to send them (a club's whole posting history,
 * which kept the page loading for over a minute on a cold start, retest 9).
 */
export const OPEN_DRAFTS = { open: true } as const;

/**
 * How long a list may load before the page offers a retry. Each request also
 * gives up on its own after this long, so a stalled one fails and shows an
 * error instead of a spinner that never ends.
 */
export const DESIGNS_TIMEOUT_MS = 20_000;

/** Abort a list request that takes longer than `DESIGNS_TIMEOUT_MS`. */
export function timed(
  signal: AbortSignal | undefined,
  ms: number = DESIGNS_TIMEOUT_MS,
): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("The request timed out.", "TimeoutError")),
    ms,
  );
  const stop = () => clearTimeout(timer);
  controller.signal.addEventListener("abort", stop, { once: true });
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

const listQuery = { retry: 1, retryDelay: 1_000 } as const;

/** The queue's open drafts (awaiting review or ready), as Studio home reads them. */
export function useOpenDrafts() {
  return useQuery({
    ...listQuery,
    queryKey: getListSocialDraftsQueryKey(OPEN_DRAFTS),
    queryFn: ({ signal }) => listSocialDrafts(OPEN_DRAFTS, { signal: timed(signal) }),
  });
}

/** The club's recent work, merged from its drafts, templates and sets. */
export function useRecentDesigns(limit?: number) {
  const draftsQ = useOpenDrafts();
  const templatesQ = useQuery({
    ...listQuery,
    queryKey: getListClubTemplatesQueryKey({ includeSets: true }),
    queryFn: ({ signal }) => listClubTemplates({ includeSets: true }, { signal: timed(signal) }),
  });
  const setsQ = useQuery({
    ...listQuery,
    queryKey: getListCardSetsQueryKey(),
    queryFn: ({ signal }) => listCardSets({ signal: timed(signal) }),
  });
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
    // Any list that failed: showing the rest as if complete would hide a
    // club's work, so the page says so and offers a retry.
    isError: queries.some((q) => q.isError && q.data === undefined),
    refetch: () => {
      for (const q of queries) if (q.isError || q.isLoading) void q.refetch();
    },
  };
}

/**
 * The loading state, with a retry once loading has taken longer than it
 * should (a request the browser is still waiting on).
 */
function DesignsLoading({ onRetry }: { onRetry: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (slow) return;
    const t = setTimeout(() => setSlow(true), DESIGNS_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [slow]);
  if (!slow) return <LoadingState label="Loading your designs…" />;
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
      <LoadingState label="Still loading your designs…" className="py-0" />
      <p>This is taking longer than usual.</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setSlow(false);
          onRetry();
        }}
      >
        Try again
      </Button>
    </div>
  );
}

const typeLabel = (d: RecentDesign) =>
  d.type === "draft" ? "Draft" : d.type === "template" ? "Template" : "Carousel set";

function DraftThumb({ draft: saved, preview }: { draft: SocialDraft; preview: LibraryPreview }) {
  // A junior card or set draws only the photos it may show (ADR-007).
  const guard = useJuniorPhotoGuard();
  const draft = useMemo(() => guard.safeDraft(saved), [guard, saved]);
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

/**
 * A club template's tile: its design is fetched only once the tile is near the
 * screen, so a long Your designs list doesn't ask for every template at once.
 */
function ClubTemplateThumb(props: { id: number; kind: string; preview: LibraryPreview }) {
  return (
    <WhenVisible aspect={`${SIZES.square.w} / ${SIZES.square.h}`}>
      <ClubTemplateDesign {...props} />
    </WhenVisible>
  );
}

function ClubTemplateDesign({
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
  if (!q.data) return <div className="h-full w-full bg-muted" />;
  // A carousel set design: its first page.
  if (isSetDocument(q.data.document) && q.data.document.pages[0])
    return <SetPageThumb set={q.data.document} page={q.data.document.pages[0]} preview={preview} />;
  return (
    <TemplateThumb
      document={q.data.document}
      kind={kind}
      input={input}
      data={preview.dataFor(kind)}
    />
  );
}

/** What removing a tile does, in the words its button and confirmation use. */
function removal(design: RecentDesign, title: string) {
  if (design.type === "draft")
    return {
      verb: "Dismiss",
      title: "Dismiss draft",
      description: `Dismiss this ${title} draft? It leaves the queue and won't be posted. You can reopen it from the queue's dismissed cards.`,
      done: `Dismissed the ${title} draft.`,
    };
  if (design.type === "template")
    return {
      verb: "Delete",
      title: "Delete template",
      description: `Delete "${title}"? This can't be undone. Cards already made with it keep their design.`,
      done: `Deleted "${title}".`,
    };
  return {
    verb: "Delete",
    title: "Delete carousel set",
    description: `Delete the "${title}" carousel set? This can't be undone. Carousels already made from it keep their slides.`,
    done: `Deleted "${title}".`,
  };
}

function DesignTile({
  design,
  preview,
  onStatus,
}: {
  design: RecentDesign;
  preview: LibraryPreview;
  onStatus: (message: string) => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const title = design.type === "draft" ? kindLabel(design.kind) : design.name;
  // A kind's default template can't go: another must be picked first.
  const removable = !(design.type === "template" && design.template.isDefault);
  const remove = async () => {
    const r = removal(design, title);
    if (
      !(await confirm({
        title: r.title,
        description: r.description,
        confirmText: r.verb,
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    try {
      if (design.type === "draft") {
        await dismissSocialDraft(design.id);
        await qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
      } else if (design.type === "template") {
        await deleteClubTemplate(design.id);
        await qc.invalidateQueries({ queryKey: getListClubTemplatesQueryKey() });
      } else {
        await deleteCardSet(design.id);
        await qc.invalidateQueries({ queryKey: getListCardSetsQueryKey() });
      }
      onStatus(r.done);
    } catch (e) {
      onStatus(handleAdminMutationError(e) ?? "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const meta = [
    typeLabel(design),
    design.type === "set" ? `${design.slides} slides` : templateKindLabel(design.kind),
    design.size ? sizeLabel(design.size) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const verb = design.type === "draft" ? "Dismiss" : "Delete";
  return (
    <li className="relative">
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
      {removable && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          aria-label={`${verb} ${title}`}
          title={verb}
          className="absolute right-3 top-3 rounded-full border border-border bg-background/90 p-1.5 text-muted-foreground shadow-sm transition hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
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
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {designs.map((d) => (
          <DesignTile key={`${d.type}-${d.id}`} design={d} preview={preview} onStatus={setStatus} />
        ))}
      </ul>
    </div>
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
        <DesignsLoading onRetry={recent.refetch} />
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
const TYPE_FILTERS: TypeFilter[] = ["", "draft", "template", "set"];

/** "Your designs": everything Continue designing draws from, with filters. */
export function YourDesigns({
  preview,
  initialType = "",
  showBack = true,
}: {
  preview: LibraryPreview;
  /** Start filtered to one type (New Studio's `?type=`, e.g. from the old Carousel sets URL). */
  initialType?: string;
  /** "Back to Home" (old Studio, where Your designs sits under Home). */
  showBack?: boolean;
}) {
  const recent = useRecentDesigns();
  const [type, setType] = useState<TypeFilter>(() =>
    TYPE_FILTERS.includes(initialType as TypeFilter) ? (initialType as TypeFilter) : "",
  );
  const [kind, setKind] = useState("");
  const kinds = [...new Set(recent.items.flatMap((d) => (d.type === "set" ? [] : [d.kind])))].sort(
    (a, b) => templateKindLabel(a).localeCompare(templateKindLabel(b)),
  );
  const shown = recent.items.filter(
    (d) => (!type || d.type === type) && (!kind || (d.type !== "set" && d.kind === kind)),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-[26px] font-bold uppercase leading-none">Your designs</h2>
        {showBack && (
          <Link href="/admin/social" className="text-sm text-primary-text hover:underline">
            Back to Home
          </Link>
        )}
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
                {templateKindLabel(k)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {recent.isError ? (
        <QueryError onRetry={recent.refetch} />
      ) : recent.isLoading ? (
        <DesignsLoading onRetry={recent.refetch} />
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
