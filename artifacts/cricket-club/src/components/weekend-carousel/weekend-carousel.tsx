import { useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarRange,
  Download,
  ImageOff,
  Info,
  Layers,
  RefreshCw,
} from "lucide-react";
import type { Fixture } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, QueryError } from "@/components/data-states";
import { PackCard } from "@/components/pack-card";
import { PhotoReposition } from "@/components/photo-reposition";
import { SIZES, type CardSize } from "@/lib/share-card";
import { CLUB_TIME_ZONE, eligiblePhotos, type TeamSlide } from "./model";
import { CoverPhotoPicker } from "./cover-photo-picker";
import {
  slideAdjustments,
  useWeekendCarousel,
  WEEKEND_PACK_ID, type WeekendCarouselState } from "./use-weekend-carousel";

const SIZE_KEYS = Object.keys(SIZES) as CardSize[];

const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: CLUB_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

const fixtureLine = (f: Fixture) =>
  `${f.grade} ${f.isHome ? "vs" : "at"} ${f.opponentName}`;

/** Entry action + dialog. Takes no props; data loads only once opened. */
export function WeekendCarousel({ className }: { className?: string } = {}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
        data-testid="button-open-weekend-carousel"
      >
        <Layers className="mr-1 h-3.5 w-3.5" aria-hidden /> Weekend match-day carousel
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] w-[min(96vw,72rem)] max-w-none overflow-y-auto p-0">
          {open && <WeekendCarouselBody />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function WeekendCarouselBody() {
  const s = useWeekendCarousel();
  return (
    <div className="flex flex-col">
      <DialogHeader className="space-y-1 border-b px-5 py-4 text-left">
        <DialogTitle className="text-xl">Weekend match-day carousel</DialogTitle>
        <DialogDescription>
          Pick this weekend's fixtures, check photos, download every slide as one ZIP. Nothing is
          saved or published.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-6 px-5 py-5">
        {s.error ? (
          <QueryError
            title="Couldn't load fixtures, photos or settings"
            onRetry={s.retry}
          />
        ) : s.loading ? (
          <div className="space-y-3" data-testid="weekend-loading">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <RangeAndFixtures s={s} />
            <GenerateBar s={s} />
            {s.generated && !s.stale && <GeneratedSet s={s} />}
          </>
        )}
      </div>
    </div>
  );
}

function RangeAndFixtures({ s }: { s: WeekendCarouselState }) {
  const lock = s.exporting;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="wk-from">From</Label>
          <Input
            id="wk-from"
            type="date"
            value={s.from}
            disabled={lock}
            onChange={(e) => s.setFrom(e.target.value)}
            data-testid="input-weekend-from"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wk-to">To</Label>
          <Input
            id="wk-to"
            type="date"
            value={s.to}
            disabled={lock}
            onChange={(e) => s.setTo(e.target.value)}
            data-testid="input-weekend-to"
          />
        </div>
        <Button variant="ghost" size="sm" disabled={lock} onClick={s.resetRange}>
          <CalendarRange className="mr-1 h-3.5 w-3.5" aria-hidden /> This weekend
        </Button>
        <p className="basis-full text-xs text-muted-foreground" data-testid="text-timezone">
          Dates and start times use Perth time ({s.timeZone}), the app standard.
        </p>
        {s.sourceWarnings.length > 0 && (
          <ul className="basis-full space-y-1 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2" data-testid="list-source-warnings">
            {s.sourceWarnings.map((w) => (
              <li key={w} className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {w}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!s.rangeValid ? (
        <p className="text-sm text-destructive" role="alert">
          The start date must be on or before the end date.
        </p>
      ) : s.orderedPicks.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="h-8 w-8" />}
          title="No fixtures in this range"
          message="Try another date range, or add fixtures in the Fixtures admin."
        />
      ) : (
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="font-serif text-sm font-bold uppercase tracking-wide">
              Fixtures · {s.selected.length} of {s.orderedPicks.length} selected
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={lock} onClick={() => s.setAll(true)}>
                All
              </Button>
              <Button size="sm" variant="ghost" disabled={lock} onClick={() => s.setAll(false)}>
                None
              </Button>
            </div>
          </div>
          <ol className="divide-y" aria-label="Fixtures in range">
            {s.orderedPicks.map((p, i) => (
              <li
                key={p.id}
                className={`flex items-center gap-3 px-3 py-2 ${p.included ? "" : "opacity-55"}`}
                data-testid={`row-fixture-${p.id}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={p.included}
                  disabled={lock}
                  onChange={() => s.togglePick(p.id)}
                  aria-label={`Include ${fixtureLine(p.fixture)}`}
                  data-testid={`checkbox-fixture-${p.id}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fixtureLine(p.fixture)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {fmtWhen(p.fixture.startAt)}
                    {p.fixture.venue ? ` · ${p.fixture.venue}` : ""}
                  </p>
                </div>
                <OrderButtons
                  label={fixtureLine(p.fixture)}
                  index={i}
                  count={s.orderedPicks.length}
                  disabled={lock}
                  onMove={(d) => s.movePick(i, d)}
                />
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function OrderButtons({
  label,
  index,
  count,
  disabled,
  onMove,
}: {
  label: string;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="flex gap-0.5">
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
        aria-label={`Move ${label} up`}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
        aria-label={`Move ${label} down`}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function GenerateBar({ s }: { s: WeekendCarouselState }) {
  const disabled = s.exporting || !s.rangeValid || s.selected.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-3">
      <Button onClick={s.generate} disabled={disabled} data-testid="button-generate-weekend">
        <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
        {s.generated ? "Regenerate preview" : "Generate preview"}
      </Button>
      {s.stale ? (
        <p className="text-sm text-destructive" role="status" data-testid="text-weekend-stale">
          Fixture selection changed. Regenerate before exporting.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Team photos are chosen once when you generate. Regenerating resets team photos and crops, not your cover.
        </p>
      )}
    </div>
  );
}

function GeneratedSet({ s }: { s: WeekendCarouselState }) {
  const lock = s.exporting;
  const noSponsors = !s.slides.some(sl =>
    sl.input.kind === "matchDay" && (sl.input.carouselPage?.sponsors.length ?? 0) > 0);
  // Crop frame mirrors the Club Kit photo panel: 46% of card width x full
  // height on square/landscape; tall formats are fluid, so the slide preview
  // below is authoritative there.
  const aspect =
    s.size === "square" || s.size === "landscape"
      ? { w: Math.round(SIZES[s.size].w * 0.46), h: SIZES[s.size].h }
      : { w: SIZES[s.size].w, h: SIZES[s.size].h };
  const fluidFrame = s.size !== "square" && s.size !== "landscape";
  const previewW = s.size === "landscape" ? 300 : s.size === "story" ? 150 : 200;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[14rem] flex-1 space-y-1">
          <Label htmlFor="wk-title">Title slide heading</Label>
          <Input
            id="wk-title"
            value={s.title}
            disabled={lock}
            maxLength={60}
            onChange={(e) => s.setTitle(e.target.value)}
            data-testid="input-weekend-title"
          />
        </div>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Size</legend>
          <div className="flex flex-wrap gap-1" role="radiogroup">
            {SIZE_KEYS.map((k) => (
              <Button
                key={k}
                size="sm"
                role="radio"
                aria-checked={s.size === k}
                variant={s.size === k ? "default" : "outline"}
                disabled={lock}
                onClick={() => s.setSize(k)}
                data-testid={`button-size-${k}`}
              >
                {SIZES[k].label}
                <span className="ml-1 font-mono text-[10px] opacity-70">{SIZES[k].code}</span>
              </Button>
            ))}
          </div>
        </fieldset>
      </div>

      <CoverPhotoPicker s={s} />

      {noSponsors && (
        <p className="flex items-center gap-2 rounded border px-3 py-2 text-sm text-muted-foreground" data-testid="text-no-sponsors">
          <Info className="h-4 w-4 shrink-0" aria-hidden />
          No sponsors will appear: sponsors are switched off or none are active for these cards.
        </p>
      )}

      {s.generated && s.generated.teams.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base">Team photos and order</h3>
          <ol className="space-y-3">
            {s.generated.teams.map((t, i) => (
              <TeamEditor
                key={t.fixture.id}
                s={s}
                team={t}
                index={i}
                count={s.generated!.teams.length}
                aspect={aspect}
                fluidFrame={fluidFrame}
              />
            ))}
          </ol>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-base">Slides · {s.slides.length}</h3>
        <ol className="flex gap-4 overflow-x-auto pb-2" aria-label="Slide previews">
          {s.slides.map((sl, i) => (
            <li key={sl.id} className="shrink-0 space-y-1.5" style={{ width: previewW }} data-testid={`slide-${sl.id}`}>
              <div className="overflow-hidden rounded-md border bg-muted">
                <PackCard
                  input={sl.input}
                  size={s.size}
                  sponsorsOn={sl.sponsorsOn}
                  junior={sl.junior}
                  data={sl.data}
                  packId={WEEKEND_PACK_ID}
                  adjustments={slideAdjustments(sl, s.size)}
                  width={previewW}
                />
              </div>
              <p className="text-xs font-medium">
                <span className="font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>{" "}
                {sl.label}
              </p>
              {sl.warnings.map((w) => (
                <p key={w} className="flex gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {w}
                </p>
              ))}
            </li>
          ))}
        </ol>
      </div>

      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-3 border-t bg-card px-5 py-3">
        <Button onClick={s.runExport} disabled={!s.canExport} data-testid="button-export-weekend">
          <Download className="mr-1 h-3.5 w-3.5" aria-hidden />
          {s.exporting ? "Exporting…" : `Download ZIP (${s.slides.length} PNGs)`}
        </Button>
        {s.exporting && s.progress && (
          <div className="flex min-w-[12rem] flex-1 items-center gap-2" role="status" data-testid="status-export-progress">
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="h-full origin-left bg-primary transition-transform"
                style={{ transform: `scaleX(${s.progress.total ? s.progress.done / s.progress.total : 0})` }}
              />
            </div>
            <span className="font-mono text-xs">
              {s.progress.done}/{s.progress.total}
            </span>
          </div>
        )}
        {s.exportError && (
          <p className="text-sm text-destructive" role="alert" data-testid="text-export-error">
            {s.exportError}
          </p>
        )}
      </div>
    </section>
  );
}

function TeamEditor({
  s,
  team,
  index,
  count,
  aspect,
  fluidFrame,
}: {
  s: WeekendCarouselState;
  team: TeamSlide;
  index: number;
  count: number;
  aspect: { w: number; h: number };
  fluidFrame: boolean;
}) {
  const lock = s.exporting;
  const options = eligiblePhotos(s.photos, team.fixture.grade);
  const chosen = options.find((p) => p.id === team.photoId) ?? null;
  const label = fixtureLine(team.fixture);

  return (
    <li className="rounded-md border p-3" data-testid={`team-${team.fixture.id}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{label}</p>
        <Badge variant="outline" className="text-[10px]">{team.fixture.grade}</Badge>
        <OrderButtons label={label} index={index} count={count} disabled={lock} onMove={(d) => s.moveTeamAt(index, d)} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_16rem]">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Photo for ${label}`}>
          <button
            type="button"
            role="radio"
            aria-checked={team.photoId == null}
            disabled={lock}
            onClick={() => s.patchTeam(index, { photoId: null })}
            className={`flex h-16 w-16 flex-col items-center justify-center rounded border text-[10px] text-muted-foreground ${team.photoId == null ? "ring-2 ring-primary" : ""}`}
            data-testid={`button-no-photo-${team.fixture.id}`}
          >
            <ImageOff className="h-4 w-4" aria-hidden /> No photo
          </button>
          {options.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={team.photoId === p.id}
              aria-label={`Photo ${p.id}`}
              disabled={lock}
              onClick={() =>
                s.patchTeam(index, { photoId: p.id, transform: { focalX: 0.5, focalY: 0.5, zoom: 1 } })
              }
              className={`h-16 w-16 overflow-hidden rounded border ${team.photoId === p.id ? "ring-2 ring-primary" : ""}`}
              data-testid={`button-photo-${team.fixture.id}-${p.id}`}
            >
              <img src={p.thumbUrl || p.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
          {options.length === 0 && (
            <p className="self-center text-xs text-muted-foreground">
              No {team.fixture.grade} photos in the library. This slide will use no photo.
            </p>
          )}
        </div>
        {chosen && (
          <fieldset disabled={lock}>
            <PhotoReposition
              src={chosen.url}
              aspect={aspect}
              value={team.transform}
              onChange={(transform) => s.patchTeam(index, { transform })}
            />
            {fluidFrame && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                This format's photo area is fluid; check the slide preview below for the exact crop.
              </p>
            )}
          </fieldset>
        )}
      </div>
    </li>
  );
}

export default WeekendCarousel;
