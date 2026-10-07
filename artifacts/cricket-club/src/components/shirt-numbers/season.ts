import { seasonLabel } from "@/lib/season-label";
import type { RegisterEntryView } from "./api";
import { nameKey } from "./values";

export { seasonLabel };

/**
 * The season start year for a date: Australian seasons run July to June and
 * are named by their start year (2026 = 2026/27), read in Perth time. Mirrors
 * `seasonStartYearFor` in lib/db/src/seasons.ts, which the web app can't import.
 */
const PERTH_OFFSET_MS = 8 * 60 * 60 * 1000;
export function seasonStartYearOf(date: Date): number {
  const perth = new Date(date.getTime() + PERTH_OFFSET_MS);
  const year = perth.getUTCFullYear();
  return perth.getUTCMonth() >= 6 ? year : year - 1;
}

/** The current season's start year. */
export function currentSeasonStartYear(now: Date = new Date()): number {
  return seasonStartYearOf(now);
}

/** Seasons for the picker: every season with a register, plus the current and next season. */
export function seasonOptions(registerSeasons: readonly number[], current: number): number[] {
  return [...new Set([...registerSeasons, current, current + 1])].sort((a, b) => b - a);
}

type Identity = Pick<RegisterEntryView, "name" | "playerId" | "participantId">;

function onRegister(person: Identity, season: readonly Identity[]): boolean {
  if (person.playerId === null && person.participantId === null) {
    const key = nameKey(person.name);
    return season.some((e) => nameKey(e.name) === key);
  }
  return season.some(
    (e) =>
      (person.playerId !== null && e.playerId === person.playerId) ||
      (person.participantId !== null && e.participantId === person.participantId),
  );
}

/**
 * How many entries "Start season" will create: under `carry`, everyone on last
 * season's register who isn't already on this one (the server's
 * `planSeasonStart` rule); under `blank`, none.
 */
export function countSeasonStart(
  previous: readonly Identity[],
  current: readonly Identity[],
  rolloverPolicy: "carry" | "blank",
): number {
  if (rolloverPolicy !== "carry") return 0;
  const present: Identity[] = [...current];
  let created = 0;
  for (const prev of previous) {
    if (onRegister(prev, present)) continue;
    created += 1;
    present.push(prev);
  }
  return created;
}
