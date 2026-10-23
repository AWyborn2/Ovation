/**
 * Library thumbnails drawn in the browsing club's own data (ADR-011 §3
 * "Browse", T5.2): its colours, crest, sponsors and photo, and its latest
 * senior card of the kind (else the kind's sample in the club's identity).
 * The data is loaded once per kind and shared; each thumbnail renders lazily,
 * when it scrolls into view, on the blank base with the template's document.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getGetTemplatePreviewInputQueryKey,
  getListClubPhotosQueryKey,
  useGetSocialSettings,
  useGetTemplatePreviewInput,
  useListClubPhotos,
  type ClubPhoto,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import {
  primaryPage,
  setPageRenderDocument,
  setTypeOfKind,
  SET_TYPE_LABELS,
  type PageKey,
  type SetDocument,
  type SetPage,
} from "@workspace/scorecard/kind-templates";
import { PackCard } from "@/components/pack-card";
import { packPreviewPhoto } from "@/lib/gallery-photo";
import {
  buildPackData,
  kindSponsors,
  presentingSponsorName,
  shortClubName,
  tenantHashtag,
} from "@/lib/pack-card-data";
import { BLANK_PACK_ID, type CardAdjustments, type PackCardData } from "@/lib/pack-render";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import { sampleDay } from "@/lib/kind-templates/samples";
import { SIZES, type CardSize, type ShareCardInput } from "@/lib/share-card";
import { useHeroImage } from "@/lib/use-hero-image";
import { kindLabel, type CardKind } from "@/lib/social-studio";

/** What library thumbnails draw with: the club's payload per kind, and its short name. */
export type LibraryPreview = {
  dataFor: (kind: string) => PackCardData;
  clubName: string | undefined;
};

/** The club's preview payload for each kind (brand, sponsors, photo, names). */
export function useLibraryPreviewData(): LibraryPreview {
  const settingsQ = useGetSocialSettings();
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const heroImage = useHeroImage("home");
  const photosQ = useListClubPhotos(undefined, {
    query: { queryKey: getListClubPhotosQueryKey(), enabled: !heroImage },
  });
  const photo = packPreviewPhoto(heroImage, photosQ.data as ClubPhoto[] | undefined);
  const clubName = shortClubName(bundle?.brand?.name ?? "") || undefined;
  const cache = useMemo(() => new Map<string, PackCardData>(), [bundle, photo]);
  const dataFor = (kind: string): PackCardData => {
    let data = cache.get(kind);
    if (!data) {
      const sponsorsOn = !!bundle?.settings?.sponsorsEnabled;
      data = buildPackData({
        brand: bundle?.brand,
        hashtag: tenantHashtag(bundle),
        sponsors: kindSponsors(bundle, kind as CardKind, sponsorsOn),
        presentingSponsorName: presentingSponsorName(bundle, sponsorsOn),
        photoUrl: photo,
        packColourModes: bundle?.settings?.packColourModes,
        names: bundle?.cardNames,
      });
      cache.set(kind, data);
    }
    return data;
  };
  return { dataFor, clubName };
}

/** The card a kind's thumbnails draw: the club's latest senior card, else its sample. */
export function usePreviewInput(kind: string, clubName: string | undefined): ShareCardInput {
  const params = { kind };
  const q = useGetTemplatePreviewInput(params, {
    query: { queryKey: getGetTemplatePreviewInputQueryKey(params), staleTime: 5 * 60_000 },
  });
  return useMemo(() => {
    const input = q.data?.source === "draft" ? q.data.input : null;
    if (input && typeof input === "object") return input as ShareCardInput;
    return sampleCardInput(kind as ShareCardInput["kind"], clubName);
  }, [q.data, kind, clubName]);
}

/**
 * The input and document that draw one page of a template. A bookend or day
 * page gets the input flag that selects it; the document also carries that
 * page as its primary page, so it draws before the renderer selects pages.
 */
export function pageView(
  document: unknown,
  kind: string,
  input: ShareCardInput,
  page: PageKey,
): { input: ShareCardInput; document: unknown } {
  const primary = primaryPage(kind);
  if (page === primary) return { input, document };
  const doc = document as { formatVersion?: number; pages?: Record<string, unknown> };
  const pageInput =
    page === "title" || page === "sponsors"
      ? { ...input, carouselPage: { page, title: "This weekend", sponsors: [] } }
      : page === "day"
        ? { ...input, carouselDay: sampleDay(input.kind) }
        : input;
  return {
    input: pageInput as ShareCardInput,
    document:
      doc?.formatVersion === 2 && doc.pages?.[page]
        ? { ...doc, pages: { ...doc.pages, [primary]: doc.pages[page] } }
        : document,
  };
}

/** Mounts its children once the box scrolls near the viewport. */
export function WhenVisible({ children, aspect }: { children: ReactNode; aspect: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return (
    <div ref={ref} className="overflow-hidden rounded-md bg-muted" style={{ aspectRatio: aspect }}>
      {visible ? children : null}
    </div>
  );
}

/** One template drawn in the club's data, lazily. */
export function TemplateThumb({
  document,
  kind,
  input,
  data,
  size = "square",
  page,
}: {
  document: unknown;
  kind: string;
  input: ShareCardInput;
  data: PackCardData;
  size?: CardSize;
  page?: PageKey;
}) {
  const view = useMemo(
    () => pageView(document, kind, input, page ?? primaryPage(kind)),
    [document, kind, input, page],
  );
  return (
    <WhenVisible aspect={`${SIZES[size].w} / ${SIZES[size].h}`}>
      <PackCard
        input={view.input}
        size={size}
        sponsorsOn
        junior={false}
        data={data}
        packId={BLANK_PACK_ID}
        adjustments={view.document as CardAdjustments}
      />
    </WhenVisible>
  );
}

/** A set's page drawn in the club's data, lazily (carousel set editor plan). */
export function SetPageThumb({
  set,
  page,
  preview,
  size = "square",
}: {
  set: SetDocument;
  page: SetPage;
  preview: LibraryPreview;
  size?: CardSize;
}) {
  const input = usePreviewInput(page.kind, preview.clubName);
  const document = useMemo(() => setPageRenderDocument(set, page), [set, page]);
  return (
    <TemplateThumb
      document={document}
      kind={page.kind}
      input={input}
      data={preview.dataFor(page.kind)}
      size={size}
      page={page.page}
    />
  );
}

/** A template's name for its kind: a card kind, or "Team lists set". */
export function templateKindLabel(kind: string): string {
  const set = setTypeOfKind(kind);
  return set ? `${SET_TYPE_LABELS[set]} set` : kindLabel(kind as CardKind);
}
