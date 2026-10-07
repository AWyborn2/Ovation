import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetWeekendCarouselSources,
  getGetWeekendCarouselSourcesQueryKey,
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  useCreateCardRenderStill,
  type Fixture,
  type ClubPhoto,
  type WeekendCarouselSources,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import type { CardSize } from "@/lib/share-card";
import type { CardAdjustments } from "@/lib/pack-render";
import {
  CLUB_TIME_ZONE,
  weekendRange,
  createTeamSlides,
  buildWeekendSlides,
  moveTeam,
  type TeamSlide,
  type WeekendSlide,
} from "./model";
import { downloadWeekendZip } from "./export";

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
 * State for the ephemeral weekend match-day exporter: date range, fixture
 * picks/order, a frozen generated set (photo choices fixed at generate time),
 * per-team photo/crop edits and the ZIP export. Nothing is saved server-side.
 */
export function useWeekendCarousel() {
  const initial = useMemo(() => weekendRange(new Date(), CLUB_TIME_ZONE), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const rangeValid = !!from && !!to && from <= to;

  // Server scopes tenant/grade/categories, live cancellation status and the
  // date range (including already-started games) — no client re-filtering.
  const params = { from, to };
  const sourcesQ = useGetWeekendCarouselSources(params, {
    query: { queryKey: getGetWeekendCarouselSourcesQueryKey(params), enabled: rangeValid },
  });
  const sources = sourcesQ.data as WeekendCarouselSources | undefined;
  const settingsQ = useGetSocialSettings({
    query: { queryKey: getGetSocialSettingsQueryKey() },
  });
  const still = useCreateCardRenderStill();
  const stillRef = useRef(still.mutateAsync);
  stillRef.current = still.mutateAsync;

  const fixtures = useMemo(() => (sources?.fixtures ?? []) as Fixture[], [sources]);
  const photos = useMemo(() => (sources?.photos ?? []) as ClubPhoto[], [sources]);
  const sourceWarnings = sources?.warnings ?? [];
  const timeZone = sources?.timeZone ?? CLUB_TIME_ZONE;
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;

  const [title, setTitle] = useState("Match day");
  const [size, setSize] = useState<CardSize>("square");

  const inRange = rangeValid ? fixtures : [];
  const inRangeSig = inRange.map((f) => f.id).join(",");

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

  const selectionKey = JSON.stringify([from, to, selected]);

  const [generated, setGenerated] = useState<Generated | null>(null);
  const stale = !!generated && generated.key !== selectionKey;

  const generate = () => {
    if (selected.length === 0) return;
    // Photo choices are fixed here, once — never re-picked on re-render.
    setGenerated({ key: selectionKey, from, to, teams: createTeamSlides(selected, photos) });
    setExportError(null);
  };

  const slides: WeekendSlide[] = useMemo(() => {
    if (!generated || !bundle) return [];
    return buildWeekendSlides(
      generated.teams,
      photos,
      bundle,
      title.trim() || "Match day",
      generated.from,
      generated.to,
      CLUB_TIME_ZONE,
    );
  }, [generated, photos, bundle, title]);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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

  const render = (slide: WeekendSlide, s: CardSize): Promise<Blob> =>
    stillRef.current({
      data: {
        input: slide.input as unknown as Record<string, unknown>,
        options: {
          size: s,
          packId: WEEKEND_PACK_ID,
          data: slide.data,
          junior: slide.junior,
          sponsorsOn: slide.sponsorsOn,
          strictImages: true,
          ...(slideAdjustments(slide, s) ? { adjustments: slideAdjustments(slide, s) } : {}),
        },
      },
    }) as Promise<Blob>;

  const canExport = !!generated && !stale && slides.length > 0 && !exporting &&
    !sourcesQ.isError && !settingsQ.isError && !sourcesQ.isFetching && !settingsQ.isFetching;
  const runExport = async () => {
    if (!canExport) return;
    setExporting(true);
    setExportError(null);
    setProgress({ done: 0, total: slides.length });
    try {
      await downloadWeekendZip(slides, size, render, (done, total) => setProgress({ done, total }));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed. Nothing was downloaded.");
    } finally {
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
    loading,
    error,
    retry,
    photos,
    bundle,
    sourceWarnings,
    timeZone,
    from,
    to,
    setFrom: (v: string) => !exporting && setFrom(v),
    setTo: (v: string) => !exporting && setTo(v),
    resetRange: () => {
      if (exporting) return;
      setFrom(initial.from);
      setTo(initial.to);
    },
    rangeValid,
    title,
    setTitle: (v: string) => !exporting && setTitle(v),
    size,
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
    progress,
    exportError,
    canExport,
    runExport,
  };
}

export type WeekendCarouselState = ReturnType<typeof useWeekendCarousel>;
