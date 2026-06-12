import { Link } from "wouter";
import { useBrand } from "@/lib/brand-context";
import { useListLifeMembers, type LifeMember, type LifeMemberStats } from "@workspace/api-client-react";
import { GradeBadge } from "@/components/grade-badge";

const battingAvg = (s: LifeMemberStats) => {
  const denom = s.innings - s.notOuts;
  if (denom <= 0) return "-";
  return (s.runs / denom).toFixed(2);
};

const bowlingAvg = (s: LifeMemberStats) =>
  s.wickets > 0 ? (s.runsConceded / s.wickets).toFixed(2) : "-";

const StatTile = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) => (
  <div className="bg-background/60 border border-border rounded p-3">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
      {label}
    </div>
    <div className="font-mono font-bold text-primary text-lg leading-tight mt-0.5">
      {value}
    </div>
    {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
  </div>
);

const StatsGrid = ({ stats }: { stats: LifeMemberStats }) => {
  const dismissals = stats.catches + stats.stumpings + stats.runOuts;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      <StatTile label="Games" value={stats.games} />
      <StatTile
        label="Runs"
        value={stats.runs.toLocaleString()}
        sub={`Avg ${battingAvg(stats)} • HS ${stats.highScore ?? "-"}`}
      />
      <StatTile
        label="50s / 100s"
        value={`${stats.fifties} / ${stats.hundreds}`}
      />
      <StatTile
        label="Wickets"
        value={stats.wickets}
        sub={`Avg ${bowlingAvg(stats)} • BB ${stats.bestBowling ?? "-"}`}
      />
      <StatTile label="5-Wicket Hauls" value={stats.fiveWickets} />
      <StatTile
        label="Dismissals"
        value={dismissals}
        sub={`${stats.catches} c / ${stats.stumpings} s / ${stats.runOuts} ro`}
      />
    </div>
  );
};

const MemberCard = ({ member }: { member: LifeMember }) => {
  const paragraphs = (member.blurb ?? "").split(/\n\n+/);
  const nameContent = (
    <span
      className="font-serif font-bold uppercase tracking-wide text-2xl md:text-3xl text-primary"
      style={{ fontFamily: '"Roboto Slab", serif' }}
    >
      {member.name}
    </span>
  );
  return (
    <div className="bg-card border border-border rounded-md p-5 md:p-6 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {member.playerId !== null && member.playerId !== undefined ? (
            <Link href={`/players/${member.playerId}`} className="hover:underline">
              {nameContent}
            </Link>
          ) : (
            nameContent
          )}
          {member.roleLabel && (
            <div className="italic text-sm text-muted-foreground mt-1">
              {member.roleLabel}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Inducted
          </div>
          <div className="font-mono font-bold text-primary text-2xl leading-none">
            {member.inductionYear}
          </div>
        </div>
      </div>

      {member.isPlayingMember && member.stats && (
        <div className="mt-5 space-y-4">
          <StatsGrid stats={member.stats} />
          {member.stats.gradesPlayed.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="uppercase tracking-widest text-muted-foreground">
                Grades played:
              </span>
              {member.stats.gradesPlayed.map((g) => (
                <span
                  key={g}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-border bg-background/60"
                >
                  <GradeBadge grade={g} size="sm" />
                  <span className="font-semibold text-primary">{g}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {member.blurb && (
        <div className="mt-5 border-l-4 border-primary pl-4 italic text-foreground/90 space-y-3">
          {paragraphs.map((p, i) => (
            <p key={i} className="m-0 leading-relaxed">
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

export function LifeMembersTab() {
  const brand = useBrand();
  const { data: members, isLoading } = useListLifeMembers();

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-md p-6 shadow-md">
        <h2 className="text-2xl md:text-3xl font-serif font-bold text-primary m-0">
          Life Members
        </h2>
        <div className="w-20 h-[3px] bg-primary mt-3" />
        <p className="text-muted-foreground italic mt-3 mb-0">
          {brand.name}'s highest individual honour — recognising
          members whose contribution to the club has been exceptional and
          enduring. {members?.length ?? 0} Life Members inducted since the award
          was first given.
        </p>
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">
          Loading life members…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(members ?? []).map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
        </div>
      )}
    </div>
  );
}
