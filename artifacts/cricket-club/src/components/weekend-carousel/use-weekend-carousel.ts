import { useEffect, useMemo, useRef, useState } from "react";
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
import type { CardAdjustments } from "@/lib/pack-render";
import { CAROUSEL_LABELS, isCarouselPackId, type CarouselSetType } from "@workspace/scorecard/queued-carousel";
import {
  CLUB_TIME_ZONE,
  weekendRange,
  rangeForSet,
  createTeamSlides,
  buildWeekendSlides,
  moveTeam,
  eligibleCoverPhotos,
  COVER_PHOTO_UNAVAILABLE,
  type CoverPhoto,
  type TeamSlide,
  type WeekendSlide,
} from "./model";
import { carouselCaption } from "./caption";

export const WEEKEND_PACK_ID = "club-kit-v1";

type Pick = { id: number; included: boolean };
type Generated = { key: string; from: string; to: string; teams: TeamSlide[] };

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
  const t = (slide.data as { photoTransform?: { focalX: number; focalY: number; zoom?: number } | null })
    .photoTransform;
  if (!t) return null;
  return { photo: { [size]: { focalX: t.focalX, focalY: t.focalY, zoom: t.zoom ?? 1 } } };
}

/**
 * State for the weekend match-day composer: date range, fixture
 * picks/order, a frozen generated set (photo choices fixed at generate time),
 * per-team photo/crop edits and caption. Sending to review saves a frozen set.
 */
export function useWeekendCarousel(initialType: CarouselSetType = "matchDay") {
  const [setType, setSetType] = useState<CarouselSetType>(initialType);
  const initial = useMemo(() => initialType === "matchDay" ? weekendRange(new Date(), CLUB_TIME_ZONE) : rangeForSet(initialType), [initialType]);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const rangeValid = !!from && !!to && from <= to;

  // Server scopes tenant/grade/categories, live cancellation status and the
  // date range (including already-started games) — no client re-filtering.
  const params = { from, to, setType };
  const sourcesQ = useGetWeekendCarouselSources(params, {
    query: { queryKey: getGetWeekendCarouselSourcesQueryKey(params), enabled: rangeValid },
  });
  const sources = sourcesQ.data as WeekendCarouselSources | undefined;
  const settingsQ = useGetSocialSettings({
    query: { queryKey: getGetSocialSettingsQueryKey() },
  });
  const createDraft = useCreateSocialDraft();
  const qc = useQueryClient();
  const submission = useRef<{ key: string; id: string } | null>(null);
  const submitting = useRef(false);

  const fixtures = useMemo(() => (sources?.fixtures ?? []) as Fixture[], [sources]);
  const photos = useMemo(() => (sources?.photos ?? []) as ClubPhoto[], [sources]);
  const coverPhotos = useMemo(() => eligibleCoverPhotos(sources?.coverPhotos ?? []), [sources]);
  const sourceWarnings = sources?.warnings ?? [];
  const timeZone = sources?.timeZone ?? CLUB_TIME_ZONE;
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;

  const [title, setTitle] = useState(CAROUSEL_LABELS[initialType]);
  const [captionEdit, setCaptionEdit] = useState<string | null>(null);
  const [queued, setQueued] = useState<{ key: string; id: number } | null>(null);
  const [size, setSize] = useState<CardSize>("square");
  const [packId, setPackId] = useState(WEEKEND_PACK_ID);
  const [cover, setCover] = useState<CoverPhoto>({
    photoId: null, transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
  });
  const coverUnavailable = cover.photoId !== null && !coverPhotos.some(p => p.id === cover.photoId);

  const inRange = rangeValid ? fixtures : [];
  const inRangeSig = `${setType}:` + inRange.map((f) => f.id).join(",");

  // Picks reset to "all selected, chronological" whenever the candidate set changes.
  const [picks, setPicks] = useState<Pick[]>([]);
  useEffect(() => {
    setPicks(inRange.map((f) => ({ id: f.id, included: true })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRangeSig]);

  const byId = useMemo(() => new Map(fixtures.map((f) => [f.id, f])), [fixtures]);
  const orderedPicks = picks
    .map((p) => ({ ...p, fixture: byId.get(p.id) }))
    .filter((p): p is Pick & { fixture: Fixture } => !!p.fixture);
  const selected = orderedPicks.filter((p) => p.included).map((p) => p.fixture);

  const selectedContent = Object.fromEntries(selected.map(f => [f.id, sources?.content?.[f.id] ?? null]));
  const selectionKey = JSON.stringify([setType, from, to, selected, selectedContent]);

  const [generated, setGenerated] = useState<Generated | null>(null);
  const stale = !!generated && generated.key !== selectionKey;

  const generate = () => {
    if (selected.length === 0 || selected.length > 18) return;
    // Photo choices are fixed here, once — never re-picked on re-render.
    setGenerated({ key: selectionKey, from, to, teams: createTeamSlides(selected, photos, sources?.content) });
    setQueueError(null);
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
    );
  }, [generated, photos, bundle, title, cover, coverPhotos, setType]);

  const [exporting, setExporting] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const caption = captionEdit ?? carouselCaption(
    setType, generated?.teams ?? [], title, bundle?.settings.clubHashtag,
  );
  const queueKey = JSON.stringify([slides, size, caption, packId]);
  const queuedId = queued?.key === queueKey ? queued.id : null;

  const togglePick = (id: number) =>
    !exporting && setPicks((ps) => ps.map((p) => (p.id === id ? { ...p, included: !p.included } : p)));
  const movePick = (index: number, dir: -1 | 1) =>
    !exporting && setPicks((ps) => move(ps, index, index + dir));
  const setAll = (included: boolean) =>
    !exporting && setPicks((ps) => ps.map((p) => ({ ...p, included })));

  const patchTeam = (index: number, patch: Partial<TeamSlide>) =>
    !exporting &&
    setGenerated((g) =>
      g ? { ...g, teams: g.teams.map((t, i) => (i === index ? { ...t, ...patch } : t)) } : g,
    );
  const moveTeamAt = (index: number, dir: -1 | 1) => {
    if (exporting) return;
    setGenerated((g) => {
      if (!g) return g;
      const target = index + dir;
      if (target < 0 || target >= g.teams.length) return g;
      return { ...g, teams: moveTeam(g.teams, index, target) };
    });
  };

  const canQueue = !!generated && !stale && slides.length >= 3 && slides.length <= 20 &&
    !!caption.trim() && caption.length <= 5000 && !queuedId && !exporting && !coverUnavailable &&
    !sourcesQ.isError && !settingsQ.isError && !sourcesQ.isFetching && !settingsQ.isFetching;
  const runQueue = async () => {
    if (!canQueue || submitting.current) return;
    submitting.current = true;
    setExporting(true);
    setQueueError(null);
    try {
      // A second admin may have removed or retagged the photo since preview.
      // Rebuild from fresh server-approved URLs, never silently replace the pick.
      let queuedSlides = slides;
      if (cover.photoId !== null || setType !== "matchDay") {
        const fresh = await sourcesQ.refetch();
        if (fresh.isError || !fresh.data) throw new Error("Could not verify source data. Retry before sending to review.");
        if (setType !== "matchDay" && generated!.teams.some(t =>
          JSON.stringify(fresh.data.content?.[t.fixture.id]) !== JSON.stringify(t.input))) {
          throw new Error("A selected team list or scorecard changed or is no longer available. Regenerate the preview before sending to review.");
        }
        const allowed = eligibleCoverPhotos(fresh.data.coverPhotos ?? []);
        if (cover.photoId !== null && !allowed.some(p => p.id === cover.photoId)) throw new Error(COVER_PHOTO_UNAVAILABLE);
        const freshPhotos = fresh.data.photos ?? photos;
        if (generated!.teams.some(t => t.photoId !== null && !freshPhotos.some(p => p.id === t.photoId && p.grade === t.fixture.grade))) {
          throw new Error("A selected team photo is no longer available. Choose another photo and regenerate.");
        }
        queuedSlides = buildWeekendSlides(generated!.teams, freshPhotos, bundle!,
          title.trim() || CAROUSEL_LABELS[setType], generated!.from, generated!.to, CLUB_TIME_ZONE,
          { selection: cover, photos: allowed });
      }
      if (submission.current?.key !== queueKey) {
        submission.current = { key: queueKey, id: crypto.randomUUID() };
      }
      const draft = await createDraft.mutateAsync({ data: {
        packId,
        caption: caption.trim(),
        cardInput: {
          kind: "matchDay", headline: `${title.trim() || CAROUSEL_LABELS[setType]} carousel`,
          roundLabel: `${generated!.from} – ${generated!.to}`,
          weekendCarousel: { version: 1, packId, setType, submissionId: submission.current.id, size, slides: queuedSlides },
        },
      } });
      setQueued({ key: queueKey, id: draft.id });
      qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetPendingSocialDraftCountQueryKey() });
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : "Could not send the carousel to review. Please retry.");
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
    setType,
    setTypeLabel: CAROUSEL_LABELS[setType],
    changeType: (type: CarouselSetType) => {
      if (exporting) return;
      setSetType(type);
      const range = type === "matchDay" ? weekendRange(new Date(), CLUB_TIME_ZONE) : rangeForSet(type);
      setFrom(range.from);
      setTo(range.to);
      setTitle(CAROUSEL_LABELS[type]);
      setCaptionEdit(null);
      setGenerated(null);
      setQueueError(null);
    },
    loading,
    error,
    retry,
    photos,
    coverPhotos,
    cover,
    coverUnavailable,
    patchCover: (patch: Partial<CoverPhoto>) => !exporting && setCover(c => ({ ...c, ...patch })),
    bundle,
    sourceWarnings,
    timeZone,
    from,
    to,
    setFrom: (v: string) => !exporting && setFrom(v),
    setTo: (v: string) => !exporting && setTo(v),
    resetRange: () => {
      if (exporting) return;
      const range = setType === "matchDay" ? weekendRange(new Date(), CLUB_TIME_ZONE) : rangeForSet(setType);
      setFrom(range.from);
      setTo(range.to);
    },
    rangeValid,
    title,
    setTitle: (v: string) => !exporting && setTitle(v),
    size,
    packId,
    setPackId: (value: string) => {
      if (exporting) return;
      if (!isCarouselPackId(value)) throw new Error("Choose a registered built-in carousel pack.");
      setPackId(value);
      setQueueError(null);
    },
    setSize: (v: CardSize) => !exporting && setSize(v),
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
    caption,
    setCaption: (value: string) => !exporting && setCaptionEdit(value),
    resetCaption: () => !exporting && setCaptionEdit(null),
    queueError,
    queuedId,
    canQueue,
    runQueue,
  };
}

export type WeekendCarouselState = ReturnType<typeof useWeekendCarousel>;
