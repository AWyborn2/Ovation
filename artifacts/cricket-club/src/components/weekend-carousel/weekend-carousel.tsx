import { useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarRange,
  Send,
  ImageOff,
  Info,
  Layers,
  RefreshCw,
} from "lucide-react";
import type { Fixture } from "@workspace/api-client-react";
import { CAROUSEL_LABELS, type CarouselSetType } from "@workspace/scorecard/queued-carousel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { SIZES, type CardSize } from "@/lib/share-card";
import { listPackManifests } from "@/lib/pack-templates/registry";
import { CLUB_TIME_ZONE, eligiblePhotos, type TeamSlide } from "./model";
import { CoverPhotoPicker } from "./cover-photo-picker";
import { PhotoPlacement, SlidePreview } from "./slide-preview";
import { useWeekendCarousel, type WeekendCarouselState } from "./use-weekend-carousel";

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
  `${f.grade} ${f.source === "scorecard" || f.isHome ? "vs" : "at"} ${f.opponentName}`;

/** Entry action + dialog. Takes no props; data loads only once opened. */
export function WeekendCarousel({
  className,
  initialType = "matchDay",
}: { className?: string; initialType?: CarouselSetType } = {}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
        data-testid={
          initialType === "matchDay"
            ? "button-open-weekend-carousel"
            : `button-open-carousel-${initialType}`
        }
      >
        <Layers className="mr-1 h-3.5 w-3.5" aria-hidden /> {CAROUSEL_LABELS[initialType]}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="left-0 top-0 flex h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none"
          data-testid="weekend-fullscreen-editor"
        >
          {open && <WeekendCarouselBody initialType={initialType} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function WeekendCarouselBody({
  initialType = "matchDay",
}: { initialType?: CarouselSetType } = {}) {
  const s = useWeekendCarousel(initialType);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-4 pr-12 text-left">
        <DialogTitle className="text-xl">{s.setTypeLabel} carousel</DialogTitle>
        <DialogDescription>
          Pick the teams or matches, check photos and caption, then send the whole carousel to
          review. Nothing is published until it is approved.
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-5 py-5">
        <fieldset className="flex flex-wrap items-center gap-2" disabled={s.busy}>
          <legend className="mb-2 text-sm font-medium">Set type</legend>
          {(Object.keys(CAROUSEL_LABELS) as CarouselSetType[]).map((type) => (
            <Button
              key={type}
              size="sm"
              variant={s.setType === type ? "default" : "outline"}
              aria-pressed={s.setType === type}
              onClick={() => s.changeType(type)}
              data-testid={`button-carousel-type-${type}`}
            >
              {CAROUSEL_LABELS[type]}
            </Button>
          ))}
        </fieldset>
        <div className="space-y-1">
          <Label htmlFor="carousel-pack">Built-in design pack</Label>
          <select
            id="carousel-pack"
            value={s.packId}
            disabled={s.busy}
            onChange={(e) => s.setPackId(e.target.value)}
            data-testid="select-carousel-pack"
            className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
          >
            {listPackManifests().map((pack) => (
              <option key={pack.packId} value={pack.packId}>
                {pack.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Applies to every slide, including the cover and sponsors. Changing the pack keeps your
            photos, crops, order and caption.
          </p>
        </div>
        {s.error ? (
          <QueryError
            title="Couldn't load carousel sources, photos or settings"
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
  const lock = s.busy;
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
          <CalendarRange className="mr-1 h-3.5 w-3.5" aria-hidden />{" "}
          {s.setType === "results" || s.setType === "matchSummary"
            ? "Last completed weekend"
            : "This weekend"}
        </Button>
        <p className="basis-full text-xs text-muted-foreground" data-testid="text-timezone">
          Dates and start times use Perth time ({s.timeZone}), the app standard.
        </p>
        {s.sourceWarnings.length > 0 && (
          <ul
            className="basis-full space-y-1 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2"
            data-testid="list-source-warnings"
          >
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
          title={`No ${s.setType === "matchDay" ? "fixtures" : s.setTypeLabel.toLowerCase()} in this range`}
          message="Try another date range. Only available sources can be included; see any missing-data reasons above."
        />
      ) : (
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="font-serif text-sm font-bold uppercase tracking-wide">
              {s.setType === "matchDay" ? "Fixtures" : s.setTypeLabel} · {s.selected.length} of{" "}
              {s.orderedPicks.length} selected · maximum 18
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
                    {p.fixture.source === "scorecard"
                      ? new Date(p.fixture.startAt).toLocaleDateString("en-AU", {
                          timeZone: CLUB_TIME_ZONE,
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : fmtWhen(p.fixture.startAt)}
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
  const disabled =
    s.busy ||
    s.loading ||
    s.error ||
    !s.rangeValid ||
    s.selected.length === 0 ||
    s.selected.length > 18;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-3">
      <Button onClick={s.generate} disabled={disabled} data-testid="button-generate-weekend">
        <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
        {s.generating
          ? "Refreshing sources…"
          : s.generated
            ? "Regenerate preview"
            : "Generate preview"}
      </Button>
      {s.generationError && (
        <p role="alert" className="text-sm text-destructive" data-testid="text-generation-error">
          {s.generationError}
        </p>
      )}
      {s.selected.length > 18 ? (
        <p role="alert" className="text-sm text-destructive">
          Select at most 18 teams or matches ({s.selected.length} selected). The cover and sponsor
          page bring the limit to 20 slides.
        </p>
      ) : s.stale ? (
        <p className="text-sm text-destructive" role="status" data-testid="text-weekend-stale">
          Source data or selection changed. Regenerate before sending to review.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Regenerating refreshes team data and keeps your valid photo choices, crops and slide
          order.
        </p>
      )}
    </div>
  );
}

function GeneratedSet({ s }: { s: WeekendCarouselState }) {
  const lock = s.busy;
  const noSponsors = !s.slides.some(
    (sl) =>
      (sl.sponsorsOn && (sl.data.sponsors?.length ?? 0) > 0) ||
      (sl.input.kind === "matchDay" && (sl.input.carouselPage?.sponsors.length ?? 0) > 0),
  );
  const closingSlide = s.slides.find((sl) => sl.id === "sponsors");

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
        <p
          className="flex items-center gap-2 rounded border px-3 py-2 text-sm text-muted-foreground"
          data-testid="text-no-sponsors"
        >
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
              />
            ))}
          </ol>
        </div>
      )}

      {closingSlide && (
        <section className="space-y-3 rounded-md border p-3">
          <h3 className="text-base">Sponsors · final slide</h3>
          <SlidePreview slide={closingSlide} size={s.size} packId={s.packId} />
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="weekend-caption">{s.setTypeLabel} caption</Label>
          <Button variant="ghost" size="sm" disabled={lock} onClick={s.resetCaption}>
            Reset caption
          </Button>
        </div>
        <Textarea
          id="weekend-caption"
          value={s.caption}
          maxLength={5000}
          rows={10}
          disabled={lock}
          onChange={(e) => s.setCaption(e.target.value)}
          data-testid="input-weekend-caption"
        />
        <p className="text-xs text-muted-foreground">
          One caption for the entire carousel. You can edit it again in the review queue.
        </p>
        {s.slides.length > 20 && (
          <p role="alert" className="text-sm text-destructive">
            A carousel can contain up to 20 slides. Select fewer fixtures.
          </p>
        )}
      </section>

      <div className="sticky bottom-0 z-10 -mx-5 flex flex-wrap items-center gap-3 border-t bg-card px-5 py-3">
        <Button onClick={s.runQueue} disabled={!s.canQueue} data-testid="button-queue-weekend">
          <Send className="mr-1 h-3.5 w-3.5" aria-hidden />
          {s.exporting
            ? "Sending to review…"
            : s.queuedId
              ? "Sent to review"
              : `Send to review (${s.slides.length} slides)`}
        </Button>
        {s.queuedId && (
          <p role="status" className="text-sm" data-testid="status-weekend-queued">
            Carousel saved for review.{" "}
            <a className="underline" href={`/admin/social/queue?draft=${s.queuedId}`}>
              View in review queue
            </a>
          </p>
        )}
        {s.queueError && (
          <p className="text-sm text-destructive" role="alert" data-testid="text-queue-error">
            {s.queueError}
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
}: {
  s: WeekendCarouselState;
  team: TeamSlide;
  index: number;
  count: number;
}) {
  const lock = s.busy;
  const options =
    team.input && "junior" in team.input && team.input.junior
      ? []
      : eligiblePhotos(s.photos, team.fixture.grade);
  const chosen = options.find((p) => p.id === team.photoId) ?? null;
  const label = fixtureLine(team.fixture);
  const slide = s.slides.find((sl) => sl.id === `fixture-${team.fixture.id}`);

  return (
    <li className="rounded-md border p-3" data-testid={`team-${team.fixture.id}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{label}</p>
        <Badge variant="outline" className="text-[10px]">
          {team.fixture.grade}
        </Badge>
        <OrderButtons
          label={label}
          index={index}
          count={count}
          disabled={lock}
          onMove={(d) => s.moveTeamAt(index, d)}
        />
      </div>
      <div className="mt-3 grid items-start gap-5 md:grid-cols-2">
        {slide && <SlidePreview slide={slide} size={s.size} packId={s.packId} />}
        <div className="min-w-0 space-y-4">
          <div
            className="flex max-h-64 flex-wrap gap-2 overflow-y-auto p-1"
            role="radiogroup"
            aria-label={`Photo for ${label}`}
          >
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
                  s.patchTeam(index, {
                    photoId: p.id,
                    transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
                  })
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
            <PhotoPlacement
              value={team.transform}
              onChange={(transform) => s.patchTeam(index, { transform })}
              disabled={lock}
              label={team.fixture.grade}
            />
          )}
        </div>
      </div>
    </li>
  );
}

export default WeekendCarousel;
