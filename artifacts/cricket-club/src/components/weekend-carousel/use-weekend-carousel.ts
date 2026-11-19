import { useEffect, useMemo, useRef, useState } from "react";
import { clampSponsorsPerSlide } from "@workspace/scorecard/kind-templates";
import { sponsorOnClubPage } from "@workspace/scorecard/card-content";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWeekendCarouselSources,
  getGetWeekendCarouselSourcesQueryKey,
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  useCreateSocialDraft,
  getListSocialDraftsQueryKey,
  getGetPendingSocialDraftCountQueryKey,
  type Fixture,
  type ClubPhoto,
  type WeekendCarouselSources,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import type { CardSize } from "@/lib/share-card";
import { BLANK_PACK_ID, type CardAdjustments } from "@/lib/pack-render";
import { CAROUSEL_LABELS, type CarouselSetType } from "@workspace/scorecard/queued-carousel";
import type { PickedTemplate } from "@/components/template-library/template-picker";
import { useCarouselAssembly, useCarouselTemplate } from "./template-choice";
import {
  CLUB_TIME_ZONE,
  weekendRange,
  rangeForSet,
  refreshTeamSlides,
  carouselSelectionKey,
  buildWeekendSlides,
  moveTeam,
  eligibleCoverPhotos,
  eligibleJuniorStockPhotos,
  eligibleCarouselPhotos,
  COVER_PHOTO_UNAVAILABLE,
  filterCarouselFixtures,
  carouselSourceContent,
  queuedSlide,
  teamIsJunior,
  photoOverride,
  type CarouselAudience,
  type CoverPhoto,
  type PhotoPicks,
  type TeamSlide,
  type WeekendSlide,
} from "./model";
import { carouselCaption } from "./caption";
import { dayCapacity } from "@/lib/pack-templates/content-layouts";
import {
  MATCH_DAY_DATA_FIELDS,
  readCardContentSettings,
  readContentOverride,
  resolveVisibleFields,
  shortDateRange,
  DEFAULT_TEAM_LIST_ORDER,
  type ContentOverride,
  type TeamListOrder,
} from "@workspace/scorecard/card-content";

export const WEEKEND_PACK_ID = "club-kit-v1";

/**
 * The most teams or matches one carousel holds: with its cover and sponsors
 * page, 20 slides (a set's page limit; Meta posts at most 10 per post).
 */
export const MAX_CAROUSEL_GAMES = 18;

type Pick = { id: number; included: boolean };

/**
 * How a rounds pick (Create's Season and Round picker) treats the games when its
 * dates or games change: each game the admin has already seen keeps its tick, and
 * a game seen for the first time comes in ticked (a round just picked) or unticked
 * (the extra games "Use dates instead" brings into view). Null: a new range or set
 * type, which ticks every game.
 */
export type KeepPicks = "ticked" | "unticked" | null;

/**
 * The picks for the games now in range (round 9 retest, A5).
 *  - `keep` set (a rounds pick): games in `remembered` keep their tick, in the
 *    order last shown; others come in as `keep` says, but an automatic tick
 *    never goes past MAX_CAROUSEL_GAMES (the admin's own ticks count first).
 *  - a new scope (or no picks yet): every game ticked, as the Weekend Carousel
 *    page always has (it shows the limit rather than drop any).
 *  - the same scope refreshed: picks kept, new games unticked.
 */
export function nextPicks(
  previous: readonly Pick[],
  ids: readonly number[],
  o: {
    reset: boolean;
    keep: KeepPicks;
    remembered: ReadonlyMap<number, boolean>;
    order: readonly number[];
  },
): Pick[] {
  const inRange = new Set(ids);
  if (o.keep) {
    const ordered = [...new Set([...o.order.filter((id) => inRange.has(id)), ...ids])];
    let ticked = ordered.filter((id) => o.remembered.get(id) === true).length;
    const auto = () => o.keep === "ticked" && ticked < MAX_CAROUSEL_GAMES && ++ticked > 0;
    return ordered.map((id) => ({ id, included: o.remembered.get(id) ?? auto() }));
  }
  if (o.reset || !previous.length) return ids.map((id) => ({ id, included: true }));
  return [
    ...previous.filter((p) => inRange.has(p.id)),
    ...ids
      .filter((id) => !previous.some((p) => p.id === id))
      .map((id) => ({ id, included: false })),
  ];
}
type Generated = {
  key: string;
  from: string;
  to: string;
  pickIds: number[];
  teams: TeamSlide[];
  /** Match Day: the server's automatic cover photo, frozen at generate (ADR-010 P4). */
  autoCoverId?: number | null;
};

/** Swap-move an item in a plain array (used for the pre-generation pick order). */
function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const next = [...arr];
  const [m] = next.splice(from, 1);
  next.splice(to, 0, m);
  return next;
}

/**
 * Pack renderer only honours zoom via adjustments; mirror the slide's own
 * photoTransform for the active size so preview and still render match.
 */
export function slideAdjustments(slide: WeekendSlide, size: CardSize): CardAdjustments | null {
  const t = (
    slide.data as { photoTransform?: { focalX: number; focalY: number; zoom?: number } | null }
  ).photoTransform;
  if (!t) return null;
  return { photo: { [size]: { focalX: t.focalX, focalY: t.focalY, zoom: t.zoom ?? 1 } } };
}

/**
 * State for the weekend match-day composer: date range, fixture
 * picks/order, a frozen generated set (photo choices fixed at generate time),
 * per-team photo/crop edits and caption. Sending to review saves a frozen set.
 */
export function useWeekendCarousel(
  initialType: CarouselSetType = "matchDay",
  initialAudience: CarouselAudience = "all",
) {
  const [setType, setSetType] = useState<CarouselSetType>(initialType);
  const [audience, setAudience] = useState<CarouselAudience>(initialAudience);
  const initial = useMemo(
    () =>
      initialType === "matchDay"
        ? weekendRange(new Date(), CLUB_TIME_ZONE)
        : rangeForSet(initialType),
    [initialType],
  );
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const rangeValid = !!from && !!to && from <= to;
  // A rounds pick (Create's Season and Round picker): only these games, within the
  // dates. Null loads every game in the dates; empty (no round ticked) loads none.
  const [onlyIds, setOnlyIds] = useState<number[] | null>(null);
  const idsParam = onlyIds?.length ? [...onlyIds].sort((a, b) => a - b).join(",") : undefined;
  const noneWanted = onlyIds !== null && onlyIds.length === 0;

  const settingsQ = useGetSocialSettings({
    query: { queryKey: getGetSocialSettingsQueryKey() },
  });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  // What the slides show: the club's content choices, then this carousel's override.
  const clubContent = readCardContentSettings(bundle?.settings.cardContent).matchDay;
  const [contentOverride, setContentOverride] = useState<ContentOverride>({});
  // This carousel's own sponsors per slide; null follows the club's default.
  const [perSlideOverride, setPerSlideOverride] = useState<number | null>(null);
  const visibleFields = useMemo(
    () => resolveVisibleFields("matchDay", clubContent, contentOverride),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(clubContent), contentOverride],
  );
  const clubSponsorsPerSlide = clampSponsorsPerSlide(bundle?.settings.sponsorsPerSlide);
  const sponsorsPerSlide = perSlideOverride ?? clubSponsorsPerSlide;
  // The sponsors the sponsors page shows: other team sponsors only while their
  // field is on; the presenting and major sponsors always.
  const pageSponsorCount = (bundle?.settings.sponsorsEnabled ? bundle.activeSponsors : []).filter(
    (sp) =>
      sponsorOnClubPage(
        {
          teamSponsor: (sp.grades ?? []).some((g) => g.trim()),
          tier: sp.tier,
          presenting: sp.isPresenting,
        },
        visibleFields.has("sponsors.teamSponsors"),
      ),
  ).length;
  // Results, match summary and team list slides (P7) show their own kind's fields.
  const setKind = setType === "matchDay" ? null : setType;
  const kindContent = setKind
    ? readCardContentSettings(bundle?.settings.cardContent)[setKind]
    : null;
  // This carousel's own Minimal / Standard / Full for a results, match summary or team
  // list set (New Studio's look step); empty follows the club's setting for the kind.
  // The slides carry the fields they show, so nothing else stores it.
  const [kindOverride, setKindOverride] = useState<ContentOverride>({});
  // Team list slides' player order (build decision 16): the club's default for
  // every Team List, or this carousel's own; null follows the club's.
  const clubPlayerOrder: TeamListOrder =
    readCardContentSettings(bundle?.settings.cardContent).teamList.playerOrder ??
    DEFAULT_TEAM_LIST_ORDER;
  const [orderOverride, setOrderOverride] = useState<TeamListOrder | null>(null);
  const playerOrder = setType === "teamList" ? (orderOverride ?? clubPlayerOrder) : undefined;
  const kindVisible = useMemo(
    () => (setKind ? resolveVisibleFields(setKind, kindContent, kindOverride) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setKind, JSON.stringify(kindContent), kindOverride],
  );
  // The optional data fields shown (P5): the server loads only these.
  const dataFields =
    setType === "matchDay"
      ? MATCH_DAY_DATA_FIELDS.filter((f) => visibleFields.has(f)).join(",")
      : "";
  // Server scopes tenant/grade/categories, live cancellation status and the
  // date range (including already-started games) — no client re-filtering.
  const params = {
    from,
    to,
    setType,
    audience,
    ...(dataFields ? { fields: dataFields } : {}),
    ...(idsParam ? { ids: idsParam } : {}),
  };
  const sourcesQ = useGetWeekendCarouselSources(params, {
    query: {
      queryKey: getGetWeekendCarouselSourcesQueryKey(params),
      enabled: rangeValid && !noneWanted,
    },
  });
  const sources = sourcesQ.data as WeekendCarouselSources | undefined;
  // Match Day content (ADR-010) and other kinds' card inputs, per fixture id.
  const content = useMemo(() => carouselSourceContent(sources), [sources]);
  const createDraft = useCreateSocialDraft();
  const qc = useQueryClient();
  const submission = useRef<{ key: string; id: string } | null>(null);
  const submitting = useRef(false);
  const generatingRef = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const busy = exporting || generating;

  const fixtures = useMemo(
    () => filterCarouselFixtures((sources?.fixtures ?? []) as Fixture[], content, audience),
    [sources, content, audience],
  );
  const photos = useMemo(
    () => [...(sources?.photos ?? []), ...(sources?.juniorStockPhotos ?? [])] as ClubPhoto[],
    [sources],
  );
  const juniorStockPhotos = eligibleJuniorStockPhotos(photos);
  // A junior carousel's cover is the club's approved junior stock only (ADR-007).
  const coverPhotos = useMemo(
    () =>
      audience === "junior"
        ? eligibleJuniorStockPhotos((sources?.juniorStockPhotos ?? []) as ClubPhoto[])
        : eligibleCoverPhotos([
            ...(sources?.coverPhotos ?? []),
            ...(sources?.juniorStockPhotos ?? []),
          ]),
    [sources, audience],
  );
  const sourceWarnings = sources?.warnings ?? [];
  const timeZone = sources?.timeZone ?? CLUB_TIME_ZONE;

  const [title, setTitle] = useState(CAROUSEL_LABELS[initialType]);
  const [captionEdit, setCaptionEdit] = useState<string | null>(null);
  const [queued, setQueued] = useState<{ key: string; id: number } | null>(null);
  // A new carousel starts at Portrait (portrait and story sizes plan, Stage 3).
  const [size, setSize] = useState<CardSize>("portrait");
  // The template the set is drawn with (ADR-011 T5.17): the picker preselects the
  // club's default for the set's kind, and a new kind starts from its default again.
  const { templateKind, picked, setPicked, dayRowsCapacity } = useCarouselTemplate(setType, size);
  // Junior same-day slides (ADR-010 P3): the club's switch, split at the day page's
  // list capacity for this template and size (else the built-in layout's, by preset).
  const grouping = useMemo(
    () => ({
      setType,
      consolidateByDay: clubContent.juniorConsolidateByDay,
      capacity:
        dayRowsCapacity ??
        dayCapacity(
          WEEKEND_PACK_ID,
          setType,
          size,
          kindOverride.preset ??
            kindContent?.preset ??
            contentOverride.preset ??
            clubContent.preset,
        ),
    }),
    [
      setType,
      clubContent.juniorConsolidateByDay,
      clubContent.preset,
      kindContent?.preset,
      kindOverride.preset,
      dayRowsCapacity,
      size,
      contentOverride,
    ],
  );
  const [coverChoice, setCover] = useState<CoverPhoto>({
    photoId: null,
    transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
  });
  // Whether the admin chose the cover photo; until then a Match Day set shows the auto pick.
  const [coverSwapped, setCoverSwapped] = useState(false);

  const inRange = rangeValid && !noneWanted ? fixtures : [];
  const inRangeSig = `${setType}:` + inRange.map((f) => f.id).join(",");

  // New ranges/types select all; a source refresh preserves valid user picks; a
  // rounds pick keeps every tick the admin made, up to the maximum (nextPicks).
  const [picks, setPicks] = useState<Pick[]>([]);
  const [keepPicks, setKeepPicks] = useState<KeepPicks>(null);
  const pickScope = useRef("");
  // Each game's last tick and the order last shown, kept while sources reload.
  const remembered = useRef(new Map<number, boolean>());
  const lastOrder = useRef<number[]>([]);
  const scope = JSON.stringify([setType, from, to, audience, idsParam ?? null]);
  useEffect(() => {
    const reset = pickScope.current !== scope;
    pickScope.current = scope;
    const ids = inRange.map((f) => f.id);
    setPicks((previous) =>
      nextPicks(previous, ids, {
        reset,
        keep: keepPicks,
        remembered: remembered.current,
        order: lastOrder.current,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRangeSig, scope]);
  useEffect(() => {
    // Outside a rounds pick only the picks on screen are remembered.
    if (!keepPicks) remembered.current.clear();
    for (const p of picks) remembered.current.set(p.id, p.included);
    if (picks.length) lastOrder.current = picks.map((p) => p.id);
  }, [picks, keepPicks]);

  const byId = useMemo(() => new Map(fixtures.map((f) => [f.id, f])), [fixtures]);
  const orderedPicks = picks
    .map((p) => ({ ...p, fixture: byId.get(p.id) }))
    .filter((p): p is Pick & { fixture: Fixture } => !!p.fixture);
  const selected = orderedPicks.filter((p) => p.included).map((p) => p.fixture);

  const selectionKey = carouselSelectionKey(setType, from, to, selected, content);

  const [generated, setGenerated] = useState<Generated | null>(null);
  const stale = !!generated && (generated.key !== selectionKey || !!generationError);

  const autoCoverId = generated?.autoCoverId;
  const cover: CoverPhoto = useMemo(
    () =>
      coverSwapped || autoCoverId === undefined
        ? coverChoice
        : { ...coverChoice, photoId: autoCoverId },
    [coverSwapped, autoCoverId, coverChoice],
  );
  const coverUnavailable =
    cover.photoId !== null && !coverPhotos.some((p) => p.id === cover.photoId);

  const generate = async () => {
    if (
      busy ||
      generatingRef.current ||
      !rangeValid ||
      selected.length === 0 ||
      selected.length > MAX_CAROUSEL_GAMES
    )
      return;
    generatingRef.current = true;
    setGenerating(true);
    setGenerationError(null);
    setQueueError(null);
    try {
      // Always re-read: another admin's edits need not invalidate this tab's cache.
      const [fresh, settings] = await Promise.all([sourcesQ.refetch(), settingsQ.refetch()]);
      if (fresh.isError || !fresh.data || settings.isError || !settings.data) {
        throw new Error(
          "Could not refresh carousel sources or settings. Retry generating the preview.",
        );
      }
      const freshById = new Map(fresh.data.fixtures.map((f) => [f.id, f]));
      // Match Day starts on the server's automatic photos (ADR-010 P4).
      const picks: PhotoPicks | null =
        setType === "matchDay" ? (fresh.data.photoPicks ?? null) : null;
      const freshCovers = eligibleCoverPhotos([
        ...(fresh.data.coverPhotos ?? []),
        ...(fresh.data.juniorStockPhotos ?? []),
      ]);
      const coverOk = (id: number | null | undefined) =>
        id != null && freshCovers.some((p) => p.id === id);
      const freshContent = carouselSourceContent(fresh.data);
      const freshSelected = selected.map((f) => freshById.get(f.id));
      // Every slide comes from the server's content now, Match Day included.
      if (freshSelected.some((f) => !f || !freshContent[f.id])) {
        throw new Error(
          "A selected team list or match is no longer available. Check your selection and regenerate.",
        );
      }
      const current = freshSelected as Fixture[];
      const pickIds = current.map((f) => f.id);
      const oldIds = generated?.pickIds ?? [];
      // Respect explicit changes in the pick order; otherwise retain slide edits.
      const preserveOrder =
        JSON.stringify(oldIds.filter((id) => pickIds.includes(id))) ===
        JSON.stringify(pickIds.filter((id) => oldIds.includes(id)));
      setGenerated({
        key: carouselSelectionKey(setType, from, to, current, freshContent),
        from,
        to,
        pickIds,
        teams: refreshTeamSlides(
          current,
          [...fresh.data.photos, ...(fresh.data.juniorStockPhotos ?? [])],
          freshContent,
          generated?.teams,
          preserveOrder,
          picks,
        ),
        // A regenerate keeps the cover it showed while that photo is still allowed.
        ...(picks
          ? {
              autoCoverId: coverOk(generated?.autoCoverId)
                ? generated!.autoCoverId
                : coverOk(picks.cover)
                  ? picks.cover
                  : null,
            }
          : {}),
      });
    } catch (e) {
      setGenerationError(
        e instanceof Error
          ? e.message
          : "Could not refresh carousel sources. Retry generating the preview.",
      );
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  const slides: WeekendSlide[] = useMemo(() => {
    if (!generated || !bundle) return [];
    return buildWeekendSlides(
      generated.teams,
      photos,
      bundle,
      title.trim() || CAROUSEL_LABELS[setType],
      generated.from,
      generated.to,
      CLUB_TIME_ZONE,
      { selection: cover, photos: coverPhotos },
      visibleFields,
      sources?.sponsorsPage,
      grouping,
      kindVisible,
      sponsorsPerSlide,
      playerOrder,
    );
  }, [
    generated,
    photos,
    bundle,
    title,
    cover,
    coverPhotos,
    setType,
    visibleFields,
    sources,
    grouping,
    kindVisible,
    sponsorsPerSlide,
    playerOrder,
  ]);

  const [queueError, setQueueError] = useState<string | null>(null);
  const caption =
    captionEdit ??
    carouselCaption(
      setType,
      generated?.teams ?? [],
      title,
      bundle?.settings.clubHashtag,
      playerOrder,
    );
  const assembly = useCarouselAssembly(setType, slides, picked, size);
  const queueKey = JSON.stringify([slides, size, caption, picked?.ref ?? null, perSlideOverride]);
  const queuedId = queued?.key === queueKey ? queued.id : null;

  const togglePick = (id: number) =>
    !busy && setPicks((ps) => ps.map((p) => (p.id === id ? { ...p, included: !p.included } : p)));
  const movePick = (index: number, dir: -1 | 1) =>
    !busy && setPicks((ps) => move(ps, index, index + dir));
  const setAll = (included: boolean) =>
    !busy && setPicks((ps) => ps.map((p) => ({ ...p, included })));

  const patchTeam = (index: number, patch: Partial<TeamSlide>) =>
    !busy &&
    setGenerated((g) =>
      g ? { ...g, teams: g.teams.map((t, i) => (i === index ? { ...t, ...patch } : t)) } : g,
    );
  const moveTeamAt = (index: number, dir: -1 | 1) => {
    if (busy) return;
    setGenerated((g) => {
      if (!g) return g;
      const target = index + dir;
      if (target < 0 || target >= g.teams.length) return g;
      return { ...g, teams: moveTeam(g.teams, index, target) };
    });
  };

  const canQueue =
    !!generated &&
    !stale &&
    slides.length >= 3 &&
    slides.length <= 20 &&
    !!caption.trim() &&
    caption.length <= 5000 &&
    !queuedId &&
    !busy &&
    !coverUnavailable &&
    picked !== null &&
    !assembly.error &&
    !sourcesQ.isError &&
    !settingsQ.isError &&
    !sourcesQ.isFetching &&
    !settingsQ.isFetching;
  const runQueue = async () => {
    if (!canQueue || submitting.current) return;
    submitting.current = true;
    setExporting(true);
    setQueueError(null);
    try {
      // A second admin may have removed or retagged the photo since preview.
      // Rebuild from fresh server-approved URLs, never silently replace the pick.
      let queuedSlides = slides;
      if (
        cover.photoId !== null ||
        setType !== "matchDay" ||
        generated!.teams.some((t) => t.photoId !== null) ||
        // The sponsors page background may have been removed since preview (P6).
        (visibleFields.has("sponsors.background") && !!sources?.sponsorsPage?.backgroundPhoto)
      ) {
        const fresh = await sourcesQ.refetch();
        if (fresh.isError || !fresh.data)
          throw new Error("Could not verify source data. Retry before sending to review.");
        if (
          setType !== "matchDay" &&
          generated!.teams.some(
            (t) => JSON.stringify(fresh.data.content?.[t.fixture.id]) !== JSON.stringify(t.content),
          )
        ) {
          throw new Error(
            "A selected team list or scorecard changed or is no longer available. Regenerate the preview before sending to review.",
          );
        }
        const allowed = eligibleCoverPhotos([
          ...(fresh.data.coverPhotos ?? []),
          ...(fresh.data.juniorStockPhotos ?? []),
        ]);
        if (cover.photoId !== null && !allowed.some((p) => p.id === cover.photoId))
          throw new Error(COVER_PHOTO_UNAVAILABLE);
        const freshPhotos = [...fresh.data.photos, ...(fresh.data.juniorStockPhotos ?? [])];
        if (
          generated!.teams.some(
            (t) =>
              t.photoId !== null &&
              !eligibleCarouselPhotos(freshPhotos, t.fixture.grade, teamIsJunior(t)).some(
                (p) => p.id === t.photoId,
              ),
          )
        ) {
          throw new Error(
            "A selected team photo is no longer available. Choose another photo and regenerate.",
          );
        }
        queuedSlides = buildWeekendSlides(
          generated!.teams,
          freshPhotos,
          bundle!,
          title.trim() || CAROUSEL_LABELS[setType],
          generated!.from,
          generated!.to,
          CLUB_TIME_ZONE,
          { selection: cover, photos: allowed },
          visibleFields,
          fresh.data.sponsorsPage,
          grouping,
          kindVisible,
          sponsorsPerSlide,
          playerOrder,
        );
      }
      // Swapped photos ride in the content override (ADR-010 P4).
      const override = readContentOverride("matchDay", {
        ...contentOverride,
        photos:
          setType === "matchDay"
            ? photoOverride(generated!.teams, { photoId: cover.photoId, autoPhotoId: autoCoverId })
            : undefined,
      });
      if (submission.current?.key !== queueKey) {
        submission.current = { key: queueKey, id: crypto.randomUUID() };
      }
      const draft = await createDraft.mutateAsync({
        data: {
          caption: caption.trim(),
          cardInput: {
            kind: "matchDay",
            headline: `${title.trim() || CAROUSEL_LABELS[setType]} carousel`,
            // The set's name in the queue and the set editor: "13–22 Nov".
            roundLabel: shortDateRange(generated!.from, generated!.to),
            // Version 3 (ADR-011): drawn with a template, never a pack; the server
            // assembles and stores the document. Slides keep their content snapshot.
            weekendCarousel: {
              version: 3,
              templateRef: picked!.ref,
              setType,
              submissionId: submission.current.id,
              size,
              ...(override ? { contentOverride: override } : {}),
              // Stored only when this set changed it from the club's default.
              ...(perSlideOverride !== null ? { sponsorsPerSlide } : {}),
              slides: queuedSlides.map(queuedSlide),
            },
          },
        },
      });
      setQueued({ key: queueKey, id: draft.id });
      qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetPendingSocialDraftCountQueryKey() });
    } catch (e) {
      setQueueError(
        e instanceof Error ? e.message : "Could not send the carousel to review. Please retry.",
      );
    } finally {
      submitting.current = false;
      setExporting(false);
    }
  };

  const loading = (rangeValid && sourcesQ.isLoading) || settingsQ.isLoading;
  const error = sourcesQ.isError || settingsQ.isError;
  const retry = () => {
    if (sourcesQ.isError) sourcesQ.refetch();
    if (settingsQ.isError) settingsQ.refetch();
  };

  return {
    // Team list player order: this carousel's (an override of the club's default).
    playerOrder: playerOrder ?? DEFAULT_TEAM_LIST_ORDER,
    clubPlayerOrder,
    playerOrderChanged: orderOverride !== null,
    setPlayerOrder: (order: TeamListOrder | null) =>
      !busy && setOrderOverride(order === null || order === clubPlayerOrder ? null : order),
    // Sponsors per slide: this carousel's (an override of the club's default).
    sponsorsPerSlide,
    clubSponsorsPerSlide,
    sponsorsPerSlideChanged: perSlideOverride !== null,
    setSponsorsPerSlide: (n: number | null) =>
      !busy && setPerSlideOverride(n === null || n === clubSponsorsPerSlide ? null : n),
    pageSponsorCount,
    setType,
    audience,
    setAudience: (value: CarouselAudience) => !busy && setAudience(value),
    setTypeLabel: CAROUSEL_LABELS[setType],
    changeType: (type: CarouselSetType) => {
      if (busy) return;
      setSetType(type);
      const range =
        type === "matchDay" ? weekendRange(new Date(), CLUB_TIME_ZONE) : rangeForSet(type);
      setFrom(range.from);
      setTo(range.to);
      setOnlyIds(null);
      setKeepPicks(null);
      setTitle(CAROUSEL_LABELS[type]);
      setCaptionEdit(null);
      // A carousel's content override belongs to the Match Day set it was made on.
      setContentOverride({});
      setKindOverride({});
      setOrderOverride(null);
      setCoverSwapped(false);
      setGenerated(null);
      setGenerationError(null);
      setQueueError(null);
    },
    loading,
    error,
    retry,
    photos,
    juniorStockPhotos,
    reloadPhotos: async () => {
      await sourcesQ.refetch();
    },
    coverPhotos,
    cover,
    coverUnavailable,
    autoCoverId,
    coverSwapped: autoCoverId !== undefined && cover.photoId !== autoCoverId,
    patchCover: (patch: Partial<CoverPhoto>) => {
      if (busy) return;
      if (patch.photoId !== undefined) setCoverSwapped(true);
      setCover((c) => ({ ...c, photoId: cover.photoId, ...patch }));
    },
    /** Back to the automatic cover photo. */
    resetCoverToAuto: () => {
      if (busy) return;
      setCoverSwapped(false);
      setCover((c) => ({ ...c, transform: { focalX: 0.5, focalY: 0.5, zoom: 1 } }));
    },
    bundle,
    sourceWarnings,
    sourceContent: content,
    clubContent,
    contentOverride,
    setContentOverride: (value: ContentOverride) => !busy && setContentOverride(value),
    visibleFields,
    /** A results, match summary or team list set: its kind, the club's choice and this set's. */
    contentKind: setKind,
    kindClubContent: kindContent,
    kindOverride,
    setKindOverride: (value: ContentOverride) => !busy && setKindOverride(value),
    kindVisibleFields: kindVisible,
    timeZone,
    from,
    to,
    // New dates tick every game (up to the maximum). Under a rounds pick the
    // admin's ticks stay, and only the games the new dates bring in are ticked.
    setFrom: (v: string) => {
      if (busy) return;
      setFrom(v);
      setKeepPicks((k) => k && "ticked");
    },
    setTo: (v: string) => {
      if (busy) return;
      setTo(v);
      setKeepPicks((k) => k && "ticked");
    },
    resetRange: () => {
      if (busy) return;
      const range =
        setType === "matchDay" ? weekendRange(new Date(), CLUB_TIME_ZONE) : rangeForSet(setType);
      setFrom(range.from);
      setTo(range.to);
      setOnlyIds(null);
      setKeepPicks(null);
    },
    rangeValid,
    /** The games a rounds pick allows (null: every game in the dates). */
    onlyIds,
    /**
     * Set the dates and the games a rounds pick allows in one go (null ids: all).
     * Every tick the admin made is kept; a game not seen before comes in ticked,
     * or unticked with `newGames: "unticked"` (switching to dates).
     */
    applyRange: (
      range: { from: string; to: string; ids: number[] | null },
      newGames: Exclude<KeepPicks, null> = "ticked",
    ) => {
      if (busy) return;
      setFrom(range.from);
      setTo(range.to);
      setOnlyIds(range.ids);
      setKeepPicks(newGames);
    },
    title,
    setTitle: (v: string) => !busy && setTitle(v),
    size,
    templateKind,
    picked,
    setPicked: (value: PickedTemplate | null) => {
      if (busy) return;
      setPicked(value);
      setQueueError(null);
    },
    /** What previews draw: the assembled document on the blank base. */
    packId: assembly.document ? BLANK_PACK_ID : WEEKEND_PACK_ID,
    document: assembly.document,
    assembling: assembly.loading,
    assemblyError: assembly.error,
    /** The template drawing the set when the picked one couldn't (never silent, round 9 B13). */
    drawnWith: assembly.drawnWith,
    setSize: (v: CardSize) => !busy && setSize(v),
    orderedPicks,
    selected,
    togglePick,
    movePick,
    setAll,
    generated,
    stale,
    generate,
    slides,
    patchTeam,
    moveTeamAt,
    exporting,
    generating,
    generationError,
    busy,
    caption,
    setCaption: (value: string) => !busy && setCaptionEdit(value),
    resetCaption: () => !busy && setCaptionEdit(null),
    queueError,
    queuedId,
    canQueue,
    runQueue,
  };
}

export type WeekendCarouselState = ReturnType<typeof useWeekendCarousel>;
