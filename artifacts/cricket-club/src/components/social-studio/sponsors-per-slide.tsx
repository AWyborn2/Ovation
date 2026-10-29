import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSocialSettingsQueryKey, useUpdateSocialSettings } from "@workspace/api-client-react";
import {
  DEFAULT_SPONSORS_PER_SLIDE,
  MAX_SPONSORS_PER_SLIDE,
  MIN_SPONSORS_PER_SLIDE,
  clampSponsorsPerSlide,
  sponsorsSplit,
} from "@workspace/scorecard/kind-templates";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";

/** "13 sponsors → 7 + 6 (2 slides)", "8 sponsors → 1 slide". */
export function sponsorsSplitLabel(count: number, perSlide: number): string {
  const shares = sponsorsSplit(count, perSlide);
  if (shares.length === 0) return "No sponsors to show";
  const sponsors = `${count} sponsor${count === 1 ? "" : "s"}`;
  return shares.length === 1
    ? `${sponsors} → 1 slide`
    : `${sponsors} → ${shares.join(" + ")} (${shares.length} slides)`;
}

/**
 * Sponsors per slide, with the split it makes shown live: a stepper kept in
 * range (3 to 16) and a preview of how `sponsorCount` sponsors share the
 * slides, evenly ("13 sponsors → 7 + 6"). Self-contained, so the club's
 * default (Social settings) and a single design (the Weekend Carousel, and
 * the coming Create flow) use the same control.
 */
export function SponsorsPerSlideControl({
  id,
  value,
  onChange,
  sponsorCount,
  label = "Sponsors per slide",
  hint,
  disabled = false,
}: {
  id: string;
  value: number;
  onChange: (next: number) => void;
  sponsorCount: number;
  label?: string;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  const current = clampSponsorsPerSlide(value);
  const [text, setText] = useState(String(current));
  useEffect(() => setText(String(current)), [current]);
  const set = (n: number) => {
    const next = clampSponsorsPerSlide(n);
    setText(String(next));
    if (next !== current) onChange(next);
  };
  const shares = sponsorsSplit(sponsorCount, current);

  return (
    <div className="space-y-1.5" data-testid="sponsors-per-slide">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Fewer sponsors per slide"
          disabled={disabled || current <= MIN_SPONSORS_PER_SLIDE}
          onClick={() => set(current - 1)}
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={MIN_SPONSORS_PER_SLIDE}
          max={MAX_SPONSORS_PER_SLIDE}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => set(Number(text))}
          onKeyDown={(e) => {
            if (e.key === "Enter") set(Number(text));
          }}
          className="h-8 w-14 rounded-md border bg-background px-2 text-center text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="More sponsors per slide"
          disabled={disabled || current >= MAX_SPONSORS_PER_SLIDE}
          onClick={() => set(current + 1)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {sponsorsSplitLabel(sponsorCount, current)}
        </span>
      </div>
      {shares.length > 1 && (
        <div className="flex flex-wrap gap-1.5" aria-hidden>
          {shares.map((n, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded border bg-muted px-2 py-0.5 text-xs"
            >
              Slide {i + 1}: {n}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {hint ??
          `${MIN_SPONSORS_PER_SLIDE} to ${MAX_SPONSORS_PER_SLIDE}. Past this, sponsors share extra slides evenly; major sponsors stay larger and first.`}
      </p>
    </div>
  );
}

/**
 * The club's default sponsors per slide (Social settings). Every new carousel
 * starts from it; a single design can change it for itself without changing
 * this. Saves when changed.
 */
export function SponsorsPerSlideSetting({
  saved,
  sponsorCount,
}: {
  saved: number | undefined;
  sponsorCount: number;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        void queryClient.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });
  return (
    <fieldset className="space-y-2 rounded-md border p-3" data-testid="sponsors-per-slide-setting">
      <legend className="px-1 text-sm font-medium">Sponsors page slides</legend>
      <SponsorsPerSlideControl
        id="club-sponsors-per-slide"
        value={saved ?? DEFAULT_SPONSORS_PER_SLIDE}
        sponsorCount={sponsorCount}
        disabled={update.isPending}
        onChange={(next) => update.mutate({ data: { sponsorsPerSlide: next } })}
        hint={`Your club's default (${MIN_SPONSORS_PER_SLIDE} to ${MAX_SPONSORS_PER_SLIDE}). Every carousel starts from it, and you can change it for one carousel when you build it.`}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}
