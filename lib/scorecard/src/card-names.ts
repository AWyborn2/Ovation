/**
 * Team and competition names as a social card prints them (ADR-010 P1).
 *
 * A square card has room for "SJ Blues", not the PlayHQ team name "SJ Blues
 * Senior Women" or the register name "Harvey Benger Cricket Club Inc". Every
 * name on a card resolves the same way, wherever the card is made:
 *
 *   1. the club's own short name for that club (and grade), when it set one
 *      (`team_name_overrides` / `competition_label_overrides`, tenant-scoped);
 *   2. else the automatic short name below — deterministic and pure, so the
 *      server, the Studio preview and the headless renderer agree;
 *   3. else the raw name, untouched.
 *
 * The server sends the club's overrides as a {@link CardNames} map keyed by
 * {@link cardNameKey} of every spelling a card input might carry; this module
 * applies it. No DB, no DOM.
 */

/** Club-set names for cards, keyed by {@link cardNameKey} of the raw name. */
export interface CardNames {
  /** Raw team / club name key → the club's short name. */
  teams?: Record<string, string> | null;
  /** Raw team / club name key → crest url, for cards whose input has none. */
  crests?: Record<string, string> | null;
  /**
   * Raw team / club name key → the club's own crest choice, which wins over
   * any crest a card input carries: an image url, or "" for the initials badge.
   */
  crestOverrides?: Record<string, string> | null;
  /** Raw competition / grade key → the club's label. */
  competitions?: Record<string, string> | null;
}

/** Comparable form of a raw name: lower case, punctuation and extra spaces dropped. */
export function cardNameKey(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .trim();
}

/** Club-name suffixes that carry no identity on a card ("Cricket Club Inc", "CC"). */
const CLUB_SUFFIX =
  /\s+(?:cricket\s+club(?:\s+inc(?:orporated)?\.?)?|cricket\s+inc\.?|c\.?\s?c\.?|inc(?:orporated)?\.?)$/i;

/**
 * A word that starts the grade / gender / format part of a PlayHQ team name
 * ("Senior", "Women's", "T20", "U21", "Colts", "Over"). Never "Premier"
 * (Willetton Premier) or a lone letter (Mount Lawley D) — those are club names.
 */
const GRADE_WORD =
  /^(?:seniors?|juniors?|female|women'?s?|ladies|men'?s?|male|mixed|t-?20s?|ppl(?:-t20)?|u\d{1,2}s?|under|colts?|over|vets|veterans|masters|year|div(?:ision)?|grade|xi)$/i;

/** A grade letter or ordinal that sits in front of "Grade" / "XI" ("A Grade", "1st XI"). */
const GRADE_LEAD = /^(?:[a-h]|\d{1,2}(?:st|nd|rd|th)|first|second|third|fourth|fifth|one)$/i;

/** "Harvey Benger Cricket Club Inc" → "Harvey Benger" (at most three passes). */
function stripClubSuffix(name: string): string {
  let out = name;
  for (let i = 0; i < 3 && CLUB_SUFFIX.test(out); i++) out = out.replace(CLUB_SUFFIX, "").trim();
  return out;
}

/**
 * The automatic short name for a team or club on a card:
 *
 *   "White Knights Baldivis Cricket Club Inc" → "White Knights Baldivis"
 *   "SJ Blues Senior Women"                   → "SJ Blues"
 *   "Pinjarra Women's C Grade"                → "Pinjarra"
 *   "Subiaco-Floreat - U17"                   → "Subiaco-Floreat"
 *   "Perth Cricket Club (WA)"                 → "Perth"
 *
 * It drops brackets, everything from a " - " separator, the grade / gender /
 * format words and what follows them, then the club suffix. A sponsor in a
 * team name ("Spec Savers Livingston Hornets") stays: that is what the club's
 * own short name is for. Never empty — a name that would strip to nothing
 * comes back as given.
 */
export function autoShortTeamName(name: string | null | undefined): string {
  const original = (name ?? "").replace(/\s+/g, " ").trim();
  if (!original) return "";
  let out = original.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  // WA PlayHQ names: "Melville - 3s", "Gosnells Hawks Gold - Over 60 Men".
  const dash = out.search(/\s+[-–]\s+/);
  if (dash > 0) out = out.slice(0, dash).trim();
  const words = out.split(" ");
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!.replace(/^[-–]+|[-–,]+$/g, "");
    if (/^(?:grade|xi)$/i.test(word) && i > 1 && GRADE_LEAD.test(words[i - 1]!)) {
      out = words.slice(0, i - 1).join(" ");
      break;
    }
    if (
      GRADE_WORD.test(word) ||
      (GRADE_LEAD.test(word) && /^(?:grade|xi|day)$/i.test(words[i + 1] ?? ""))
    ) {
      out = words.slice(0, i).join(" ");
      break;
    }
  }
  out = stripClubSuffix(out.trim());
  return out || stripClubSuffix(original) || original;
}

/**
 * The automatic card label for a competition or grade: numbering ("01. "),
 * a trailing "Competition" and season years go ("ID Athletic PCA Colts
 * Competition" → "ID Athletic PCA Colts"). The grade's own words stay as the
 * club uses them ("Female A Grade"): a different label ("Women's A") is the
 * club's call, set in Social Studio.
 */
export function autoCompetitionLabel(label: string | null | undefined): string {
  const original = (label ?? "").replace(/\s+/g, " ").trim();
  if (!original) return "";
  const out = original
    .replace(/^\d{1,2}\.\s*/, "")
    .replace(/\b(?:summer\s+)?(?:19|20)\d{2}(?:\/\d{2,4})?\b/gi, "")
    .replace(/\s+competition$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return out || original;
}

/** A team name as a card prints it: the club's short name, else the automatic one. */
export function resolveCardTeamName(
  names: CardNames | null | undefined,
  raw: string | null | undefined,
): string {
  const set = names?.teams?.[cardNameKey(raw)];
  return set?.trim() || autoShortTeamName(raw);
}

/** A competition / grade label as a card prints it: the club's label, else the automatic one. */
export function resolveCardCompetition(
  names: CardNames | null | undefined,
  raw: string | null | undefined,
): string {
  const set = names?.competitions?.[cardNameKey(raw)];
  return set?.trim() || autoCompetitionLabel(raw);
}

/**
 * The crest a card shows for a team: the club's own choice (an image, or none
 * for the initials badge), else the input's crest, else the crest the names
 * map has for it. Null → the card shows the monogram.
 */
export function resolveCardCrest(
  names: CardNames | null | undefined,
  raw: string | null | undefined,
  inputUrl?: string | null,
): string | null {
  const chosen = names?.crestOverrides?.[cardNameKey(raw)];
  if (chosen !== undefined && chosen !== null) return chosen || null;
  return inputUrl || cardTeamCrest(names, raw);
}

/** The crest the club's names map has for a team, when its card input carries none. */
export function cardTeamCrest(
  names: CardNames | null | undefined,
  raw: string | null | undefined,
): string | null {
  return names?.crests?.[cardNameKey(raw)] || null;
}

/**
 * The monogram that stands in for a missing crest: the initials of the short
 * name's first two words ("White Knights" → "WK"), or the first two letters of
 * a one-word name ("Melville" → "ME"). Hyphens split words ("Subiaco-Floreat" → "SF").
 */
export function teamMonogram(name: string | null | undefined): string {
  const words = (name ?? "")
    .split(/[\s-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
