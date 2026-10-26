/**
 * A set document's slides (carousel set editor plan, parts 2 and 3): which
 * page draws each slide of a set, and the input it draws with.
 *
 * Two ways in:
 *
 * - **By page** (`expandSetSlides`): a set template with sample items, or a
 *   list draft (Round Team Lists) whose slides are worked out from its data.
 *   Each fixed page is one slide; each repeating page is one slide per item of
 *   its slot. A draft's `arrangement` then reorders and drops slides.
 * - **By slide** (`mapCarouselSlides`): a queued carousel (ADR-010 v3), whose
 *   slides are stored. Each slide is drawn by the page its `pageId` names, or
 *   else the page of its content's slot.
 *
 * A slide's input is its item's, adapted when the page is another kind's
 * (`slideInputFor`): a Match Day title cover drawn for a list draft, or a
 * list card's cover drawn for a queued set. The adaptation only moves what
 * the item already holds (dates, grades, counts), so a junior set's cover
 * holds junior data only (C4).
 */
import type { TemplateDocumentV2 } from "./format";
import { templateKindFor } from "./pages";
import {
  isRepeatSlot,
  setPageRenderDocument,
  setPageLabel,
  SET_TYPE_LABELS,
  type SetDocument,
  type SetPage,
  type SetSlot,
} from "./set-document";

type Input = Record<string, unknown>;

/** One item of a set's data: the cover, the sponsors page, or a team, fixture, result or day. */
export type SetItem = {
  /** Stable: the slide's key in an arrangement. */
  key: string;
  slot: SetSlot;
  input: Input;
  label?: string;
};

/** One slide: the page that draws it and the input it draws with. */
export type SetSlide = {
  key: string;
  page: SetPage;
  input: Input;
  label: string;
  /** For a repeating page, which of its items this is (1-based). */
  item?: number;
};

const object = (v: unknown): v is Input => typeof v === "object" && v !== null && !Array.isArray(v);

/** The slot a stored carousel slide fills, from its input (title, sponsors, day or item). */
export function carouselSlideSlot(input: Input): SetSlot {
  const page = object(input.carouselPage) ? input.carouselPage.page : undefined;
  if (page === "title") return "cover";
  if (page === "sponsors") return "sponsors";
  if (input.carouselDay) return "day";
  const kind = templateKindFor(String(input.kind ?? ""));
  if (kind === "teamList") return "team";
  if (kind === "matchSummary") return "result";
  if (kind === "matchDay") return "fixture";
  return "page";
}

/** The set type's title for a cover adapted from a list card. */
const COVER_TITLE: Record<string, string> = {
  teamListRound: "Team lists",
  roundFixtures: "This weekend",
  resultsSummary: "Results",
  weekendWrap: "Results",
};

/** The text a list card's cover dates itself with. */
const listDate = (input: Input): string =>
  typeof input.date === "string"
    ? input.date
    : typeof input.dateRange === "string"
      ? input.dateRange
      : "";

/** Rows of a list cover built from item inputs (only the fields a cover reads). */
function coverRows(kind: string, items: readonly Input[]): Input {
  const grade = (i: Input) =>
    typeof i.grade === "string" ? i.grade : typeof i.gradeLabel === "string" ? i.gradeLabel : "";
  switch (kind) {
    case "teamListRound":
      return { teams: items.map((i) => ({ grade: grade(i) })) };
    case "roundFixtures":
      return { fixtures: items.map((i) => ({ grade: grade(i) })) };
    case "resultsSummary":
      return { results: items.map((i) => ({ grade: grade(i), outcome: i.outcome })) };
    default:
      return { matches: items.map((i) => ({ gradeLabel: grade(i), outcome: i.outcome })) };
  }
}

/**
 * The input `page` draws an item with. Same kind: the item's own input. A
 * Match Day title cover for a list card: the card's date and title. A list
 * card's cover for a Match Day title: the title's date, and the set's items as
 * its rows. A design page of another kind: the kind alone, so only the club's
 * brand shows.
 */
export function slideInputFor(
  page: Pick<SetPage, "kind" | "page" | "slot">,
  input: Input,
  ctx: { items?: readonly Input[]; sponsors?: Input["sponsors"] } = {},
): Input {
  const from = templateKindFor(String(input.kind ?? ""));
  const to = templateKindFor(page.kind);
  const junior = input.junior === true ? { junior: true } : {};
  // Match Day's title and sponsors pages adapt any other card, and a fixture
  // card drawn on them as design pages (its own carousel, D9).
  const adaptMatchDay =
    from !== "matchDay" || (page.slot === "page" && !object(input.carouselPage));
  if (page.kind === "matchDay" && page.page === "sponsors" && adaptMatchDay)
    return {
      kind: "matchDay",
      ...junior,
      date: listDate(input),
      carouselPage: {
        page: "sponsors",
        title: "Thanks to our sponsors",
        fixtureCount: ctx.items?.length ?? 0,
        sponsors: Array.isArray(ctx.sponsors) ? ctx.sponsors : [],
      },
    };
  if (from === to && !(page.kind === "matchDay" && page.page === "title" && adaptMatchDay)) {
    if (page.slot === "cover" && from !== "matchDay")
      return { ...input, setRole: "cover", setPage: null };
    return input;
  }
  if (page.kind === "matchDay" && page.page === "title") {
    return {
      kind: "matchDay",
      ...junior,
      ...(typeof input.roundLabel === "string" ? { roundLabel: input.roundLabel } : {}),
      date: listDate(input),
      carouselPage: {
        page: "title",
        title: COVER_TITLE[from] ?? "This weekend",
        fixtureCount: ctx.items?.length ?? 0,
        sponsors: [],
      },
    };
  }
  // A list card's cover, or the same page as a design page (a card's own carousel).
  if ((page.slot === "cover" || page.slot === "page") && page.kind in COVER_TITLE) {
    const title = object(input.carouselPage) ? input.carouselPage : {};
    return {
      kind: page.kind,
      ...junior,
      ...(typeof input.roundLabel === "string" ? { roundLabel: input.roundLabel } : {}),
      date: typeof input.date === "string" ? input.date : String(title.dateRange ?? ""),
      dateRange: typeof input.date === "string" ? input.date : "",
      ...coverRows(page.kind, ctx.items ?? []),
      setRole: "cover",
      setPage: null,
    };
  }
  return { kind: page.kind, ...junior };
}

/** The pages a slide may be drawn by for a slot: its own, else a design page. */
function pageForSlot(doc: SetDocument, slot: SetSlot): SetPage | undefined {
  return doc.pages.find((p) => p.slot === slot);
}

/**
 * Slides by page: each fixed page once, each repeating page once per item of
 * its slot, in page order; then the document's arrangement (a draft's slide
 * order and deletions). A fixed page with no item draws with the cover's
 * input (a design page), or nothing to adapt from but the kind. A junior set
 * (`ctx.junior`) marks every slide junior.
 */
export function expandSetSlides(
  doc: SetDocument,
  items: readonly SetItem[],
  ctx: { sponsors?: Input["sponsors"]; junior?: boolean } = {},
): SetSlide[] {
  const bySlot = new Map<SetSlot, SetItem[]>();
  for (const item of items) bySlot.set(item.slot, [...(bySlot.get(item.slot) ?? []), item]);
  const repeatInputs = items.filter((i) => isRepeatSlot(i.slot)).map((i) => i.input);
  const coverItem = bySlot.get("cover")?.[0] ?? items[0];
  const out: SetSlide[] = [];
  for (const page of doc.pages) {
    if (page.role === "repeat") {
      (bySlot.get(page.slot) ?? []).forEach((item, i) =>
        out.push({
          key: item.key,
          page,
          input: slideInputFor(page, item.input, { items: repeatInputs, sponsors: ctx.sponsors }),
          label: item.label ?? `${setPageLabel(page)} ${i + 1}`,
          item: i + 1,
        }),
      );
      continue;
    }
    const own = page.slot === "page" ? undefined : bySlot.get(page.slot)?.[0];
    const source = own ?? coverItem;
    out.push({
      key: `page:${page.id}`,
      page,
      input: source
        ? slideInputFor(page, source.input, { items: repeatInputs, sponsors: ctx.sponsors })
        : { kind: page.kind },
      label: setPageLabel(page),
    });
  }
  // A junior set is junior on every slide (KTD6, C4): no slide draws senior.
  const slides = ctx.junior ? out.map((s) => ({ ...s, input: { ...s.input, junior: true } })) : out;
  return numberSlides(arrangeSlides(slides, doc.arrangement));
}

/**
 * A detail slide's page marker ("2/4") counts the slides as arranged: a
 * slide moved, deleted or added renumbers the set. Slides without one (a
 * cover) stay without.
 */
export function numberSlides<S extends { input: Input }>(slides: readonly S[]): S[] {
  return slides.map((s, i) =>
    typeof s.input.setPage === "string"
      ? { ...s, input: { ...s.input, setPage: `${i + 1}/${slides.length}` } }
      : s,
  );
}

/**
 * Apply a draft's arrangement: drop removed slides, put the ordered ones in
 * their order, and keep every other slide (one that came with new data)
 * after the slide it followed.
 */
export function arrangeSlides<S extends { key: string }>(
  slides: readonly S[],
  arrangement: SetDocument["arrangement"],
): S[] {
  if (!arrangement) return [...slides];
  const removed = new Set(arrangement.removed);
  const kept = slides.filter((s) => !removed.has(s.key));
  const byKey = new Map(kept.map((s) => [s.key, s]));
  const ordered = arrangement.order.flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : []));
  const placed = new Set(ordered.map((s) => s.key));
  const out = [...ordered];
  kept.forEach((s, i) => {
    if (placed.has(s.key)) return;
    // After the nearest earlier slide that is already placed, else first.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.findIndex((o) => o.key === kept[j]!.key);
      if (idx >= 0) {
        at = idx + 1;
        break;
      }
    }
    out.splice(at, 0, s);
    placed.add(s.key);
  });
  return out;
}

/** A stored carousel slide, as `mapCarouselSlides` reads it. */
export type StoredSetSlide = { id: string; label?: string; input: Input; pageId?: string };

/**
 * Slides by slide: a queued carousel's stored slides, each drawn by the page
 * its `pageId` names, else the page of its slot. A slide no page can draw
 * (a set without a day page, say) is left out and reported.
 */
export function mapCarouselSlides(
  doc: SetDocument,
  slides: readonly StoredSetSlide[],
  ctx: { sponsors?: Input["sponsors"] } = {},
): { slides: SetSlide[]; undrawn: string[] } {
  const items = slides.filter((s) => isRepeatSlot(carouselSlideSlot(s.input))).map((s) => s.input);
  const out: SetSlide[] = [];
  const undrawn: string[] = [];
  const counts = new Map<string, number>();
  const cover = slides.find((s) => carouselSlideSlot(s.input) === "cover") ?? slides[0];
  for (const s of slides) {
    const slot = carouselSlideSlot(s.input);
    const page =
      (s.pageId ? doc.pages.find((p) => p.id === s.pageId) : undefined) ?? pageForSlot(doc, slot);
    if (!page) {
      undrawn.push(s.id);
      continue;
    }
    const n = (counts.get(page.id) ?? 0) + 1;
    counts.set(page.id, n);
    // A design page (no data of its own) draws with the cover's input.
    const source = page.slot === "page" && slot === "page" && cover ? cover.input : s.input;
    out.push({
      key: s.id,
      page,
      input: slideInputFor(page, source, { items, sponsors: ctx.sponsors }),
      label: s.label ?? setPageLabel(page),
      ...(page.role === "repeat" ? { item: n } : {}),
    });
  }
  return { slides: out, undrawn };
}

/** What draws a slide: its page as a kind document, and the slide's input. */
export function setSlideRender(
  doc: SetDocument,
  slide: Pick<SetSlide, "page" | "input">,
): { document: TemplateDocumentV2; input: Input } {
  return { document: setPageRenderDocument(doc, slide.page), input: slide.input };
}

/** The set type's label, for a set's name. */
export function setLabel(doc: Pick<SetDocument, "set">): string {
  return SET_TYPE_LABELS[doc.set];
}
