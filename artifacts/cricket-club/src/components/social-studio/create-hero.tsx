import { useState } from "react";
import { Search } from "lucide-react";
import { useHeroImage } from "@/lib/use-hero-image";
import { KIND_BLURB, kindLabel, matchCardKinds, type CardKind } from "@/lib/social-studio";
import { cn } from "@/lib/utils";

/** The card types most clubs post each week, offered before anything is typed. */
const QUICK_KINDS: CardKind[] = [
  "matchSummary",
  "century",
  "fiveFor",
  "milestone",
  "teamList",
  "matchDay",
];

/**
 * Create a card's hero (Social Studio U14): "What are we posting today?" over
 * the club's action photo (brand gradient when none is set), with a keyword
 * box that finds the card type and quick picks for the weekly regulars.
 */
export function CreateHero({ kind, onPick }: { kind: CardKind; onPick: (kind: CardKind) => void }) {
  const image = useHeroImage("home");
  const [query, setQuery] = useState("");
  const matches = matchCardKinds(query);
  const shown = query.trim() ? matches.slice(0, 6) : QUICK_KINDS;

  const pick = (k: CardKind) => {
    onPick(k);
    setQuery("");
  };

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-border"
      style={{
        background: image
          ? `center 40% / cover no-repeat url("${image}")`
          : "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.35) 100%)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/20" />
      <div className="relative space-y-4 px-5 py-8 sm:px-8 sm:py-10">
        <h2 className="font-serif text-[clamp(30px,4vw,46px)] font-bold uppercase leading-[.95] text-white">
          What are we posting today?
        </h2>
        <form
          role="search"
          className="max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            if (matches[0]) pick(matches[0]);
          }}
        >
          <label className="flex h-12 items-center gap-2 rounded-full bg-background/95 px-4 text-foreground shadow-lg">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">Find a card type</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try “century”, “team list” or “ladder”"
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
          </label>
        </form>
        <div role="group" className="flex flex-wrap gap-2" aria-label="Card types">
          {shown.length === 0 ? (
            <p className="text-sm text-white/80">
              No card type matches “{query.trim()}”. Pick one from the list below.
            </p>
          ) : (
            shown.map((k) => (
              <button
                key={k}
                type="button"
                title={KIND_BLURB[k]}
                aria-pressed={k === kind}
                onClick={() => pick(k)}
                className={cn(
                  "h-9 rounded-full border px-4 text-sm font-semibold transition-colors",
                  k === kind
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20",
                )}
              >
                {kindLabel(k)}
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
