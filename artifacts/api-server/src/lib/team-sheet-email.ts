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
