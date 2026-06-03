import { Link } from "wouter";
import {
  useListTeamOfDecadeBoards,
  type TeamOfDecadeBoard,
  type TeamOfDecadeMember,
} from "@workspace/api-client-react";

function sortMembers(members: TeamOfDecadeMember[]): TeamOfDecadeMember[] {
  return [...members].sort(
    (a, b) =>
      a.battingOrder - b.battingOrder ||
      a.displayOrder - b.displayOrder ||
      a.id - b.id,
  );
}

function memberBadges(m: TeamOfDecadeMember): string[] {
  const badges: string[] = [];
  if (m.isCaptain) badges.push("C");
  if (m.isViceCaptain) badges.push("VC");
  if (m.isWicketkeeper) badges.push("WK");
  return badges;
}

const MemberName = ({ member }: { member: TeamOfDecadeMember }) =>
  member.playerId != null ? (
    <Link
      href={`/players/${member.playerId}`}
      className="font-semibold text-primary hover:underline"
    >
      {member.name}
    </Link>
  ) : (
    <span className="font-semibold text-foreground">{member.name}</span>
  );

const BoardCard = ({ board }: { board: TeamOfDecadeBoard }) => {
  const members = sortMembers(board.members);
  return (
    <div className="bg-card border border-border rounded-md overflow-hidden shadow-lg">
      <div className="bg-primary text-primary-foreground px-4 md:px-6 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-serif font-bold uppercase tracking-wider text-sm truncate">
            {board.title}
          </div>
          {(board.teamLabel || board.periodLabel) && (
            <div className="text-xs opacity-90 mt-0.5">
              {[board.teamLabel, board.periodLabel]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </div>
        <span className="text-xs whitespace-nowrap">
          {members.length} {members.length === 1 ? "player" : "players"}
        </span>
      </div>
      {board.subtitle && (
        <p className="px-4 md:px-6 pt-4 text-sm italic text-muted-foreground m-0">
          {board.subtitle}
        </p>
      )}
      {members.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground italic text-sm">
          No players selected yet.
        </div>
      ) : (
        <div className="p-4 md:p-6">
          <div className="divide-y divide-border/60">
            {members.map((m, i) => {
              const badges = memberBadges(m);
              return (
                <div
                  key={m.id}
                  className="flex items-baseline gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="font-mono font-bold text-primary w-6 shrink-0 text-right">
                    {i + 1}
                  </span>
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0">
                    <MemberName member={m} />
                    {badges.map((b) => (
                      <span
                        key={b}
                        className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary"
                      >
                        {b}
                      </span>
                    ))}
                    {m.role && (
                      <span className="text-xs text-muted-foreground italic">
                        {m.role}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export function TeamOfDecadeTab() {
  const { data: boards, isLoading } = useListTeamOfDecadeBoards();

  const sorted = [...(boards ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
  );

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-md p-6 shadow-md">
        <h2 className="text-2xl md:text-3xl font-serif font-bold text-primary m-0">
          Teams of the Decade
        </h2>
        <div className="w-20 h-[3px] bg-primary mt-3" />
        <p className="text-muted-foreground italic mt-3 mb-0">
          The greatest XIs in Halls Head Cricket Club history — selected to
          honour the finest players of each era.
        </p>
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">
          Loading teams…
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-card border border-border rounded-md p-8 text-center text-muted-foreground italic">
          No Teams of the Decade have been published yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {sorted.map((b) => (
            <BoardCard key={b.id} board={b} />
          ))}
        </div>
      )}
    </div>
  );
}
