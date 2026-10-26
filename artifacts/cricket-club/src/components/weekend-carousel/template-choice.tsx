import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { assembleCarouselTemplate } from "@workspace/api-client-react";
import {
  documentRowsCapacity,
  normaliseDocument,
  pageForInput,
  primaryPage,
  type PageKey,
} from "@workspace/scorecard/kind-templates";
import { carouselTemplateKind, type CarouselSetType } from "@workspace/scorecard/queued-carousel";
import { TemplatePicker, type PickedTemplate } from "@/components/template-library/template-picker";
import { previewSample } from "@/lib/kind-templates/samples";
import { useKindTemplateData } from "@/lib/kind-templates/use-template-data";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import type { WeekendSlide } from "./model";
import type { WeekendCarouselState } from "./use-weekend-carousel";

/**
 * The template a carousel set is drawn with (ADR-011 T5.17). The picker
 * preselects the club's default for the set's kind; a set of another kind
 * starts from its own default again. The day page's list capacity splits
 * junior same-day slides.
 */
export function useCarouselTemplate(setType: CarouselSetType, size: CardSize) {
  const templateKind = carouselTemplateKind(setType);
  const [picked, setPicked] = useState<PickedTemplate | null>(null);
  useEffect(() => setPicked(null), [templateKind]);
  const dayRowsCapacity = useMemo(() => {
    if (!picked) return null;
    const page = normaliseDocument(picked.document, templateKind).pages.day;
    return page ? documentRowsCapacity(page, size, "dayRows") : null;
  }, [picked, templateKind, size]);
  return { templateKind, picked, setPicked, dayRowsCapacity };
}

/** The pages a set's slides draw, in a stable order. */
export function slidePages(slides: readonly WeekendSlide[]): PageKey[] {
  return [
    ...new Set(slides.map((s) => pageForInput(s.input as Parameters<typeof pageForInput>[0]))),
  ].sort() as PageKey[];
}

/**
 * The document the set will be saved with, assembled by the server exactly
 * as on save (the set's pages from the picked template, the bookends from the
 * same look), so the previews show what will post.
 */
export function useCarouselAssembly(
  setType: CarouselSetType,
  slides: readonly WeekendSlide[],
  picked: PickedTemplate | null,
): { document: unknown; loading: boolean; error: string | null } {
  const pages = useMemo(() => slidePages(slides), [slides]);
  const body = { setType, pages, templateRef: picked?.ref ?? null };
  const q = useQuery({
    queryKey: ["carousel-assembly", body],
    queryFn: () => assembleCarouselTemplate(body),
    enabled: picked !== null && pages.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  const error = q.isError
    ? ((q.error as { data?: { error?: string } } | null)?.data?.error ??
      "Couldn't put this design together for the set.")
    : null;
  return { document: q.data?.document, loading: q.isFetching, error };
}

/**
 * The Weekend Carousel's design: a template for the set's kind, the club's
 * default preselected. Tiles draw the set's first slide of the kind's main
 * page, or the kind's sample before the set is generated.
 */
export function CarouselTemplatePicker({ s }: { s: WeekendCarouselState }) {
  const kind = s.templateKind as ShareCardInput["kind"];
  const { data, clubName } = useKindTemplateData(kind);
  const main = primaryPage(kind);
  const slide = s.slides.find(
    (sl) => pageForInput(sl.input as Parameters<typeof pageForInput>[0]) === main,
  );
  const input = (slide?.input as ShareCardInput | undefined) ?? previewSample(kind, clubName);
  return (
    <TemplatePicker kind={kind} value={s.picked} onChange={s.setPicked} input={input} data={data} />
  );
}
