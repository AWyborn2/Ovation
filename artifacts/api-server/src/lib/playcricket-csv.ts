import { parse } from "csv-parse/sync";
import { z } from "zod/v4";

/**
 * Map PlayCricket grade names (as they appear in the CSV `Grade name` column)
 * to our club-internal grade names. Add entries here as new grades are imported.
 */
export const PLAYCRICKET_GRADE_MAP: Record<string, string> = {
  "A Grade Wyllie Cup": "A Grade",
  "B Grade": "B Grade",
  "C Grade": "C Grade",
  "D Grade": "D Grade",
  "E Grade": "E Grade",
  "F Grade": "F Grade",
  "Female A Grade": "Female A Grade",
  "Female B Grade": "Female B Grade",
  "PPL": "PPL",
  "Colts": "Colts",
};

const EXPECTED_HEADERS = [
  "Player name",
  "Club Name",
  "Matches played",
  "Innings",
  "Batting Aggregate",
  "Not outs",
  "50s scored",
  "100s scored",
  "High Score",
  "High Score Dismissal Status",
  "Wickets",
  "Runs scored",
  "5 Wickets",
  "Bowling Best Innings",
  "Total Catches",
  "Run Outs Unassisted",
  "Run Outs Assisted",
  "Stumpings",
  "Grade name",
] as const;

const rowSchema = z.object({
  "Player name": z.string().min(1),
  "Matches played": z.string(),
  "Innings": z.string(),
  "Batting Aggregate": z.string(),
  "Not outs": z.string(),
  "50s scored": z.string(),
  "100s scored": z.string(),
  "High Score": z.string(),
  "High Score Dismissal Status": z.string(),
  "Wickets": z.string(),
  "Runs scored": z.string(),
  "5 Wickets": z.string(),
  "Bowling Best Innings": z.string(),
  "Total Catches": z.string(),
  "Run Outs Unassisted": z.string(),
  "Run Outs Assisted": z.string(),
  "Stumpings": z.string(),
  "Grade name": z.string().min(1),
});

const num = (s: string): number | null => {
  if (s == null) return null;
  const t = s.trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const numOr0 = (s: string): number => num(s) ?? 0;

function parseBestBowling(raw: string): string | null {
  if (!raw) return null;
  const t = raw.trim();
  // PlayCricket format: "6--25" (wickets--runs), or "--" / "0--0" when none.
  const m = t.match(/^(\d+)\s*-+\s*(\d+)$/);
  if (!m) return null;
  const wkts = parseInt(m[1], 10);
  const runs = parseInt(m[2], 10);
  if (wkts === 0) return null;
  return `${wkts}/${runs}`;
}

function splitName(raw: string): { surname: string; givenName: string } {
  const parts = raw.split(",").map((p) => p.trim());
  if (parts.length >= 2) {
    return { surname: parts[0], givenName: parts.slice(1).join(", ") };
  }
  return { surname: raw.trim(), givenName: "" };
}

export type ParsedCsvRow = {
  surname: string;
  givenName: string;
  csvGrade: string;
  grade: string;
  games: number;
  innings: number;
  notOuts: number;
  runs: number;
  highScore: string | null;
  fifties: number;
  hundreds: number;
  wickets: number;
  runsConceded: number;
  fiveWickets: number;
  bestBowling: string | null;
  catches: number;
  stumpings: number;
  runOuts: number;
};

export type ParseResult = {
  rows: ParsedCsvRow[];
  grades: string[];
  unmappedGrades: string[];
};

export function parsePlaycricketCsv(content: string): ParseResult {
  // csv-parse handles BOM, quoted fields, and the trailing-newline edge case.
  const records: unknown[] = parse(content, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    throw new Error("CSV is empty");
  }

  // Validate headers.
  const firstRow = records[0] as Record<string, unknown>;
  const missing = EXPECTED_HEADERS.filter((h) => !(h in firstRow));
  if (missing.length > 0) {
    throw new Error(
      `CSV is missing expected columns: ${missing.join(", ")}. ` +
        `Make sure this is a PlayCricket "Combined Batting/Bowling/Fielding" export.`,
    );
  }

  const rows: ParsedCsvRow[] = [];
  const seenGrades = new Set<string>();
  const unmapped = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const parsed = rowSchema.safeParse(records[i]);
    if (!parsed.success) {
      throw new Error(`Row ${i + 2}: ${parsed.error.message}`);
    }
    const r = parsed.data;

    const { surname, givenName } = splitName(r["Player name"]);
    if (!surname) continue;

    const csvGrade = r["Grade name"].trim();
    const grade = PLAYCRICKET_GRADE_MAP[csvGrade];
    if (!grade) {
      unmapped.add(csvGrade);
      continue;
    }
    seenGrades.add(grade);

    const highScoreRaw = r["High Score"].trim();
    const dismissalNotOut = r["High Score Dismissal Status"].trim().toLowerCase() === "true";
    const highScore =
      highScoreRaw === "" || highScoreRaw === "-"
        ? null
        : dismissalNotOut
          ? `${highScoreRaw}*`
          : highScoreRaw;

    rows.push({
      surname,
      givenName,
      csvGrade,
      grade,
      games: numOr0(r["Matches played"]),
      innings: numOr0(r["Innings"]),
      notOuts: numOr0(r["Not outs"]),
      runs: numOr0(r["Batting Aggregate"]),
      highScore,
      fifties: numOr0(r["50s scored"]),
      hundreds: numOr0(r["100s scored"]),
      wickets: numOr0(r["Wickets"]),
      runsConceded: numOr0(r["Runs scored"]),
      fiveWickets: numOr0(r["5 Wickets"]),
      bestBowling: parseBestBowling(r["Bowling Best Innings"]),
      catches: numOr0(r["Total Catches"]),
      stumpings: numOr0(r["Stumpings"]),
      runOuts: numOr0(r["Run Outs Unassisted"]) + numOr0(r["Run Outs Assisted"]),
    });
  }

  return {
    rows,
    grades: Array.from(seenGrades),
    unmappedGrades: Array.from(unmapped),
  };
}
