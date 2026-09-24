import { Link } from "wouter";
import { CardGridSkeleton } from "@/components/data-states";
import { cn } from "@/lib/utils";

export interface RecordCardData {
  key: string;
  label: string;
  /** Display value ("187*", "8/21", "5,812"); null when nobody holds it. */
  value: string | null;
  holder: string | null;
  holderId: number | null;
  context: string | null;
  /** "Held 6 yrs", "Active", "New" — omitted when unknown. */
  badge: string | null;
}

/**
 * The five headline records (highest score, best bowling, highest stand, career
 * runs, career wickets). The first card is solid accent; each shows a 64px
 * value, the holder and context, and a tenure / active badge.
 */
export function RecordCards({ cards, loading }: { cards: RecordCardData[]; loading: boolean }) {
  if (loading) return <CardGridSkeleton count={5} className="lg:grid-cols-5" />;
  return (
    <div
      data-testid="record-cards"
      className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]"
    >
      {cards.map((c, i) => {
        const featured = i === 0;
        return (
          <article
            key={c.key}
            data-testid="record-card"
            data-featured={featured || undefined}
            className={cn(
              "relative flex min-h-[190px] flex-col gap-1.5 overflow-hidden rounded-[16px] border p-5",
              featured ? "border-transparent bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            <span className="pr-16 text-[11px] font-semibold uppercase tracking-[0.14em] opacity-75">
              {c.label}
            </span>
            <span className="font-serif text-[64px] font-black leading-[0.9] tracking-[-0.01em]">
              {c.value ?? "–"}
            </span>
            {c.holder ? (
              <span className="mt-auto font-bold">
                {c.holderId ? (
                  <Link href={`/players/${c.holderId}`} className="hover:underline">
                    {c.holder}
                  </Link>
                ) : (
                  c.holder
                )}
              </span>
            ) : (
              <span className="mt-auto text-sm italic opacity-75">Not yet recorded</span>
            )}
            {c.context && <span className="text-[12.5px] opacity-75">{c.context}</span>}
            {c.badge && (
              <span
                data-testid="record-badge"
                className={cn(
                  "absolute right-4 top-4 flex h-[22px] items-center rounded-full px-2 text-[11px] font-bold",
                  featured ? "bg-primary-foreground/15" : "bg-muted",
                )}
              >
                {c.badge}
              </span>
            )}
          </article>
        );
      })}
    </div>
  );
}
