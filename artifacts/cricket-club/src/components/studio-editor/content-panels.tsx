import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudSun, Loader2, Lock, Palette, Radio, Scissors, Search, Upload } from "lucide-react";
import {
  useListClubPhotos,
  getListClubPhotosQueryKey,
  useListPlayers,
  useListCaps,
  useGetBackgroundRemovalStatus,
  getGetBackgroundRemovalStatusQueryKey,
  useRemovePhotoBackground,
  useGetFixtureForecast,
  getGetFixtureForecastQueryKey,
  type ClubPhoto,
} from "@workspace/api-client-react";
import type { FreeLayer } from "@/lib/pack-render";
import {
  CHART_LABEL,
  MEDAL_VARIANTS,
  NEEDS_BALL_BY_BALL,
  STICKERS,
  type ChartType,
} from "@/lib/pack-render/layer-kinds";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { uploadLibraryPhotos } from "@/components/social-queue/library-upload";
import { cn } from "@/lib/utils";
import { newId } from "./document";
import { chartFromInput, liveField, playerBlock } from "./content";

const section =
  "mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ed-ink2)]";
const tile =
  "rounded-lg bg-[var(--ed-card)] text-sm hover:ring-1 hover:ring-[var(--ed-accent)] disabled:opacity-40 disabled:hover:ring-0";
const chip = (on: boolean) =>
  cn(
    "h-8 rounded-full border px-3 text-xs font-semibold",
    on
      ? "border-[var(--ed-ink)] bg-[var(--ed-ink)] text-[var(--ed-bg)]"
      : "border-[var(--ed-line)] text-[var(--ed-ink2)]",
  );
const search =
  "h-9 w-full rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] pl-8 pr-2.5 text-sm placeholder:text-[var(--ed-muted)]";

const box = (size: CardSize, x: number, y: number, w: number, h: number, now = Date.now()) => ({
  geometry: { [size]: { x, y, w, h } },
  editedAt: { [size]: now },
});

/** Club photo library (senior-only): season, grade and player chips; add or set as the photo. */
export function PhotosPanel({
  size,
  onAdd,
  onSetPhoto,
}: {
  size: CardSize;
  onAdd: (layer: FreeLayer) => void;
  onSetPhoto: (url: string) => void;
}) {
  const photosQ = useListClubPhotos(undefined, {
    query: { queryKey: getListClubPhotosQueryKey() },
  });
  const photos = photosQ.data ?? [];
  // Background removal is offered only when the API has a provider key; the
  // probe 404s otherwise and the action stays hidden.
  const removalQ = useGetBackgroundRemovalStatus({
    query: { queryKey: getGetBackgroundRemovalStatusQueryKey(), retry: false, staleTime: 300_000 },
  });
  const canRemoveBackground = removalQ.isSuccess && removalQ.data?.available === true;
  const [season, setSeason] = useState<number | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const seasons = [
    ...new Set(photos.map((p) => p.season).filter((s): s is number => s != null)),
  ].sort((a, b) => b - a);
  const grades = [...new Set(photos.map((p) => p.grade).filter((g): g is string => !!g))].sort();
  const shown = photos.filter(
    (p) => (season == null || p.season === season) && (grade == null || p.grade === grade),
  );

  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" className={chip(season == null)} onClick={() => setSeason(null)}>
          All seasons
        </button>
        {seasons.map((s) => (
          <button key={s} type="button" className={chip(season === s)} onClick={() => setSeason(s)}>
            {s}/{String((s + 1) % 100).padStart(2, "0")}
          </button>
        ))}
      </div>
      {grades.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {grades.map((g) => (
            <button
              key={g}
              type="button"
              className={chip(grade === g)}
              onClick={() => setGrade(grade === g ? null : g)}
            >
              {g}
            </button>
          ))}
        </div>
      )}
      {photosQ.isLoading ? (
        <p className="mt-4 text-sm text-[var(--ed-ink2)]">Loading the photo library…</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--ed-ink2)]">
          No photos here yet. Add some in Uploads.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {shown.map((p) => (
            <LibraryTile
              key={p.id}
              photo={p}
              size={size}
              onAdd={onAdd}
              onSetPhoto={onSetPhoto}
              canRemoveBackground={canRemoveBackground}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryTile({
  photo,
  size,
  onAdd,
  onSetPhoto,
  canRemoveBackground,
}: {
  photo: ClubPhoto;
  size: CardSize;
  onAdd: (layer: FreeLayer) => void;
  onSetPhoto: (url: string) => void;
  canRemoveBackground: boolean;
}) {
  const qc = useQueryClient();
  const [removalError, setRemovalError] = useState<string | null>(null);
  const removal = useRemovePhotoBackground({
    mutation: {
      onSuccess: () => {
        setRemovalError(null);
        qc.invalidateQueries({ queryKey: getListClubPhotosQueryKey() });
      },
      onError: () => setRemovalError("Couldn't remove the background. Try again later."),
    },
  });
  const isCutOut = photo.sourcePhotoId != null;
  return (
    <div className="group relative overflow-hidden rounded-lg bg-[var(--ed-card)]">
      <img
        src={photo.thumbUrl}
        alt=""
        className={cn("aspect-[4/3] w-full", isCutOut ? "object-contain" : "object-cover")}
      />
      {isCutOut && (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-[var(--ed-panel)] px-2 py-0.5 text-[10px] font-semibold">
          Cut-out
        </span>
      )}
      {canRemoveBackground && !isCutOut && (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-[var(--ed-panel)] text-[var(--ed-ink)] disabled:opacity-60"
          title="Remove background (saves a cut-out copy to the library)"
          aria-label={`Remove background from library photo ${photo.id}`}
          disabled={removal.isPending}
          onClick={() => removal.mutate({ data: { photoId: photo.id } })}
        >
          {removal.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Scissors className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      )}
      <div className="flex gap-1 p-1.5">
        <button
          type="button"
          className="flex-1 rounded-md bg-[var(--ed-accent)] px-1 py-1 text-[11px] font-bold text-[var(--ed-on-accent)]"
          onClick={() => onSetPhoto(photo.url)}
          aria-label={`Set library photo ${photo.id} as the card photo`}
        >
          Set as photo
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--ed-line)] px-2 py-1 text-[11px] font-semibold"
          aria-label={`Add library photo ${photo.id} to the card`}
          onClick={() =>
            onAdd({
              id: newId(),
              kind: "image",
              name: "Photo",
              content: photo.url,
              ...box(size, 20, 20, 60, 45),
            })
          }
        >
          Add
        </button>
      </div>
      {removalError && (
        <p role="alert" className="px-1.5 pb-1.5 text-[11px] text-[var(--ed-ink2)]">
          {removalError}
        </p>
      )}
    </div>
  );
}

/**
 * Uploads: files go through the senior-only library ingest (HEIC converted,
 * EXIF stripped) and then appear in Photos.
 */
export function UploadsPanel() {
  const qc = useQueryClient();
  const [state, setState] = useState<string | null>(null);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setState("Uploading…");
    let failed = 0;
    await uploadLibraryPhotos(Array.from(files), {
      onState: (_i, s) => {
        if (s.phase === "error") failed += 1;
      },
    });
    qc.invalidateQueries({ queryKey: getListClubPhotosQueryKey() });
    setState(
      failed ? `${failed} couldn't be added.` : "Added to your photo library. Find them in Photos.",
    );
  };
  return (
    <div className="mt-3 space-y-3">
      <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--ed-line)] text-sm hover:bg-[var(--ed-card)]">
        {state === "Uploading…" ? (
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-6 w-6" aria-hidden />
        )}
        <span className="font-semibold">Drop photos or click to upload</span>
        <span className="text-xs text-[var(--ed-ink2)]">JPEG, PNG, WebP or iPhone HEIC</span>
        <input
          type="file"
          multiple
          accept="image/*,.heic,.heif"
          className="sr-only"
          aria-label="Upload photos"
          onChange={(e) => void onFiles(e.target.files)}
        />
      </label>
      {state && <p className="text-sm text-[var(--ed-ink2)]">{state}</p>}
    </div>
  );
}

/** Players: search the senior squad and add a grouped, player-bound block. */
export function PlayersPanel({
  size,
  onAddMany,
}: {
  size: CardSize;
  onAddMany: (layers: FreeLayer[]) => void;
}) {
  const [q, setQ] = useState("");
  const params = {
    search: q || undefined,
    limit: 12,
    sortBy: "name" as const,
    sortOrder: "asc" as const,
  };
  const playersQ = useListPlayers(params);
  const capsQ = useListCaps();
  const capByPlayer = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of capsQ.data ?? []) if (c.playerId != null) m.set(c.playerId, c.capNumber);
    return m;
  }, [capsQ.data]);
  const players = playersQ.data?.players ?? [];

  return (
    <div className="mt-3 space-y-2">
      <label className="relative block">
        <span className="sr-only">Search players</span>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ed-ink2)]"
          aria-hidden
        />
        <input
          className={search}
          placeholder="Search players"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {players.map((p) => {
        const name = `${p.givenName} ${p.surname}`.trim();
        const cap = capByPlayer.get(p.id);
        return (
          <div key={p.id} className="flex items-center gap-3 rounded-lg bg-[var(--ed-card)] p-2.5">
            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--ed-line)] text-sm font-bold">
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                name.slice(0, 1)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate font-mono text-[11px] text-[var(--ed-accent)]">
                {cap != null ? `Cap ${cap} · ` : ""}
                {p.totalGames ?? 0} M · {(p.totalRuns ?? 0).toLocaleString("en-AU")} runs ·{" "}
                {p.totalWickets ?? 0} wkts
              </p>
            </div>
            <button
              type="button"
              aria-label={`Add ${name}`}
              className="rounded-full bg-[var(--ed-accent)] px-3 py-1.5 text-xs font-bold text-[var(--ed-on-accent)]"
              onClick={() =>
                onAddMany(
                  playerBlock(
                    {
                      id: p.id,
                      name,
                      imageUrl: p.imageUrl,
                      capNumber: cap ?? null,
                      games: p.totalGames,
                      runs: p.totalRuns,
                      wickets: p.totalWickets,
                    },
                    size,
                  ),
                )
              }
            >
              Add
            </button>
          </div>
        );
      })}
    </div>
  );
}

const CHARTS: ChartType[] = [
  "bowlingFigures",
  "battingCard",
  "ladder",
  "runWorm",
  "runsPerOver",
  "wagonWheel",
];

/**
 * The fixture a match-day draft was drafted from, read from its source key
 * (`matchday:<fixtureId>`); null for any other card or an ad-hoc one.
 */
export function matchDayFixtureId(
  kind: ShareCardInput["kind"],
  sourceKey: string | null | undefined,
): number | null {
  if (kind !== "matchDay" || !sourceKey) return null;
  const m = /^matchday:(\d+)$/.exec(sourceKey);
  return m ? Number(m[1]) : null;
}

/**
 * Match-day forecast for the fixture's venue and start hour. Renders nothing
 * when the API has no forecast (404: no venue coordinates or out of range) or
 * the provider fails.
 */
function ForecastBlock({
  fixtureId,
  size,
  onAdd,
}: {
  fixtureId: number;
  size: CardSize;
  onAdd: (layer: FreeLayer) => void;
}) {
  const params = { fixtureId };
  const forecastQ = useGetFixtureForecast(params, {
    query: { queryKey: getGetFixtureForecastQueryKey(params), retry: false, staleTime: 600_000 },
  });
  const f = forecastQ.data;
  if (!forecastQ.isSuccess || !f) return null;
  const line = `${f.temperatureC}° · ${f.conditions}`;
  return (
    <div>
      <p className={section}>Match-day forecast</p>
      <div className="flex items-center gap-3 rounded-lg bg-[var(--ed-card)] p-2.5">
        <CloudSun className="h-6 w-6 shrink-0 text-[var(--ed-accent)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{line}</p>
          <p className="truncate text-[11px] text-[var(--ed-ink2)]">
            {f.venue ? `${f.venue} · ` : ""}at the start hour
          </p>
        </div>
        <button
          type="button"
          aria-label="Add the forecast to the card"
          className="rounded-full bg-[var(--ed-accent)] px-3 py-1.5 text-xs font-bold text-[var(--ed-on-accent)]"
          onClick={() =>
            onAdd({
              id: newId(),
              kind: "text",
              name: "Forecast",
              content: line,
              style: { fontSize: 3.2, fontWeight: 700 },
              ...box(size, 15, 80, 70, 6.4),
            })
          }
        >
          Add
        </button>
      </div>
      <p className="mt-1 text-[10px] text-[var(--ed-muted)]">{f.attribution}</p>
    </div>
  );
}

/** Cricket: scorecard charts from this card's data, milestone medals and stickers. */
export function CricketPanel({
  size,
  input,
  fixtureId = null,
  onAdd,
}: {
  size: CardSize;
  input: ShareCardInput;
  /** The match-day draft's fixture, for its forecast (see matchDayFixtureId). */
  fixtureId?: number | null;
  onAdd: (layer: FreeLayer) => void;
}) {
  return (
    <div>
      {fixtureId != null && <ForecastBlock fixtureId={fixtureId} size={size} onAdd={onAdd} />}
      <p className={section}>Scorecard & charts</p>
      <div className="grid grid-cols-2 gap-2">
        {CHARTS.map((type) => {
          const spec = chartFromInput(type, input);
          const noData = NEEDS_BALL_BY_BALL.has(type) || spec.rows.length === 0;
          return (
            <button
              key={type}
              type="button"
              className={cn(tile, "px-3 py-3 text-left")}
              title={
                noData ? "This card has no data for this chart; it shows an empty state" : undefined
              }
              onClick={() =>
                onAdd({
                  id: newId(),
                  kind: "chart",
                  name: CHART_LABEL[type],
                  chart: spec,
                  ...box(size, 10, 30, 80, 45),
                })
              }
            >
              <span className="block font-semibold">{CHART_LABEL[type]}</span>
              <span className="block text-[11px] text-[var(--ed-ink2)]">
                {noData
                  ? NEEDS_BALL_BY_BALL.has(type)
                    ? "Needs ball-by-ball data"
                    : "No data on this card"
                  : `${spec.rows.length} rows`}
              </span>
            </button>
          );
        })}
      </div>
      <p className={section}>Milestone badges</p>
      <div className="grid grid-cols-4 gap-2">
        {MEDAL_VARIANTS.map((v) => (
          <button
            key={v}
            type="button"
            aria-label={`Add ${v} badge`}
            className={cn(
              tile,
              "grid aspect-square place-items-center font-serif text-lg font-bold",
            )}
            onClick={() =>
              onAdd({
                id: newId(),
                kind: "medal",
                name: `${v} badge`,
                content: v,
                ...box(size, 38, 38, 24, 24),
              })
            }
          >
            {v}
          </button>
        ))}
      </div>
      <p className={section}>Stickers</p>
      <div className="grid grid-cols-2 gap-2">
        {STICKERS.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`Add ${s} sticker`}
            className={cn(tile, "px-3 py-2.5 font-serif font-bold uppercase")}
            onClick={() =>
              onAdd({
                id: newId(),
                kind: "sticker",
                name: s,
                content: s,
                ...box(size, 30, 42, 40, 14),
              })
            }
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Live stats: text layers bound to this card's own fields, updated when its data refreshes. */
export function LiveStatsPanel({
  size,
  fields,
  values,
  onAdd,
}: {
  size: CardSize;
  fields: { key: string; label: string }[];
  values: Record<string, string>;
  onAdd: (layer: FreeLayer) => void;
}) {
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs text-[var(--ed-ink2)]">
        Live fields show this card's own data and update when a correction comes through.
      </p>
      {fields.map((f) => (
        <button
          key={f.key}
          type="button"
          className={cn(tile, "flex w-full items-center gap-2 px-3 py-2 text-left")}
          onClick={() => onAdd(liveField(f.key, f.label, size))}
        >
          <Radio className="h-4 w-4 shrink-0 text-[var(--ed-accent)]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-[var(--ed-ink2)]">{f.label}</span>
            <span className="block truncate font-semibold">{values[f.key] || "—"}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Brand kit: crest, the tenant palette, recolour-to-brand and the sponsor-strip lock. */
export function BrandPanel({
  size,
  logoUrl,
  palette,
  sponsorLock,
  onAdd,
  onRecolour,
  onSponsorLock,
}: {
  size: CardSize;
  logoUrl: string | null;
  palette: string[];
  sponsorLock: boolean;
  onAdd: (layer: FreeLayer) => void;
  onRecolour: () => void;
  onSponsorLock: (on: boolean) => void;
}) {
  return (
    <div className="mt-3 space-y-4">
      <div className="rounded-xl bg-[var(--ed-card)] p-3">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-12 w-12 object-contain" />
          ) : (
            <Palette className="h-8 w-8" aria-hidden />
          )}
          <div className="flex flex-1 overflow-hidden rounded-md" aria-label="Brand palette">
            {palette.map((c) => (
              <span key={c} className="h-8 flex-1" style={{ background: c }} title={c} />
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-lg bg-[var(--ed-accent)] px-2 py-2 text-xs font-bold text-[var(--ed-on-accent)]"
            onClick={onRecolour}
          >
            Recolour to brand
          </button>
          <button
            type="button"
            disabled={!logoUrl}
            className="rounded-lg border border-[var(--ed-line)] px-2 py-2 text-xs font-semibold disabled:opacity-40"
            onClick={() =>
              logoUrl &&
              onAdd({
                id: newId(),
                kind: "image",
                name: "Crest",
                content: logoUrl,
                ...box(size, 40, 8, 20, 20),
              })
            }
          >
            Add crest
          </button>
        </div>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-xl bg-[var(--ed-card)] p-3 text-sm">
        <span className="flex items-center gap-2">
          <Lock className="h-4 w-4" aria-hidden />
          <span>
            <span className="block font-semibold">Lock sponsor strip</span>
            <span className="block text-xs text-[var(--ed-ink2)]">
              Keeps every sponsor on this card.
            </span>
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Lock sponsor strip"
          checked={sponsorLock}
          onChange={(e) => onSponsorLock(e.target.checked)}
          className="h-5 w-5 accent-[var(--ed-accent)]"
        />
      </label>
    </div>
  );
}
