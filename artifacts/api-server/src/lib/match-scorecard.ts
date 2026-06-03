import * as XLSX from "xlsx";
import { PLAYCRICKET_GRADE_MAP } from "./playcricket-csv";

/**
 * Parser for a single-match PlayCricket "scorecard" .xlsx export.
 *
 * Layout (one sheet):
 *   row 0   : "<Competition> <YYYY/YY>  —  Round N"   (title)
 *   rows 1-3: "Date" / "Venue" / "Result" label in col A, value in col C
 *   then two innings blocks, each:
 *     team header  : "  <Team Name>  —  <score>"   (col A; no score if abandoned)
 *     "Batsman" hdr: A=Batsman, C=Dismissal, D=R, E=B, F=4s, G=6s, H=SR
 *     batsmen rows ...
 *     "Bowler" hdr : A=Bowler, C=O, D=M, E=R, F=W, G=Econ, H=Wd, I=NB
 *     bowler rows ...
 *
 * HHCC batting = batsmen in the Halls Head block.
 * HHCC bowling = bowlers in the OPPOSITION block.
 * HHCC fielding = derived from the dismissal text of the OPPOSITION block's
 *   batsmen (initial + surname → matched against the HHCC roster).
 */

type Cell = string | number | boolean | null;
type Row = Cell[];

export type ParsedMatchPlayer = {
  surname: string;
  givenName: string;
  batted: boolean;
  battingPos: number | null;
  runs: number | null;
  balls: number | null;
  fours: number | null;
  sixes: number | null;
  notOut: boolean;
  dismissal: string | null;
  bowled: boolean;
  overs: string | null;
  maidens: number | null;
  runsConceded: number | null;
  wickets: number | null;
  wides: number | null;
  noBalls: number | null;
  catches: number;
  stumpings: number;
  runOuts: number;
};

/**
 * A display-only line for an opposition player. These are NEVER created as club
 * players and never contribute to any club aggregate — the name is plain text.
 */
export type ParsedOppositionLine = {
  name: string;
  batted: boolean;
  battingPos: number | null;
  runs: number | null;
  balls: number | null;
  fours: number | null;
  sixes: number | null;
  notOut: boolean;
  dismissal: string | null;
  bowled: boolean;
  overs: string | null;
  maidens: number | null;
  runsConceded: number | null;
  wickets: number | null;
  wides: number | null;
  noBalls: number | null;
  catches: number;
  stumpings: number;
  runOuts: number;
};

export type ParsedMatch = {
  competition: string | null;
  grade: string | null;
  season: number | null;
  round: number | null;
  matchDate: string | null;
  venue: string | null;
  result: string | null;
  abandoned: boolean;
  opponent: string | null;
  hhccScore: string | null;
  opponentScore: string | null;
  players: ParsedMatchPlayer[];
  opposition: ParsedOppositionLine[];
  warnings: string[];
};

const text = (v: Cell): string => (v == null ? "" : String(v)).trim();

const numOrNull = (v: Cell): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v).replace(/\*/g, "").trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Map the scorecard competition name to our club-internal grade name. */
export function competitionToGrade(competition: string): string | null {
  const c = competition.trim();
  if (PLAYCRICKET_GRADE_MAP[c]) return PLAYCRICKET_GRADE_MAP[c];
  const lc = c.toLowerCase();
  const female = lc.match(/female\s+([ab])\s+grade/);
  if (female) return `Female ${female[1].toUpperCase()} Grade`;
  const g = lc.match(/\b([a-f])\s+grade/);
  if (g) return `${g[1].toUpperCase()} Grade`;
  if (/\bppl\b/.test(lc)) return "PPL";
  if (/\bcolts\b/.test(lc)) return "Colts";
  return null;
}

function excelSerialToISO(serial: number): string {
  // Excel epoch is 1899-12-30; 25569 days from there to the Unix epoch.
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function parseDate(v: Cell): string | null {
  if (v == null) return null;
  if (typeof v === "number") return excelSerialToISO(v);
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

function splitFullName(raw: string): { surname: string; givenName: string } {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { surname: parts[0] ?? "", givenName: "" };
  return { surname: parts[parts.length - 1], givenName: parts.slice(0, -1).join(" ") };
}

const isHHCC = (name: string): boolean => /halls\s*head/i.test(name);

function parseTeamHeader(c0: string): { name: string; score: string | null } {
  const parts = c0.split(/\s*—\s*/);
  return { name: parts[0].trim(), score: parts.length > 1 ? parts[1].trim() : null };
}

type Batsman = {
  surname: string;
  givenName: string;
  dismissal: string | null;
  runs: number;
  balls: number | null;
  fours: number | null;
  sixes: number | null;
  notOut: boolean;
  pos: number;
};
type Bowler = {
  surname: string;
  givenName: string;
  overs: string | null;
  maidens: number | null;
  runsConceded: number;
  wickets: number;
  wides: number | null;
  noBalls: number | null;
};
type Block = {
  name: string;
  score: string | null;
  isHHCC: boolean;
  batsmen: Batsman[];
  bowlers: Bowler[];
};

type FieldingRef = { type: "c" | "st" | "ro"; initial: string; surname: string };

/** Pull fielder references out of an opposition batsman's dismissal text. */
function parseFielders(dismissal: string): FieldingRef[] {
  const s = dismissal.trim();
  const refs: FieldingRef[] = [];
  const resolve = (name: string, type: FieldingRef["type"]) => {
    const tokens = name.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return;
    const surname = tokens[tokens.length - 1];
    const initial = tokens[0][0] ?? "";
    if (!surname || !initial) return;
    refs.push({ type, initial, surname });
  };

  let m: RegExpMatchArray | null;
  if ((m = s.match(/^c\s*&\s*b:?\s*(.+)$/i))) {
    resolve(m[1], "c");
  } else if ((m = s.match(/^c:?\s*(.+?)\s+b:?\s+.+$/i))) {
    resolve(m[1], "c");
  } else if ((m = s.match(/^st:?\s*(.+?)\s+b:?\s+.+$/i))) {
    resolve(m[1], "st");
  } else if (/run\s*out/i.test(s)) {
    m = s.match(/run\s*out:?\s*(.+)$/i);
    const names = m ? m[1].split(/\s*\/\s*/) : [];
    for (const n of names) if (text(n)) resolve(n, "ro");
  }
  return refs;
}

export function parseMatchScorecard(buffer: Buffer): ParsedMatch {
  const warnings: string[] = [];
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Workbook has no sheets");
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
  if (rows.length === 0) throw new Error("Scorecard is empty");

  // --- Title: "<Competition> <YYYY/YY>  —  Round N" ---
  const title = text(rows[0]?.[0]);
  if (!title) throw new Error("Missing scorecard title in cell A1");
  const [leftRaw, rightRaw = ""] = title.split(/\s*—\s*/);
  const seasonMatch = leftRaw.match(/(\d{4})\/(\d{2})/);
  const season = seasonMatch ? parseInt(seasonMatch[1], 10) : null;
  const competition = leftRaw.replace(/\d{4}\/\d{2}/, "").replace(/\s+/g, " ").trim() || null;
  const roundMatch = rightRaw.match(/(\d+)/);
  const round = roundMatch ? parseInt(roundMatch[1], 10) : null;
  const grade = competition ? competitionToGrade(competition) : null;
  if (competition && !grade) {
    warnings.push(`Could not map competition "${competition}" to a club grade.`);
  }

  // --- Header section: Date / Venue / Result ---
  let matchDate: string | null = null;
  let venue: string | null = null;
  let result: string | null = null;
  let headerEnd = 1;
  for (let i = 1; i < rows.length; i++) {
    const label = text(rows[i]?.[0]).toLowerCase();
    if (label === "date") {
      matchDate = parseDate(rows[i]?.[2] ?? null);
      headerEnd = i + 1;
    } else if (label === "venue") {
      venue = text(rows[i]?.[2]) || null;
      headerEnd = i + 1;
    } else if (label === "result") {
      result = text(rows[i]?.[2]) || null;
      headerEnd = i + 1;
    }
  }
  const abandoned = /abandon/i.test(result ?? "");

  // --- Innings blocks ---
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let mode: "bat" | "bowl" | null = null;
  for (let i = headerEnd; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const c0 = text(row[0]);
    if (!c0) continue;
    const lc = c0.toLowerCase();
    if (lc === "batsman") {
      mode = "bat";
      continue;
    }
    if (lc === "bowler") {
      mode = "bowl";
      continue;
    }
    const hasStats = [2, 3, 4, 5, 6, 7, 8].some((ci) => text(row[ci]) !== "");

    // A team header is a non-empty col-A row with no stat cells, appearing at the
    // start or right after a bowler table. A no-stat row while in "bat" mode is an
    // abandoned-match batsman (names only), not a new team.
    if (!hasStats && (mode === null || mode === "bowl")) {
      const { name, score } = parseTeamHeader(c0);
      cur = { name, score, isHHCC: isHHCC(name), batsmen: [], bowlers: [] };
      blocks.push(cur);
      mode = null;
      continue;
    }
    if (!cur) continue;

    if (mode === "bat") {
      const { surname, givenName } = splitFullName(c0);
      const dismissal = text(row[2]) || null;
      const runsCell = text(row[3]);
      const notOut = /\*/.test(runsCell) || /not\s*out/i.test(dismissal ?? "");
      cur.batsmen.push({
        surname,
        givenName,
        dismissal,
        runs: numOrNull(row[3]) ?? 0,
        balls: numOrNull(row[4]),
        fours: numOrNull(row[5]),
        sixes: numOrNull(row[6]),
        notOut,
        pos: cur.batsmen.length + 1,
      });
    } else if (mode === "bowl") {
      const { surname, givenName } = splitFullName(c0);
      cur.bowlers.push({
        surname,
        givenName,
        overs: text(row[2]) || null,
        maidens: numOrNull(row[3]),
        runsConceded: numOrNull(row[4]) ?? 0,
        wickets: numOrNull(row[5]) ?? 0,
        wides: numOrNull(row[7]),
        noBalls: numOrNull(row[8]),
      });
    }
  }

  const hhccBlock = blocks.find((b) => b.isHHCC) ?? null;
  const oppBlock = blocks.find((b) => !b.isHHCC) ?? null;

  const opponent = oppBlock?.name ?? null;
  const hhccScore = hhccBlock?.score ?? null;
  const opponentScore = oppBlock?.score ?? null;

  // Abandoned matches contribute nothing to totals — store header only.
  if (abandoned) {
    return {
      competition,
      grade,
      season,
      round,
      matchDate,
      venue,
      result,
      abandoned: true,
      opponent,
      hhccScore,
      opponentScore,
      players: [],
      opposition: [],
      warnings,
    };
  }

  // --- Merge HHCC batting + bowling + fielding into one line per player ---
  const lineByKey = new Map<string, ParsedMatchPlayer>();
  const keyFor = (surname: string, givenName: string) =>
    `${surname.toLowerCase()}|${givenName.toLowerCase()}`;
  const blank = (surname: string, givenName: string): ParsedMatchPlayer => ({
    surname,
    givenName,
    batted: false,
    battingPos: null,
    runs: null,
    balls: null,
    fours: null,
    sixes: null,
    notOut: false,
    dismissal: null,
    bowled: false,
    overs: null,
    maidens: null,
    runsConceded: null,
    wickets: null,
    wides: null,
    noBalls: null,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
  });
  const ensure = (surname: string, givenName: string): ParsedMatchPlayer => {
    const k = keyFor(surname, givenName);
    let line = lineByKey.get(k);
    if (!line) {
      line = blank(surname, givenName);
      lineByKey.set(k, line);
    }
    return line;
  };

  if (hhccBlock) {
    for (const b of hhccBlock.batsmen) {
      const line = ensure(b.surname, b.givenName);
      line.batted = true;
      line.battingPos = b.pos;
      line.runs = b.runs;
      line.balls = b.balls;
      line.fours = b.fours;
      line.sixes = b.sixes;
      line.notOut = b.notOut;
      line.dismissal = b.dismissal;
    }
  }
  if (oppBlock) {
    for (const bw of oppBlock.bowlers) {
      const line = ensure(bw.surname, bw.givenName);
      line.bowled = true;
      line.overs = bw.overs;
      line.maidens = bw.maidens;
      line.runsConceded = bw.runsConceded;
      line.wickets = bw.wickets;
      line.wides = bw.wides;
      line.noBalls = bw.noBalls;
    }
  }

  // Fielding index keyed by givenInitial+surname over the known HHCC roster.
  const fieldingIndex = new Map<string, ParsedMatchPlayer>();
  for (const line of lineByKey.values()) {
    const initial = line.givenName[0]?.toLowerCase() ?? "";
    fieldingIndex.set(`${initial}|${line.surname.toLowerCase()}`, line);
  }
  if (oppBlock) {
    for (const ob of oppBlock.batsmen) {
      if (!ob.dismissal) continue;
      for (const ref of parseFielders(ob.dismissal)) {
        const line = fieldingIndex.get(
          `${ref.initial.toLowerCase()}|${ref.surname.toLowerCase()}`,
        );
        if (!line) {
          warnings.push(
            `Unmatched fielder "${ref.initial} ${ref.surname}" in dismissal "${ob.dismissal}".`,
          );
          continue;
        }
        if (ref.type === "c") line.catches += 1;
        else if (ref.type === "st") line.stumpings += 1;
        else line.runOuts += 1;
      }
    }
  }

  // --- Opposition lines (display only — mirror of the HHCC merge) ---
  // Opposition batting = batsmen in the OPPOSITION block.
  // Opposition bowling = bowlers in the HHCC block (they bowled to us).
  // Opposition fielding = derived from HHCC batsmen dismissal text.
  const oppByKey = new Map<string, ParsedOppositionLine>();
  const fullName = (surname: string, givenName: string) =>
    `${givenName} ${surname}`.trim();
  const oppBlank = (name: string): ParsedOppositionLine => ({
    name,
    batted: false,
    battingPos: null,
    runs: null,
    balls: null,
    fours: null,
    sixes: null,
    notOut: false,
    dismissal: null,
    bowled: false,
    overs: null,
    maidens: null,
    runsConceded: null,
    wickets: null,
    wides: null,
    noBalls: null,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
  });
  const oppEnsure = (surname: string, givenName: string): ParsedOppositionLine => {
    const k = keyFor(surname, givenName);
    let line = oppByKey.get(k);
    if (!line) {
      line = oppBlank(fullName(surname, givenName));
      oppByKey.set(k, line);
    }
    return line;
  };

  if (oppBlock) {
    for (const b of oppBlock.batsmen) {
      const line = oppEnsure(b.surname, b.givenName);
      line.batted = true;
      line.battingPos = b.pos;
      line.runs = b.runs;
      line.balls = b.balls;
      line.fours = b.fours;
      line.sixes = b.sixes;
      line.notOut = b.notOut;
      line.dismissal = b.dismissal;
    }
  }
  if (hhccBlock) {
    for (const bw of hhccBlock.bowlers) {
      const line = oppEnsure(bw.surname, bw.givenName);
      line.bowled = true;
      line.overs = bw.overs;
      line.maidens = bw.maidens;
      line.runsConceded = bw.runsConceded;
      line.wickets = bw.wickets;
      line.wides = bw.wides;
      line.noBalls = bw.noBalls;
    }
  }

  // Opposition fielding index keyed by givenInitial+surname.
  const oppFieldingIndex = new Map<string, ParsedOppositionLine>();
  for (const line of oppByKey.values()) {
    const initial = line.name.split(/\s+/)[0]?.[0]?.toLowerCase() ?? "";
    const surname = line.name.split(/\s+/).pop()?.toLowerCase() ?? "";
    oppFieldingIndex.set(`${initial}|${surname}`, line);
  }
  if (hhccBlock) {
    for (const hb of hhccBlock.batsmen) {
      if (!hb.dismissal) continue;
      for (const ref of parseFielders(hb.dismissal)) {
        const fk = `${ref.initial.toLowerCase()}|${ref.surname.toLowerCase()}`;
        let line = oppFieldingIndex.get(fk);
        if (!line) {
          // A fielder who neither batted nor bowled for the opposition; only the
          // initial + surname is known from the dismissal text.
          line = oppBlank(`${ref.initial} ${ref.surname}`);
          const k = keyFor(ref.surname, ref.initial);
          oppByKey.set(k, line);
          oppFieldingIndex.set(fk, line);
        }
        if (ref.type === "c") line.catches += 1;
        else if (ref.type === "st") line.stumpings += 1;
        else line.runOuts += 1;
      }
    }
  }

  return {
    competition,
    grade,
    season,
    round,
    matchDate,
    venue,
    result,
    abandoned: false,
    opponent,
    hhccScore,
    opponentScore,
    players: Array.from(lineByKey.values()),
    opposition: Array.from(oppByKey.values()),
    warnings,
  };
}
