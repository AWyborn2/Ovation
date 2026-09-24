import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListJuniorPlayersBySenior,
  getListJuniorPlayersBySeniorQueryKey,
  useGetJuniorPlayer,
  getGetJuniorPlayerQueryKey,
} from "@workspace/api-client-react";
import type { PlayerMatchLine, PlayerPremiership, Stat } from "@workspace/api-client-react";
import { Crown, Trophy } from "lucide-react";
import { GradeBadge } from "@/components/grade-badge";
import { seasonLabel } from "@/lib/use-stats-view";

/**
 * The profile's tabular history, kept from the previous page beneath the new
 * charts: premierships, match by match (following the season bar's range),
 * the per-grade career table with its Edit links, and the separate junior
 * career. Nothing here is recomputed; it renders the API rows as they come.
 */

const CARD = "rounded-[16px] border bg-card p-[22px]";
const H2 = "m-0 font-serif text-[26px] font-bold uppercase leading-none";

const formatPremDate = (d: string | null | undefined) => {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

export function PremiershipsCard({
  premierships,
  premsWon,
  premsCaptained,
}: {
  premierships: PlayerPremiership[];
  premsWon: number;
  premsCaptained: number;
}) {
  if (premsWon <= 0) return null;
  return (
    <section className={CARD}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className={`${H2} flex items-center gap-2`}>
          <Trophy className="h-5 w-5 text-primary-text" aria-hidden />
          Premierships won
        </h2>
        <Link
          href="/premierships"
          className="text-xs uppercase tracking-widest text-primary-text hover:underline"
        >
          View board →
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded bg-primary/15 px-3 py-1.5 font-bold text-primary-text">
          <Trophy className="h-4 w-4" aria-hidden />
          <span className="text-lg tabular-nums">{premsWon}</span>
          <span className="text-xs uppercase tracking-wider">won</span>
        </div>
        {premsCaptained > 0 && (
          <div className="inline-flex items-center gap-2 rounded bg-primary px-3 py-1.5 font-bold text-primary-foreground">
            <Crown className="h-4 w-4" aria-hidden />
            <span className="text-lg tabular-nums">{premsCaptained}</span>
            <span className="text-xs uppercase tracking-wider">captained</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {premierships.map((p) => (
          <div key={p.id} className="flex items-start gap-3 rounded-md border bg-background/60 p-3">
            <div className="shrink-0 text-center">
              <div className="text-lg font-bold leading-none tabular-nums text-primary-text">
                {p.year}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {p.grade}
              </div>
            </div>
            <div className="min-w-0 text-xs">
              {p.competition && p.competition !== p.grade.toUpperCase() && (
                <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                  {p.competition}
                </div>
              )}
              {p.result && (
                <div className="font-semibold leading-snug text-foreground/90">{p.result}</div>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-muted-foreground">
                {p.venue && <span>{p.venue}</span>}
                {p.matchDate && <span>· {formatPremDate(p.matchDate)}</span>}
                {p.isCaptain && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                    <Crown className="h-3 w-3" aria-hidden /> Captain
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Every match in the season bar's range, newest first, with a grade filter. */
export function MatchByMatch({
  matches,
  rangeLabel,
}: {
  matches: PlayerMatchLine[];
  rangeLabel: string;
}) {
  const [grade, setGrade] = useState("all");
  const grades = useMemo(() => [...new Set(matches.map((m) => m.grade))].sort(), [matches]);
  const rows = grade === "all" ? matches : matches.filter((m) => m.grade === grade);
  if (matches.length === 0) return null;
  return (
    <section className={CARD}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className={H2}>Match by match</h2>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          {rangeLabel} · {rows.length} game{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      {grades.length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <label
            htmlFor="match-grade-filter"
            className="text-xs font-bold uppercase tracking-widest text-primary-text"
          >
            Grade
          </label>
          <select
            id="match-grade-filter"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="h-9 rounded-full border bg-muted px-3.5 text-sm font-medium text-foreground"
          >
            <option value="all">All grades</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="max-h-[520px] overflow-auto">
        <table className="sticky-id-col w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="p-3 text-left font-medium">Season</th>
              <th className="p-3 text-left font-medium">Rnd</th>
              <th className="p-3 text-left font-medium">Grade</th>
              <th className="p-3 text-left font-medium">Opponent</th>
              <th className="p-3 text-left font-medium">Batting</th>
              <th className="p-3 text-left font-medium">Bowling</th>
              <th className="p-3 text-left font-medium">Field</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const field = [
                m.catches ? `${m.catches}c` : "",
                m.stumpings ? `${m.stumpings}st` : "",
                m.runOuts ? `${m.runOuts}ro` : "",
              ].filter(Boolean);
              const batting = m.innings?.length
                ? m.innings
                    .map(
                      (i) =>
                        `${i.runs ?? 0}${i.notOut ? "*" : ""}${i.balls != null ? ` (${i.balls})` : ""}`,
                    )
                    .join(" & ")
                : m.batted
                  ? `${m.runs ?? 0}${m.notOut ? "*" : ""}${m.balls != null ? ` (${m.balls})` : ""}`
                  : "—";
              return (
                <tr
                  key={m.matchId}
                  className="border-b transition-colors last:border-0 hover:bg-muted/50"
                >
                  <td className="p-3 tabular-nums">
                    {m.season != null ? seasonLabel(m.season) : "—"}
                  </td>
                  <td className="p-3 tabular-nums">{m.stage ?? m.round ?? "—"}</td>
                  <td className="p-3">
                    <GradeBadge grade={m.grade} size="sm" />
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/matches/${m.matchId}`}
                      className="text-primary-text hover:underline"
                    >
                      {m.opponent ?? "—"}
                    </Link>
                  </td>
                  <td className="p-3 tabular-nums">{batting}</td>
                  <td className="p-3 tabular-nums">
                    {m.bowled
                      ? `${m.wickets ?? 0}/${m.runsConceded ?? 0}${m.overs ? ` (${m.overs})` : ""}`
                      : "—"}
                  </td>
                  <td className="p-3 tabular-nums">{field.length ? field.join(" ") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Career by grade (the stored per-grade rows) with the Edit links. */
export function GradeCareerTable({ stats }: { stats: Stat[] }) {
  const rows = stats.filter((s) => s.grade !== "CLUB TOTAL");
  return (
    <section className={CARD}>
      <h2 className={`${H2} mb-4`}>Career by grade</h2>
      <div className="overflow-x-auto">
        <table className="sticky-id-col w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="p-3 text-left font-medium">Grade</th>
              <th className="p-3 text-right font-medium">Mat</th>
              <th className="p-3 text-right font-medium">Inn</th>
              <th className="p-3 text-right font-medium">NO</th>
              <th className="p-3 text-right font-medium">Runs</th>
              <th className="p-3 text-right font-medium">HS</th>
              <th className="p-3 text-right font-medium">Avg</th>
              <th className="p-3 text-right font-medium">100s</th>
              <th className="p-3 text-right font-medium">50s</th>
              <th className="p-3 text-right font-medium">Wkts</th>
              <th className="p-3 text-right font-medium">Runs</th>
              <th className="p-3 text-right font-medium">Avg</th>
              <th className="p-3 text-right font-medium">BB</th>
              <th className="p-3 text-right font-medium">5WI</th>
              <th className="p-3 text-right font-medium">Ct</th>
              <th className="p-3 text-right font-medium">St</th>
              <th className="p-3 text-right font-medium">RO</th>
              <th className="p-3 text-right font-medium">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((stat) => (
              <tr
                key={stat.id}
                className="border-b transition-colors last:border-0 hover:bg-muted/50"
              >
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <GradeBadge grade={stat.grade} size="sm" />
                    <span className="font-semibold text-primary-text">{stat.grade}</span>
                  </div>
                </td>
                <td className="p-3 text-right tabular-nums">{stat.games || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.innings || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.notOuts || "-"}</td>
                <td className="p-3 text-right font-bold tabular-nums">{stat.runs || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.highScore || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.batAvg?.toFixed(2) || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.hundreds || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.fifties || "-"}</td>
                <td className="p-3 text-right font-bold tabular-nums">{stat.wickets || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.runsConceded || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.bowlAvg?.toFixed(2) || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.bestBowling || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.fiveWickets || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.catches || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.stumpings || "-"}</td>
                <td className="p-3 text-right tabular-nums">{stat.runOuts || "-"}</td>
                <td className="p-3 text-right">
                  <Link
                    href={`/stats/${stat.id}`}
                    className="text-sm text-primary-text hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={18} className="p-8 text-center text-muted-foreground">
                  No stats recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Junior career cross-section, shown only when an admin has linked this senior
 * player to junior participant profile(s). Junior figures are fetched from the
 * juniors API in the browser (the senior API never reads junior tables) and
 * rendered as a clearly-labelled SEPARATE section — junior and senior records
 * are never combined into any total, and this section never feeds the
 * milestones or any senior chart.
 */
export function JuniorCareerSection({ playerId }: { playerId: number }) {
  const { data: links } = useListJuniorPlayersBySenior(playerId, {
    query: { queryKey: getListJuniorPlayersBySeniorQueryKey(playerId) },
  });
  if (!links?.length) return null;
  return (
    <section className={CARD}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className={H2}>Junior career</h2>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Kept separate from senior records
        </span>
      </div>
      <div className="space-y-4">
        {links.map((l) => (
          <JuniorIdentitySummary key={l.participantId} participantId={l.participantId} />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Junior records are kept completely separate from senior records and are never combined into
        any career figure.
      </p>
    </section>
  );
}

function JuniorIdentitySummary({ participantId }: { participantId: string }) {
  const { data: junior } = useGetJuniorPlayer(participantId, {
    query: { queryKey: getGetJuniorPlayerQueryKey(participantId) },
  });
  if (!junior) return null;
  const tiles: { label: string; value: string | number }[] = [
    { label: "Matches", value: junior.batting.matches },
    { label: "Runs", value: junior.batting.runs },
    { label: "High Score", value: junior.batting.highScore ?? "—" },
    { label: "Wickets", value: junior.bowling.wickets },
    {
      label: "Best Bowling",
      value:
        junior.bowling.bestWickets != null
          ? `${junior.bowling.bestWickets}/${junior.bowling.bestRuns ?? "—"}`
          : "—",
    },
  ];
  return (
    <div className="rounded-md border p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold text-primary-text">{junior.displayName}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {junior.firstSeason && junior.lastSeason
              ? `${junior.firstSeason} – ${junior.lastSeason}`
              : (junior.firstSeason ?? "")}
            {junior.teams ? ` · ${junior.teams}` : ""}
          </span>
        </div>
        <Link
          href={`/juniors/players/${junior.participantId}`}
          className="text-sm text-primary-text hover:underline"
        >
          View junior profile →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md border bg-background/60 p-2 text-center">
            <div className="font-serif text-lg font-bold text-primary-text">{t.value}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              {t.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
