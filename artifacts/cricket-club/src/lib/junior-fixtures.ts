import type { JuniorFixture } from "@workspace/api-client-react";
import { CLUB_TIME_ZONE } from "@workspace/scorecard/card-content";

/** Display helpers for junior fixtures (junior PlayHQ sync plan U6). */

/** "Sat 8 Nov, 8:30 am" in club (Perth) time, whatever the browser's zone; null when unscheduled. */
export function fmtJuniorStart(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: CLUB_TIME_ZONE,
  });
}

/** "Year 4 Blue vs Mandurah" — the club's team (when known) against the opposition. */
export function juniorFixtureTitle(f: Pick<JuniorFixture, "teamName" | "opponentName">): string {
  return `${f.teamName ? `${f.teamName} ` : ""}vs ${f.opponentName ?? "TBC"}`;
}

/** Distinct age groups across the fixtures, in natural order ("Year 4" before "Year 10"). */
export function fixtureAgeGroups(fixtures: readonly JuniorFixture[]): string[] {
  const out: string[] = [];
  for (const f of fixtures) if (f.ageGroup && !out.includes(f.ageGroup)) out.push(f.ageGroup);
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
