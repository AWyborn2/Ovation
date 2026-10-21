import type { EmailListSettings } from "@workspace/db";
import { sideShape } from "@workspace/scorecard/selection-shape";
import type { TeamSheet } from "./team-sheet";

/** Pure parts of the team-sheet list email (email-distribution-lists). */

export const teamSheetKey = (selectionId: number, version: number): string =>
  `ts:${selectionId}:v${version}`;

/** A team-sheet list's send mode; a list saved without one sends on publish. */
export function sendModeOf(settings: EmailListSettings | null | undefined) {
  return settings?.sendMode ?? "on_publish";
}

/** Whether a re-finalised side is emailed again (absent = on). */
export const resendOnChangeOf = (settings: EmailListSettings | null | undefined): boolean =>
  settings?.resendOnChange !== false;

/** Perth has no daylight saving: club time is always UTC+8. */
const PERTH_OFFSET_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The latest scheduled instant (day of week + HH:MM, Australia/Perth) at or
 * before `now`, when it falls within the last hour, else null. The hourly sweep
 * calls this, so each weekly slot is seen by exactly one run.
 */
export function scheduleDueAt(
  schedule: { dow: number; time: string } | null | undefined,
  now: Date,
): Date | null {
  if (!schedule) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(schedule.time);
  if (!m || schedule.dow < 0 || schedule.dow > 6) return null;
  const local = new Date(now.getTime() + PERTH_OFFSET_MS);
  const back = (local.getUTCDay() - schedule.dow + 7) % 7;
  let at =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), +m[1], +m[2]) -
    PERTH_OFFSET_MS -
    back * DAY_MS;
  if (at > now.getTime()) at -= 7 * DAY_MS;
  return now.getTime() - at < HOUR_MS ? new Date(at) : null;
}

/** Subject and body for a team-sheet email. */
export function teamSheetEmail(
  sheet: TeamSheet,
  updated: boolean,
): { subject: string; text: string } {
  const round = sheet.round ? ` ${sheet.round}` : "";
  const subject = `${updated ? "UPDATED: " : ""}${sheet.clubName} ${sheet.grade}${round} team sheet — ${sheet.homeTeam} v ${sheet.awayTeam}`;
  const shape = sideShape(sheet);
  const lines = [
    `${sheet.grade}${round}: ${sheet.homeTeam} v ${sheet.awayTeam}`,
    `${sheet.date}, ${sheet.startTime}${sheet.venue ? ` at ${sheet.venue}` : ""}`,
    "",
    ...sheet.players.map((p) => {
      const label = shape.twelfthLabel && p.order === shape.size ? "12th" : String(p.order);
      return `${label}. ${p.name}${p.role ? ` (${p.role})` : ""}${p.overseas ? " OS" : ""}`;
    }),
    "",
    updated
      ? "This replaces the team sheet sent earlier. The printable sheet is attached."
      : "The printable team sheet is attached.",
  ];
  return { subject, text: lines.join("\n") };
}

/**
 * Subject and body for several sides in one email (Email all, scheduled): every
 * sheet is a page of the one attached PDF. One sheet reads like a single send.
 */
export function teamSheetsEmail(sheets: TeamSheet[]): { subject: string; text: string } {
  if (sheets.length === 1) return teamSheetEmail(sheets[0], false);
  const rounds = [...new Set(sheets.map((s) => s.round).filter((r): r is string => !!r))];
  const subject = `${sheets[0].clubName} team sheets${rounds.length === 1 ? ` — ${rounds[0]}` : ""} (${sheets.length} sides)`;
  const lines = [
    `${sheets.length} team sheets, one page each in the attached PDF:`,
    "",
    ...sheets.map(
      (s) =>
        `${s.grade}${s.round ? ` ${s.round}` : ""}: ${s.homeTeam} v ${s.awayTeam} — ${s.date}, ${s.startTime}${s.venue ? ` at ${s.venue}` : ""}`,
    ),
  ];
  return { subject, text: lines.join("\n") };
}

/** The attachment's file name: the side's own for one sheet, else the round's. */
export function teamSheetsFileName(sheets: TeamSheet[]): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  if (sheets.length === 1)
    return `${slug(`team-sheet-${sheets[0].grade}-${sheets[0].round ?? ""}`)}.pdf`;
  const rounds = [...new Set(sheets.map((s) => s.round).filter((r): r is string => !!r))];
  return `${slug(`team-sheets-${rounds.length === 1 ? rounds[0] : sheets[0].date}`)}.pdf`;
}

/** Recipients grouped by the exact set of sheets they get: one email (one PDF) per group. */
export function groupRecipients(
  sheetsOf: Map<string, number[]>,
): { ids: number[]; to: string[] }[] {
  const groups = new Map<string, { ids: number[]; to: string[] }>();
  for (const [address, ids] of sheetsOf) {
    const key = ids.join(",");
    const g = groups.get(key) ?? { ids, to: [] };
    g.to.push(address);
    groups.set(key, g);
  }
  return [...groups.values()];
}
