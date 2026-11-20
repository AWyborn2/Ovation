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
import { useMemo } from "react";
import {
  getListClubPhotosQueryKey,
  useListClubPhotos,
  type ClubPhoto,
} from "@workspace/api-client-react";
import {
  isJuniorPlayerPhotoUrl,
  juniorSafeDesignWith,
  photoKey,
  withoutPhotos,
  type JuniorPhotoRule,
} from "@workspace/scorecard/junior-design-photos";
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

/** A raster data URL, or a web address of a raster image. */
const RASTER_IMAGE =
  /^(data:image\/(?!svg\+xml)|https?:\/\/\S+\.(png|jpe?g|webp|gif|heic|heif|avif)([?#]|$))/i;

/** An image layer's content it may keep on a junior page: a token or vector art. */
const keepsImage = (content: unknown) =>
  typeof content !== "string" ||
  content.trim() === "" ||
  /^\{\{[^}]+\}\}$/.test(content.trim()) ||
  /^data:image\/svg\+xml/i.test(content.trim());

/**
 * A page copied into a junior set from another template ("Add a page → From
 * another template", retest 6, item K), fail-closed (ADR-007): every stored
 * or raster image the template held goes (a library photo, a club upload, a
 * junior player's photo), and a photo layer loses its source (a team list
 * player or a collection), so it shows only the set's own photo (approved
 * junior stock) or none. Tokens (`{{clubLogo}}`, `{{sponsor1}}`) and vector
 * art stay. The server applies its own rule again on save and on post.
 */
export function juniorSafeAddedLayers<L>(layers: L[]): L[] {
  const isBad = (url: string) =>
    url.includes("/objects/") || isJuniorPlayerPhotoUrl(url) || RASTER_IMAGE.test(url.trim());
  const { value } = withoutPhotos(layers, isBad);
  const strip = (list: unknown[]): unknown[] =>
    list.flatMap((l) => {
      if (!l || typeof l !== "object") return [l];
      const layer = l as Record<string, unknown>;
      // An image layer showing anything but a token or vector art goes whole.
      if (layer.kind === "image" && !keepsImage(layer.content)) return [];
      const { source: _source, ...rest } = layer;
      const out = layer.kind === "photo" ? rest : layer;
      return [Array.isArray(layer.children) ? { ...out, children: strip(layer.children) } : out];
    });
  return strip((value as unknown[] | null) ?? []) as L[];
}

/** A draft as the guard reads it. */
type GuardDraft = {
  sourceMatchIsJunior?: boolean | null;
  cardInput: unknown;
  photoUrl?: string | null;
  adjustments?: unknown;
};

/**
 * Draw a junior card or junior set only with photos it may show (ADR-007):
 * a club library photo held in its design (a template's image layer, an image
 * override, a page background) is dropped unless it is approved junior stock;
 * the same rule the server applies on save and on post
 * (`@workspace/scorecard/junior-design-photos`). Fails closed: until the
 * club's photos have loaded (or if they can't), no library photo is drawn.
 * `ready` says the list is in, for an editor that opens a design once.
 */
export function useJuniorPhotoGuard() {
  const photosQ = useListClubPhotos(undefined, {
    query: { queryKey: getListClubPhotosQueryKey(), staleTime: 60_000 },
  });
  const photos = Array.isArray(photosQ.data) ? photosQ.data : [];
  const rule = useMemo<JuniorPhotoRule>(() => {
    const keys = (p: ClubPhoto) => [photoKey(p.url), photoKey(p.thumbUrl)];
    return {
      approved: new Set(juniorStockOnly(photos).flatMap(keys)),
      library: new Set(photos.flatMap(keys)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `photos` follows the query's data
  }, [photosQ.data]);
  return useMemo(() => {
    const safeDesign = <D>(draft: GuardDraft, design: D): D =>
      juniorSafeDesignWith(draft, design, rule).design as D;
    const safeDraft = <T extends GuardDraft>(draft: T): T => {
      const safe = juniorSafeDesignWith(draft, draft.adjustments, rule);
      return safe.removed ? { ...draft, adjustments: safe.design } : draft;
    };
    // The approved junior stock by id: the only photos a junior slide's own
    // photo ("Change photo") draws with. Empty until the list is in (fails closed).
    const juniorStock: ReadonlySet<number> = new Set(juniorStockOnly(photos).map((p) => p.id));
    return { ready: photosQ.isSuccess || photosQ.isError, safeDesign, safeDraft, juniorStock };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `photos` follows the query's data
  }, [rule, photosQ.isSuccess, photosQ.isError, photosQ.data]);
}
