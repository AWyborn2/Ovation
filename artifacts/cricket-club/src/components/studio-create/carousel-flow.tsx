/**
 * Create → a carousel (studio-create-consolidation S4): steps 3 and 4 for "Whole round"
 * or "Carousel set". It drives the Weekend Carousel's own state, unchanged: the same
 * sources (senior or junior, never both), photo picks, content and assembly. Step 3
 * picks the dates and games; step 4 the look and size. "Open in editor" builds the set,
 * sends it to review (it never posts on its own) and opens it in the set editor, where
 * slides are reordered, added and removed.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useCreateSocialDraft, type CreateSocialDraftRequest } from "@workspace/api-client-react";
import { BLANK_PACK_ID } from "@/lib/pack-render";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { BLANK_DESIGN_KIND } from "@/components/studio-home/create-picker";
import { blankCarouselDocument } from "./model";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/data-states";
import { useWeekendCarousel } from "@/components/weekend-carousel";
import { RangeAndFixtures } from "@/components/weekend-carousel/weekend-carousel";
import { CarouselTemplatePicker } from "@/components/weekend-carousel/template-choice";
import type { CarouselAudience } from "@/components/weekend-carousel/model";
import type { CarouselSetType } from "@workspace/scorecard/queued-carousel";
import { SIZES, type CardSize } from "@/lib/share-card";
import { cn } from "@/lib/utils";

/** The sizes a carousel set comes in. */
export const CAROUSEL_SIZES: { value: CardSize; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait" },
  { value: "story", label: "Story" },
];

type Phase = "idle" | "building" | "queueing";

export function CarouselFlow({
  setType,
  audience,
  step,
  onNext,
}: {
  setType: CarouselSetType;
  audience: Exclude<CarouselAudience, "all">;
  step: 3 | 4;
  onNext: () => void;
}) {
  const [, navigate] = useLocation();
  const s = useWeekendCarousel(setType, audience);
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  // Set once generate() has run, so the effect below acts on its result.
  const [built, setBuilt] = useState(false);

  const open = async () => {
    setProblem(null);
    setBuilt(false);
    setPhase("building");
    await s.generate();
    setBuilt(true);
  };

  // Once the set is built and its design assembled, send it to review.
  useEffect(() => {
    if (phase !== "building" || !built || s.generating || s.assembling) return;
    if (s.generationError) {
      setProblem(s.generationError);
      setPhase("idle");
    } else if (s.canQueue) {
      setPhase("queueing");
      void s.runQueue();
    } else if (s.generated) {
      setProblem(
        s.assemblyError ??
          (s.slides.length < 3
            ? "A carousel needs at least 3 slides: pick more games, or make a single card."
            : "This carousel can't be made yet. Check the games picked and try again."),
      );
      setPhase("idle");
    }
  }, [phase, built, s]);

  useEffect(() => {
    if (phase === "queueing" && s.queueError) {
      setProblem(s.queueError);
      setPhase("idle");
    }
  }, [phase, s.queueError]);

  useEffect(() => {
    if (s.queuedId != null) navigate(`/admin/social/set/${s.queuedId}`);
  }, [s.queuedId, navigate]);

  if (s.error) {
    return (
      <QueryError title="Couldn't load carousel sources, photos or settings" onRetry={s.retry} />
    );
  }
  if (s.loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (step === 3) {
    return (
      <section aria-labelledby="fill-heading" className="space-y-4">
        <h3 id="fill-heading" className="text-lg font-semibold">
          {setType === "teamList" ? "Which round?" : "Fill it from"}
        </h3>
        {audience === "junior" && (
          <p className="text-sm text-muted-foreground">
            Junior data only: published junior team lists and synced junior games. Junior slides
            never show a child&rsquo;s photo, only approved club stock images.
          </p>
        )}
        <RangeAndFixtures s={s} />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!s.rangeValid || s.selected.length === 0 || s.selected.length > 18}
            onClick={onNext}
          >
            Next
          </Button>
          <BlankCarouselButton />
        </div>
      </section>
    );
  }

  const busy = phase !== "idle";
  return (
    <section aria-labelledby="look-heading" className="space-y-4">
      <h3 id="look-heading" className="text-lg font-semibold">
        Pick a look and size
      </h3>
      <div role="radiogroup" aria-label="Size" className="flex flex-wrap gap-2">
        {CAROUSEL_SIZES.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={s.size === o.value}
            disabled={busy}
            onClick={() => s.setSize(o.value)}
            className={cn(
              "flex w-24 flex-col items-center gap-2 rounded-xl border p-3 text-sm font-medium",
              s.size === o.value ? "border-primary ring-1 ring-primary" : "border-border",
            )}
          >
            <span
              aria-hidden
              className="block w-10 rounded-sm bg-primary/20"
              style={{ aspectRatio: `${SIZES[o.value].w} / ${SIZES[o.value].h}` }}
            />
            {o.label}
          </button>
        ))}
      </div>
      <CarouselTemplatePicker s={s} />
      <p className="text-sm text-muted-foreground">
        {s.selected.length} {s.selected.length === 1 ? "slide" : "slides"} for the games picked,
        plus a cover and your sponsors. The look applies to every slide.
      </p>
      <Button disabled={busy || !s.picked} onClick={open}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        Open in editor
      </Button>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </section>
  );
}

/**
 * "Pick by hand": a carousel of the club's own pages, with no data, opened in the set
 * editor to add, duplicate, reorder and design pages. It waits for review like any
 * draft and is never posted automatically.
 */
function BlankCarouselButton() {
  const [, navigate] = useLocation();
  const create = useCreateSocialDraft();
  const [error, setError] = useState<string | null>(null);
  const start = () => {
    setError(null);
    const kind = BLANK_DESIGN_KIND;
    const set = blankCarouselDocument(kind);
    create.mutate(
      {
        data: {
          cardInput: { kind },
          packId: BLANK_PACK_ID,
          adjustments: set as unknown as CreateSocialDraftRequest["adjustments"],
        },
      },
      {
        onSuccess: (draft) => navigate(`/admin/social/set/${draft.id}`),
        onError: (e) => setError(handleAdminMutationError(e) ?? "Couldn't start the carousel."),
      },
    );
  };
  return (
    <>
      <Button variant="outline" disabled={create.isPending} onClick={start}>
        Pick by hand: a blank carousel
      </Button>
      {error && (
        <p role="alert" className="basis-full text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
