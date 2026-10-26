/**
 * The pages each card kind's template has (ADR-011 §1, T1.3), primary first.
 *
 * - Match Day: `fixture` (the single Match Day card), `title`, `day` (the
 *   junior day slide) and `sponsors`.
 * - Match Summary: `result` and `day`. The Results set uses this template too:
 *   its projection drops the top performers, and their layers drop out.
 * - Team List: `team`.
 * - Every other kind: `card`.
 *
 * The bookend rule: every carousel set opens with a title page and closes
 * with a sponsors page, and a Results, Match Summary or Team List set takes
 * both from the Match Day template of the same look (else the club's default
 * Match Day template; L3-B resolves which). Pages from different templates
 * are never mixed otherwise.
 */
import type { PageKey } from "./format";

/** Kinds whose template has more than the single `card` page. */
const KIND_PAGES: Readonly<Record<string, readonly PageKey[]>> = {
  matchDay: ["fixture", "title", "day", "sponsors"],
  matchSummary: ["result", "day"],
  teamList: ["team"],
};

/**
 * The template kind a card kind draws with. The Results content kind (and
 * set) is drawn with the Match Summary template.
 */
export function templateKindFor(kind: string): string {
  return kind === "results" ? "matchSummary" : kind;
}

/** A kind's pages, primary first. */
export function kindPages(kind: string): readonly PageKey[] {
  return KIND_PAGES[templateKindFor(kind)] ?? ["card"];
}

/** The page a kind's single card is: where a v1 document's layers live. */
export function primaryPage(kind: string): PageKey {
  return kindPages(kind)[0] ?? "card";
}

/** Whether `page` is one of `kind`'s pages. */
export function kindHasPage(kind: string, page: string): page is PageKey {
  return (kindPages(kind) as readonly string[]).includes(page);
}

/** The pages a carousel set takes from the Match Day template rather than its own. */
export const BOOKEND_PAGES = ["title", "sponsors"] as const satisfies readonly PageKey[];
export type BookendPage = (typeof BOOKEND_PAGES)[number];

/** The kind whose template supplies every set's bookends. */
export const BOOKEND_KIND = "matchDay";

export function isBookendPage(page: string): page is BookendPage {
  return (BOOKEND_PAGES as readonly string[]).includes(page);
}

/**
 * Which template kind and page draw a slide of a carousel set: a bookend
 * (title or sponsors) comes from the Match Day template, every other page
 * from the set's own template. Null when the set's template has no such page.
 */
export function carouselPageSource(
  setKind: string,
  page: string,
): { kind: string; page: PageKey; bookend: boolean } | null {
  if (isBookendPage(page)) return { kind: BOOKEND_KIND, page, bookend: true };
  const kind = templateKindFor(setKind);
  return kindHasPage(kind, page) ? { kind, page, bookend: false } : null;
}

/**
 * The page a card input is: a carousel title or sponsors page
 * (`carouselPage.page`), a junior day slide (`carouselDay`), else the kind's
 * primary page. Rendering selects pages with it from L1-C (T1.12); until
 * then every render draws the primary page, as v1 always did.
 */
export function pageForInput(input: {
  kind: string;
  carouselPage?: { page?: unknown } | null;
  carouselDay?: unknown;
}): PageKey {
  const kind = templateKindFor(input.kind);
  const page = input.carouselPage?.page;
  if (kind === "matchDay" && (page === "title" || page === "sponsors")) return page;
  if (input.carouselDay && kindHasPage(kind, "day")) return "day";
  return primaryPage(kind);
}
