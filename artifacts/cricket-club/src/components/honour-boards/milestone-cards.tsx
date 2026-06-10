import { Link } from "wouter";
import { Star } from "lucide-react";
import type { DebutEntry, MilestoneItem } from "@workspace/api-client-react";
import type { PromotionEntry, ApproachingEntry } from "@/lib/honour-boards";
import { TierBadge } from "@/components/tier-badge";
import { GradeBadge } from "@/components/grade-badge";
import { ShareButton } from "@/components/share-card-modal";
import { seasonLabel } from "@/lib/share-card";
import { MILESTONE_KIND_META } from "./constants";
import { formatMatchDate } from "./helpers";

export const PromotionCard = ({ entry: p }: { entry: PromotionEntry }) => {
  return (
    <div className="group relative bg-background/60 border border-border rounded-md p-3 flex flex-col gap-2 hover:border-primary hover:bg-primary/5 transition-colors">
      <Link href={`/players/${p.playerId}`} className="flex flex-col gap-2 pr-8">
        <div className="flex items-center gap-2">
          <TierBadge tierIndex={p.tierIndex} className="h-5 w-5 text-primary shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary truncate">
            {p.tierLabel}
          </span>
        </div>
        <div className="font-serif font-bold text-primary uppercase leading-tight group-hover:underline">
          {p.surname}
          <span className="font-sans font-normal text-foreground/80 normal-case"> {p.givenName}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-auto">
          <span className="font-mono font-bold text-foreground">{p.currentValue.toLocaleString()}</span>{" "}
          {p.boardLabel.toLowerCase()} • just past {p.threshold.toLocaleString()}
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <ShareButton
          engine="milestone"
          appPath={`/players/${p.playerId}`}
          playerId={p.playerId}
          iconOnly
          variant="ghost"
          size="icon"
          label={`Share ${p.givenName} ${p.surname} milestone`}
          className="h-7 w-7"
          input={{
            kind: "milestone",
            playerName: `${p.givenName} ${p.surname}`.trim(),
            tierLabel: p.tierLabel,
            tierIndex: p.tierIndex,
            milestoneLabel: p.boardLabel,
            currentValue: p.currentValue,
            threshold: p.threshold,
            headline: "Just Promoted",
          }}
        />
      </div>
    </div>
  );
};

export const DebutCard = ({ entry: d }: { entry: DebutEntry }) => {
  const seasonText = d.season != null ? seasonLabel(d.season) : null;
  const subline =
    seasonText != null
      ? `${d.grade} Cap #${d.capNumber} • ${d.round != null ? `Round ${d.round}, ` : ""}${seasonText}`
      : `${d.grade} Cap #${d.capNumber}`;
  return (
    <div className="group relative bg-background/60 border border-border rounded-md p-3 flex flex-col gap-2 hover:border-primary hover:bg-primary/5 transition-colors">
      <Link href={`/players/${d.playerId}`} className="flex flex-col gap-2 pr-8">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-primary shrink-0" strokeWidth={2.25} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary truncate">
            Debut
          </span>
        </div>
        <div className="font-serif font-bold text-primary uppercase leading-tight group-hover:underline">
          {d.name}
        </div>
        <div className="text-xs text-muted-foreground mt-auto">{subline}</div>
      </Link>
      <div className="absolute top-2 right-2">
        <ShareButton
          engine="milestone"
          appPath={`/players/${d.playerId}`}
          playerId={d.playerId}
          iconOnly
          variant="ghost"
          size="icon"
          label={`Share ${d.name} debut`}
          className="h-7 w-7"
          input={{
            kind: "debut",
            playerName: d.name,
            grade: d.grade,
            capNumber: d.capNumber,
            season: seasonText,
            round: d.round ?? null,
          }}
        />
      </div>
    </div>
  );
};

export const ApproachingCard = ({ entry: p }: { entry: ApproachingEntry }) => {
  return (
    <div className="group relative bg-background/60 border border-border rounded-md p-3 flex flex-col gap-2 hover:border-primary hover:bg-primary/5 transition-colors">
      <Link href={`/players/${p.playerId}`} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <TierBadge tierIndex={p.tierIndex} className="h-5 w-5 text-primary shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary truncate">
            {p.tierLabel}
          </span>
        </div>
        <div className="font-serif font-bold text-primary uppercase leading-tight group-hover:underline">
          {p.surname}
          <span className="font-sans font-normal text-foreground/80 normal-case"> {p.givenName}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-auto">
          <span className="font-mono font-bold text-foreground">{p.currentValue.toLocaleString()}</span>{" "}
          {p.boardLabel.toLowerCase()} •{" "}
          <span className="font-bold text-primary whitespace-nowrap">{p.gap.toLocaleString()} to go</span>
        </div>
      </Link>
    </div>
  );
};

export const DatedMilestoneCard = ({ item }: { item: MilestoneItem }) => {
  const meta = MILESTONE_KIND_META[item.kind];
  const Icon = meta.icon;
  const date = formatMatchDate(item.matchDate ?? null);
  return (
    <Link
      href={`/players/${item.playerId}`}
      className="block bg-background/60 border border-border rounded-md p-4 hover:border-primary transition-colors no-underline"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${meta.cls}`}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        {item.recent && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Recent</span>
        )}
      </div>
      <div className="font-serif font-bold text-primary leading-tight">{item.playerName}</div>
      <div className="text-sm font-semibold text-foreground mt-0.5">{item.label}</div>
      {item.detail && <div className="text-xs text-muted-foreground mt-1">{item.detail}</div>}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {item.grade && <GradeBadge grade={item.grade} size="sm" />}
        {date && (
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{date}</span>
        )}
      </div>
    </Link>
  );
};
