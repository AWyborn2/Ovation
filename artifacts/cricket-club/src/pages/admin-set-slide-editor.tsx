/**
 * One slide of a carousel set draft in the full card editor
 * (studio-create-consolidation S8, New Studio only). "Edit this slide" in the
 * set editor opens the slide here, drawn with its own data on the page that
 * draws it, with the card editor's tools and Download. Saving writes the
 * design back into the set as that slide's own layout (`arrangement.pageFor`,
 * S9), so the other slides keep theirs; a layout only this slide uses is
 * updated in place. The slide's data never changes, and the set editor shows
 * the result.
 */
import { useMemo, useRef } from "react";
import { Link, useParams, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import {
  getGetDraftSetDesignQueryKey,
  getGetSocialDraftQueryKey,
  getGetTenantPlanQueryKey,
  getListSocialDraftsQueryKey,
  saveDraftSetDesign,
  useGetDraftSetDesign,
  useGetSocialDraft,
  useGetTenantPlan,
  type DraftSetDesign,
  type SocialDraft,
} from "@workspace/api-client-react";
import {
  isSetDocument,
  setPageDocument,
  type SetDocument,
} from "@workspace/scorecard/kind-templates";
import { LoadingState, QueryError } from "@/components/data-states";
import { DownloadMenu } from "@/components/studio-editor/export/download-menu";
import { downloadSafeInput } from "@/components/studio-editor/export/share-download";
import { useDraftContent } from "@/components/studio-editor/draft-panels";
import { withSlideDesign } from "@/components/studio-editor/set-doc";
import { useKindTemplateData } from "@/lib/kind-templates/use-template-data";
import { canEditSlideAlone, setDraftSlides } from "@/lib/set-draft";
import { BLANK_PACK_ID, type FreeLayer } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import {
  TEMPLATE_EDITOR_MIN_WIDTH,
  TemplateEditorV2,
  useViewport,
  type EditorHost,
  type EditorTemplate,
} from "./admin-template-editor";

export default function AdminSetSlideEditor() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const key = new URLSearchParams(useSearch()).get("key") ?? "";
  const viewport = useViewport();
  const enabled = Number.isInteger(id) && id > 0;
  const planQ = useGetTenantPlan({ query: { queryKey: getGetTenantPlanQueryKey() } });
  const draftQ = useGetSocialDraft(id, {
    query: { queryKey: getGetSocialDraftQueryKey(id), enabled, retry: false },
  });
  const designQ = useGetDraftSetDesign(id, {
    query: { queryKey: getGetDraftSetDesignQueryKey(id), enabled, retry: false },
  });
  const back = `/admin/social/set/${id}`;
  const centred = (node: React.ReactNode) => (
    <div className="studio-editor grid min-h-screen place-items-center p-6 text-center">{node}</div>
  );
  const backLink = (
    <Link href={back} className="mt-3 block text-sm font-semibold underline">
      Back to the set
    </Link>
  );
  if (viewport.w < TEMPLATE_EDITOR_MIN_WIDTH) {
    return centred(
      <p className="flex max-w-xs items-center gap-2 text-sm text-[var(--ed-ink2)]">
        <Monitor className="h-4 w-4 shrink-0" aria-hidden /> Open on a computer or tablet to edit
        this slide.
      </p>,
    );
  }
  if (planQ.isLoading || draftQ.isLoading || designQ.isLoading)
    return centred(<LoadingState label="Opening the slide…" />);
  // The card editor for one slide is part of the New Studio preview only.
  if (!planQ.data?.newStudio)
    return centred(
      <div>
        <p>Edit the slide in the set editor.</p>
        {backLink}
      </div>,
    );
  if (draftQ.isError || designQ.isError || !draftQ.data || !designQ.data)
    return centred(
      <QueryError
        onRetry={() => {
          void draftQ.refetch();
          void designQ.refetch();
        }}
      />,
    );
  if (!isSetDocument(designQ.data.document)) return centred(<p>This set can&apos;t be edited.</p>);
  return (
    <SlideEditor
      draft={draftQ.data}
      design={designQ.data}
      slideKey={key}
      back={back}
      backLink={backLink}
      viewport={viewport}
    />
  );
}

function SlideEditor({
  draft,
  design,
  slideKey,
  back,
  backLink,
  viewport,
}: {
  draft: SocialDraft;
  design: DraftSetDesign;
  slideKey: string;
  back: string;
  backLink: React.ReactNode;
  viewport: { w: number; h: number };
}) {
  const qc = useQueryClient();
  // The same card data the set editor draws its slides with.
  const { data: club } = useKindTemplateData("matchDay", { photoUrl: null });
  const content = useDraftContent(draft);
  const brand = design.layout === "pages" ? content.data : club;
  const opened = design.document as unknown as SetDocument;
  const slide = useMemo(
    () => setDraftSlides(draft, opened, brand).find((s) => s.key === slideKey),
    [draft, opened, brand, slideKey],
  );
  // The set as last saved here, and the page that draws the slide in it.
  const set = useRef(opened);
  const drawnBy = useRef(slide?.page.id ?? "");
  const size = (design.size ?? "square") as CardSize;
  const template: EditorTemplate | null = useMemo(
    () =>
      slide
        ? {
            id: draft.id,
            kind: slide.page.kind,
            name: `${slide.label}: one slide`,
            version: 1,
            document: setPageDocument(opened, slide.page),
            fitStatus: "pass",
          }
        : null,
    // Opened once: the editor keeps its own history from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!slide],
  );

  if (!slide || !template)
    return (
      <div className="studio-editor grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p>This slide isn&apos;t in the set any more.</p>
          {backLink}
        </div>
      </div>
    );
  if (!canEditSlideAlone(slide))
    return (
      <div className="studio-editor grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p>This page is edited in the set editor.</p>
          {backLink}
        </div>
      </div>
    );

  const host: EditorHost<EditorTemplate> = {
    club: true,
    backHref: back,
    save: async (baseVersion, document) => {
      const doc = document as {
        pages?: Record<string, { layers?: FreeLayer[]; background?: string } | undefined>;
        palettes?: SetDocument["palettes"];
      };
      const body = doc.pages?.[slide.page.page];
      const next = withSlideDesign(
        set.current,
        slide.key,
        drawnBy.current,
        {
          layers: body?.layers ?? [],
          ...(body?.background ? { background: body.background } : {}),
        },
        `${slide.label} layout`,
      );
      if (!next) {
        const error = "The set holds 20 pages, the most it can. Delete a page in the set editor.";
        throw Object.assign(new Error(error), { data: { error } });
      }
      // A colour this card uses that the set doesn't list yet.
      const palettes = [...new Set([...(next.palettes ?? []), ...(doc.palettes ?? [])])];
      const saved: SetDocument = palettes.length ? { ...next, palettes } : next;
      await saveDraftSetDesign(draft.id, {
        document: saved,
        ...(design.layout === "carousel" && design.size ? { size: design.size } : {}),
      } as Parameters<typeof saveDraftSetDesign>[1]);
      set.current = saved;
      drawnBy.current =
        setDraftSlides(draft, saved, brand).find((s) => s.key === slide.key)?.page.id ??
        drawnBy.current;
      void qc.invalidateQueries({ queryKey: getGetDraftSetDesignQueryKey(draft.id) });
      void qc.invalidateQueries({ queryKey: getGetSocialDraftQueryKey(draft.id) });
      void qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
      return { ...template, version: baseVersion + 1, document };
    },
    reload: async () => undefined,
    status: () => (
      <span className="rounded-full bg-[var(--ed-card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ed-ink2)]">
        One slide of the set
      </span>
    ),
  };

  return (
    <TemplateEditorV2
      template={template}
      viewport={viewport}
      host={host}
      initialFormat={size}
      draftMode={{
        input: slide.input as unknown as Record<string, unknown>,
        data: slide.data,
        actions: ({ document, size: shownSize, input, data }) => (
          <DownloadMenu
            card={{
              // A junior slide shows a photo only behind the server's marker.
              input: downloadSafeInput(input),
              size: shownSize,
              theme: null,
              data,
              packId: BLANK_PACK_ID,
              junior: slide.junior,
              adjustments: document as never,
            }}
            baseName={slide.label.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "slide"}
          />
        ),
      }}
    />
  );
}
