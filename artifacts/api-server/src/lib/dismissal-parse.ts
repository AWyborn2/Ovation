/**
 * Dismissal classification for the enriched per-match rows
 * (`GET /players/{id}/matches` → `innings[]`, plan 2026-09-24-002 KTD2).
 *
 * Two text shapes reach us, on both read paths:
 *   - the master-DB / PlayHQ colon format, which is what central
 *     `match_batting.dismissal` and bulk-loaded native `match_player_lines`
 *     carry: "c: A Smith b: J Nguyen", "c&b: D Ellis", "b: K May", "b: ",
 *     "lbw: S Watts", "st: G Pilling b: R Graham", "run out (A Darnley)",
 *     "hit wicket b: S Pope", "not out", "retired not out", "did not bat";
 *   - conventional scorecard notation from admin uploads: "c Smith b Nguyen",
 *     "b J Nguyen", "lbw b Lee", "st Kay b Ali", "c & b Lee", "run out (Jones)".
 *
 * Names are frequently blank ("c:  b: ") or masked ("********") because the
 * source hides private players, and a few carry placeholders ("U Player_1").
 * Those yield `dismissedBy: null`, never a made-up name. Unknown text is
 * "other" — the donut shows "other" rather than guessing.
 *
 * `dismissedBy` is the bowler's surname, normalised (lower-case, initials
 * dropped, curly apostrophes straightened) so the nemesis view can key on
 * (opponent club, surname). There is no bowler id on either path.
 */

export type DismissalType =
  "caught" | "bowled" | "lbw" | "runOut" | "stumped" | "notOut" | "retired" | "other";

export interface ParsedDismissal {
  dismissalType: DismissalType;
  dismissedBy: string | null;
}

/** A leading initial: "J", "J.", "JD", "j". Only dropped when a surname follows. */
const INITIAL = /^(?:[A-Za-z]\.?|[A-Z]{2}\.?|(?:[A-Z]\.){2,})$/;
/** Masked / placeholder names from the source. */
const MASKED = /^\*+$/;
const PLACEHOLDER = /^player_?\d*$/i;

/**
 * Normalise a bowler's name (as printed on a scorecard) to a surname key:
 * "J Nguyen" → "nguyen", "J Van der Westhuizen" → "van der westhuizen",
 * "A O’Brien" → "o'brien". Blank, masked ("********") and placeholder
 * ("U Player_1") names → null.
 */
export function normaliseSurname(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = name
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[()]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned || MASKED.test(cleaned)) return null;
  const tokens = cleaned.split(" ");
  while (tokens.length > 1 && INITIAL.test(tokens[0] ?? "")) tokens.shift();
  const surname = tokens.join(" ").toLowerCase();
  if (!surname || MASKED.test(surname) || PLACEHOLDER.test(surname)) return null;
  return surname;
}

/**
 * The bowler: the text after the last "b:" (colon format), else after the last
 * standalone " b " (conventional notation). Taking the LAST marker keeps a
 * fielder whose initial is "B" ("c: B Cooper b: A Rodier") from being read as
 * the bowler.
 */
function bowlerAfterB(rest: string): string | null {
  const colon = /^.*\bb\s*:\s*(.*)$/i.exec(rest);
  if (colon) return normaliseSurname(colon[1]);
  const plain = /^.*(?:^|\s)b\s+(.*)$/i.exec(rest);
  return plain ? normaliseSurname(plain[1]) : null;
}

/**
 * Parse free dismissal text into a type + bowler surname. Knows nothing about
 * the line's not-out flag — see {@link classifyDismissal} for the combined rule.
 */
export function parseDismissal(raw: string | null | undefined): ParsedDismissal {
  const text = (raw ?? "").trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  const other: ParsedDismissal = { dismissalType: "other", dismissedBy: null };
  if (!lower) return other;

  if (lower.startsWith("not out")) return { dismissalType: "notOut", dismissedBy: null };
  if (lower.startsWith("retired")) return { dismissalType: "retired", dismissedBy: null };
  if (lower.startsWith("run out")) return { dismissalType: "runOut", dismissedBy: null };

  // caught & bowled: "c&b: X", "c & b X", "c and b X"
  let m = /^c\s*(?:&|and)\s*b\b\s*:?\s*(.*)$/i.exec(text);
  if (m) return { dismissalType: "caught", dismissedBy: normaliseSurname(m[1]) };

  // stumped: "st: KEEPER b: BOWLER" / "st Kay b Ali"
  m = /^st\b\s*:?(.*)$/i.exec(text);
  if (m) return { dismissalType: "stumped", dismissedBy: bowlerAfterB(m[1] ?? "") };

  // lbw: "lbw: BOWLER" / "lbw b BOWLER"
  m = /^lbw\b\s*:?\s*(?:b\b\s*:?\s*)?(.*)$/i.exec(text);
  if (m) return { dismissalType: "lbw", dismissedBy: normaliseSurname(m[1]) };

  // caught: "c: CATCHER b: BOWLER" / "c Smith b Nguyen" / "ct Smith b Nguyen"
  m = /^ct?\b\s*:?(.*)$/i.exec(text);
  if (m) return { dismissalType: "caught", dismissedBy: bowlerAfterB(m[1] ?? "") };

  // bowled: "b: BOWLER" / "b J Nguyen" / "bowled X"
  m = /^(?:b|bowled)\b\s*:?\s*(.*)$/i.exec(text);
  if (m) return { dismissalType: "bowled", dismissedBy: normaliseSurname(m[1]) };

  // hit wicket is credited to the bowler but has no bucket of its own.
  m = /^hit wicket\b(.*)$/i.exec(text);
  if (m) return { dismissalType: "other", dismissedBy: bowlerAfterB(m[1] ?? "") };

  return other;
}

/** Central `match_batting.dismissal_type` vocabulary → the API enum. */
const CENTRAL_TYPES: Record<string, DismissalType> = {
  caught: "caught",
  "caught & bowled": "caught",
  bowled: "bowled",
  lbw: "lbw",
  "run out": "runOut",
  stumped: "stumped",
};

/**
 * The per-innings dismissal for the API. `notOut` is the line's own not-out
 * classification (the same one the career totals use), so the type never
 * contradicts the innings/not-out counts:
 *   - a not-out innings is "retired" when the text says so, else "notOut";
 *   - an out innings takes central's structured `dismissal_type` when it has
 *     one of the known values, otherwise the parsed text — and never "notOut".
 * The bowler surname always comes from the text (neither path stores an id);
 * run outs carry none.
 */
export function classifyDismissal(input: {
  text: string | null | undefined;
  notOut: boolean;
  centralType?: string | null;
}): ParsedDismissal {
  const parsed = parseDismissal(input.text);
  if (input.notOut) {
    return {
      dismissalType: parsed.dismissalType === "retired" ? "retired" : "notOut",
      dismissedBy: null,
    };
  }
  const mapped = CENTRAL_TYPES[(input.centralType ?? "").trim().toLowerCase()];
  const dismissalType =
    mapped ?? (parsed.dismissalType === "notOut" ? "other" : parsed.dismissalType);
  return {
    dismissalType,
    dismissedBy: dismissalType === "runOut" ? null : parsed.dismissedBy,
  };
}
