import { Link } from "wouter";
import { Trophy } from "lucide-react";
import type { BoardTier } from "@/lib/honour-boards";
import { BOARDS } from "@/lib/honour-boards";
import { TierBadge } from "@/components/tier-badge";
import { GradeBadge, GradeBadgeList } from "@/components/grade-badge";
import { EmptyState } from "@/components/data-states";
import type { PremiershipCount } from "./types";

export const SummaryStat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="bg-card border border-border rounded-md p-5 shadow-md">
    <div className="text-3xl md:text-4xl font-serif font-bold text-primary">
      {typeof value === "number" ? value.toLocaleString() : value}
    </div>
    <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-serif">{label}</div>
  </div>
);

export const PremiershipBadge = ({ count }: { count: PremiershipCount }) => {
  if (count.won === 0) return <span className="text-muted-foreground/60">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-600/40 text-amber-700 dark:text-amber-300 font-bold text-xs"
      title={`${count.won} premiership${count.won === 1 ? "" : "s"}${count.captained ? `, captained ${count.captained}` : ""}`}
    >
      <Trophy className="h-3 w-3" />
      <span className="font-mono">{count.won}</span>
      {count.captained > 0 && (
        <span className="ml-0.5 font-mono text-[10px] bg-amber-600 text-white rounded px-1">
          C×{count.captained}
        </span>
      )}
    </span>
  );
};

const BoardCard = ({ tier, board, premMap }: { tier: BoardTier; board: (typeof BOARDS)[number]; premMap?: Map<number, PremiershipCount> }) => (
  <div className="bg-card border border-border rounded-md overflow-hidden shadow-lg">
    <div className="bg-primary text-primary-foreground px-4 md:px-6 py-3 font-serif font-bold uppercase tracking-wider text-sm flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 md:gap-3">
        <TierBadge tierIndex={tier.tierIndex} />
        <span>{tier.label}</span>
      </span>
      <span className="text-xs whitespace-nowrap">{tier.rows.length} {tier.rows.length === 1 ? "player" : "players"}</span>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm sticky-id-col">
        <thead>
          <tr className="bg-black/25">
            <th className="text-center font-serif uppercase tracking-wider text-primary p-3 text-xs w-14">#</th>
            <th className="text-left font-serif uppercase tracking-wider text-primary p-3 text-xs">Surname</th>
            <th className="text-left font-serif uppercase tracking-wider text-primary p-3 text-xs">Given Name</th>
            <th className="text-right font-serif uppercase tracking-wider text-primary p-3 text-xs">{board.headlineLabel}</th>
            {board.key === "games" && (
              <th className="text-center font-serif uppercase tracking-wider text-primary p-3 text-xs">Prem</th>
            )}
            <th className={`font-serif uppercase tracking-wider text-primary p-3 text-xs hidden sm:table-cell ${board.key === "games" ? "text-left" : "text-right"}`}>{board.key === "games" ? "Grades" : board.supportingLabel}</th>
          </tr>
        </thead>
        <tbody>
          {tier.rows.map((r, i) => (
            <tr key={r.playerId} className={`border-t border-border/50 hover:bg-primary/10 transition-colors ${i % 2 ? "bg-black/10" : ""}`}>
              <td className="p-3 text-center font-mono text-primary font-bold">{tier.startRank + i}</td>
              <td className="p-3">
                <Link href={`/players/${r.playerId}`} className="font-semibold text-primary hover:underline uppercase">
                  {r.surname}
                </Link>
              </td>
              <td className="p-3 text-foreground/90">{r.givenName}</td>
              <td className="p-3 text-right font-mono font-bold">{r.headline}</td>
              {board.key === "games" && (
                <td className="p-3 text-center">
                  <PremiershipBadge count={premMap?.get(r.playerId) ?? { won: 0, captained: 0 }} />
                </td>
              )}
              <td className="p-3 hidden sm:table-cell">
                {board.key === "games" ? (
                  <GradeBadgeList grades={r.gradesPlayed} size="sm" />
                ) : (
                  <span className="block text-right font-mono text-muted-foreground">{r.supporting}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const BoardView = ({ tiers, board, premMap }: { tiers: BoardTier[]; board: (typeof BOARDS)[number]; premMap?: Map<number, PremiershipCount> }) => (
  <div className="space-y-4">
    <div className="bg-card border border-border rounded-md p-6 shadow-md">
      <h2 className="text-2xl md:text-3xl font-serif font-bold text-primary m-0">{board.title}</h2>
      <div className="w-20 h-[3px] bg-primary mt-3" />
      <p className="text-muted-foreground italic mt-3 mb-0">{board.subtitle}</p>
    </div>
    {tiers.length === 0 ? (
      <EmptyState
        title="No players qualify yet"
        message="Players appear on this board as their career totals grow."
      />
    ) : (
      tiers.map((t) => <BoardCard key={t.label} tier={t} board={board} premMap={premMap} />)
    )}
  </div>
);

// Quick-link cards mirroring the Juniors dashboard, in the club gold (the
// senior section keeps gold as its accent everywhere).
export function QuickLink({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: typeof Trophy;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href}>
      <div className="bg-card border border-border rounded-md p-5 shadow-sm cursor-pointer h-full hover:border-primary transition-colors group">
        <Icon className="h-7 w-7 text-primary mb-3" />
        <div className="font-serif font-bold text-lg text-foreground group-hover:text-primary">
          {title}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{desc}</p>
      </div>
    </Link>
  );
}
