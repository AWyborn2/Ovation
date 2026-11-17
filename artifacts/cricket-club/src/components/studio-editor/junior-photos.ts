/**
 * Which photos a page in the editor may show (ADR-007, #638, studio retest
 * 17 Nov 2026), so every photo control offers only what will be drawn:
 *
 * - `senior`: any club photo (a senior card, or a template being designed).
 * - `juniorCard`: a junior card or junior slide. It shows a photo only when the
 *   server has cleared that player's photo (`juniorPhotoAllowed`); otherwise
 *   none. No library photo, collection or team list player reaches it.
 * - `juniorSetPage`: a junior set's cover, sponsors or design page. It shows
 *   only one of the club's approved junior stock images, never a library photo.
 *
 * The server enforces the same rule on save and on post; this only keeps the
 * editor honest about it.
 */
import type { ClubPhoto } from "@workspace/api-client-react";
import { eligibleJuniorStockPhotos } from "@/components/weekend-carousel/model";

export type PhotoRule = "senior" | "juniorCard" | "juniorSetPage";

type RuleSlide = { junior: boolean; design: boolean; page: { role: string } };

/**
 * The rule for the page on show. `slide` and `slides` are a set draft's (the
 * slide on show and every slide); `input` is a single card's input.
 */
export function photoRuleFor(ctx: {
  slide?: RuleSlide | null;
  slides?: readonly RuleSlide[];
  input?: { junior?: unknown } | null;
}): PhotoRule {
  if (ctx.slide?.junior || ctx.input?.junior === true) return "juniorCard";
  const slides = ctx.slides ?? [];
  // A junior set: a junior slide and no senior game (the server's isJuniorCarousel).
  const seniorGame = slides.some((s) => !s.junior && !s.design && s.page.role === "repeat");
  if (slides.some((s) => s.junior) && !seniorGame) return "juniorSetPage";
  return "senior";
}

export const isJuniorRule = (rule: PhotoRule) => rule !== "senior";

/** What a page's photo shows, in the editor's words. */
export const PHOTO_RULE_NOTE: Record<PhotoRule, string> = {
  senior:
    "Junior cards show a photo only when the club has cleared it: a consented player's photo, or an approved junior stock image on a junior set's cover and sponsors page. Otherwise the photo stays empty.",
  juniorCard:
    "This is a junior card: the photo shows only when the club has cleared this player's photo. Otherwise it stays empty. Club library photos never show here.",
  juniorSetPage:
    "This is a junior set: its cover and sponsors page show only the club's approved junior stock images, never other library photos.",
};

/** The photos a junior page may be given: the club's approved junior stock. */
export const juniorStockOnly = (photos: ClubPhoto[]): ClubPhoto[] =>
  eligibleJuniorStockPhotos(photos);
