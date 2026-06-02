/**
 * Fuzzy player-name matching for scorecard / CSV imports.
 *
 * The roster is keyed by an exact normalised `surname|givenName` key. When an
 * incoming name has no exact match we look for likely the-same-person
 * candidates so the admin can confirm a link instead of silently creating a
 * duplicate player:
 *
 *  - first-name short/long variants ("Mitchell" ↔ "Mitch") via shared prefix
 *  - common nicknames ("Mick" ↔ "Michael") via a small dictionary
 *  - minor surname spelling differences ("Staney" ↔ "Stanley") via edit distance
 *
 * This module is pure (no DB access): callers pass in the roster and act on the
 * returned status. Matching is never applied automatically — `suggested`
 * results are surfaced in the import preview for explicit admin confirmation.
 */

export type RosterPlayer = { id: number; surname: string; givenName: string };

export type NameCandidate = {
  playerId: number;
  surname: string;
  givenName: string;
  /** Human-readable explanation of why this player was suggested. */
  reason: string;
  /** Internal ranking score (higher = more confident). Not part of the API. */
  score: number;
};

export type NameMatch =
  | { status: "matched"; playerId: number; candidates: NameCandidate[] }
  | { status: "suggested"; playerId: null; candidates: NameCandidate[] }
  | { status: "new"; playerId: null; candidates: NameCandidate[] };

/** Lowercase, strip accents and any non-letter characters. */
export function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Normalised first token of a (possibly multi-word) given name. */
function normFirst(s: string): string {
  const first = s.trim().split(/\s+/)[0] ?? "";
  return norm(first);
}

/**
 * Canonical exact-match key for a name. Shared by the matcher and the commit
 * resolver so an admin's resolution lines up with the parsed row it came from.
 */
export function nameKey(surname: string, givenName: string): string {
  return `${norm(surname)}|${norm(givenName)}`;
}

/** Bidirectional nickname groups (all entries normalised, no spaces). */
const NICKNAME_GROUPS: string[][] = [
  ["william", "will", "bill", "billy", "wills", "willy"],
  ["robert", "rob", "bob", "bobby", "robbie"],
  ["richard", "rich", "rick", "ricky", "dick", "richie"],
  ["michael", "mike", "mick", "micky", "mikey"],
  ["james", "jim", "jimmy", "jamie", "jas"],
  ["john", "johnny", "jon", "jack"],
  ["anthony", "tony", "ant"],
  ["thomas", "tom", "tommy"],
  ["daniel", "dan", "danny"],
  ["matthew", "matt", "matty"],
  ["andrew", "andy", "drew"],
  ["benjamin", "ben", "benji", "benny"],
  ["samuel", "sam", "sammy"],
  ["joshua", "josh"],
  ["nicholas", "nick", "nico", "nik", "nicko"],
  ["christopher", "chris", "kris"],
  ["david", "dave", "davey"],
  ["edward", "ed", "eddie", "ted", "ned"],
  ["charles", "charlie", "chuck", "chas"],
  ["joseph", "joe", "joey"],
  ["patrick", "pat", "paddy"],
  ["timothy", "tim", "timmy"],
  ["jonathan", "jon", "jono", "jonny", "jonno"],
  ["frederick", "fred", "freddie", "freddy"],
  ["gregory", "greg", "gregg"],
  ["jeffrey", "jeff", "geoff", "jeffery"],
  ["alexander", "alex", "al", "lex", "xander", "sandy"],
  ["nathaniel", "nathan", "nate"],
  ["zachary", "zach", "zac", "zak"],
  ["dominic", "dom", "dominick"],
  ["maxwell", "max"],
  ["lachlan", "lachie", "loch", "lockie", "lochie"],
  ["cameron", "cam"],
  ["mitchell", "mitch", "mitchy"],
  ["harrison", "harry", "harro"],
  ["jacob", "jake", "jakey"],
  ["bradley", "brad"],
  ["jackson", "jack", "jacko"],
  ["kenneth", "ken", "kenny"],
  ["ronald", "ron", "ronnie"],
  ["donald", "don", "donny"],
  ["raymond", "ray"],
  ["lawrence", "laurie", "larry", "loz", "lawrie"],
  ["vincent", "vince", "vinnie"],
  ["francis", "frank", "fran", "frankie"],
  ["leonard", "leon", "len", "lenny"],
  ["stephen", "steve", "steph", "stevie"],
  ["steven", "steve", "stevie"],
  ["peter", "pete", "petey"],
  ["philip", "phil", "pip"],
  ["phillip", "phil", "pip"],
  ["henry", "harry", "hank", "harro"],
  ["gerald", "gerry", "jerry"],
  ["albert", "al", "bert", "bertie"],
  ["oliver", "ollie", "oli"],
  ["elliott", "elliot", "eli"],
  ["isaac", "ike", "izzy"],
];

/** name -> set of group indexes it belongs to. */
const NICKNAME_INDEX: Map<string, Set<number>> = (() => {
  const m = new Map<string, Set<number>>();
  NICKNAME_GROUPS.forEach((group, i) => {
    for (const n of group) {
      let set = m.get(n);
      if (!set) {
        set = new Set();
        m.set(n, set);
      }
      set.add(i);
    }
  });
  return m;
})();

function sharesNickname(a: string, b: string): boolean {
  const ga = NICKNAME_INDEX.get(a);
  const gb = NICKNAME_INDEX.get(b);
  if (!ga || !gb) return false;
  for (const i of ga) if (gb.has(i)) return true;
  return false;
}

/** One given name is a genuine prefix of the other (>= 3 shared chars). */
function prefixOverlap(a: string, b: string): number {
  if (!a || !b || a === b) return 0;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3) return 0;
  return long.startsWith(short) ? short.length : 0;
}

/** Levenshtein edit distance, bailing out once it exceeds `max`. */
function levenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** Max surname edit distance tolerated, scaled by name length. */
function surnameThreshold(len: number): number {
  if (len <= 3) return 0;
  if (len <= 7) return 1;
  return 2;
}

type Indexed = { p: RosterPlayer; surn: string; givn: string };

export type NameMatcher = {
  resolve: (surname: string, givenName: string) => NameMatch;
};

const MAX_CANDIDATES = 5;

/**
 * Build a reusable matcher from the current roster. Precomputes normalised
 * fields and an exact-key index once so each `resolve` call is cheap.
 */
export function buildNameMatcher(roster: RosterPlayer[]): NameMatcher {
  const indexed: Indexed[] = roster.map((p) => ({
    p,
    surn: norm(p.surname),
    givn: norm(p.givenName),
  }));
  const exact = new Map<string, number>();
  for (const it of indexed) {
    const key = `${it.surn}|${it.givn}`;
    if (!exact.has(key)) exact.set(key, it.p.id);
  }

  const resolve = (surname: string, givenName: string): NameMatch => {
    const surn = norm(surname);
    const givn = norm(givenName);
    const givFirst = normFirst(givenName);

    const exactId = exact.get(`${surn}|${givn}`);
    if (exactId != null) {
      return { status: "matched", playerId: exactId, candidates: [] };
    }

    const candidates: NameCandidate[] = [];
    for (const it of indexed) {
      if (it.p.id === exactId) continue;

      const surEqual = it.surn === surn;
      let surScore = 0;
      let surReason = "";
      if (surEqual) {
        surScore = 50;
      } else {
        const thr = surnameThreshold(Math.min(surn.length, it.surn.length));
        if (thr === 0) continue;
        const dist = levenshtein(surn, it.surn, thr);
        if (dist > thr) continue;
        surScore = 30 - (dist - 1) * 5;
        surReason = `surname ${surname}→${it.p.surname}`;
      }

      const candFirst = normFirst(it.p.givenName);
      let givScore = -1;
      let givReason = "";
      if (givFirst && candFirst) {
        if (givFirst === candFirst) {
          givScore = 50;
        } else if (sharesNickname(givFirst, candFirst)) {
          givScore = 45;
          givReason = `nickname ${givenName}↔${it.p.givenName}`;
        } else {
          const overlap = prefixOverlap(givFirst, candFirst);
          if (overlap > 0) {
            givScore = 30 + overlap;
            givReason = `${givenName}↔${it.p.givenName}`;
          } else if (surEqual && givFirst[0] === candFirst[0]) {
            // Weakest signal: same surname + same first initial.
            givScore = 10;
            givReason = `same surname, initial ${givFirst[0].toUpperCase()}`;
          }
        }
      }
      if (givScore < 0) continue;

      const reason =
        [surReason, givReason].filter(Boolean).join("; ") ||
        `${it.p.surname}, ${it.p.givenName}`;
      candidates.push({
        playerId: it.p.id,
        surname: it.p.surname,
        givenName: it.p.givenName,
        reason,
        score: surScore + givScore,
      });
    }

    if (candidates.length === 0) {
      return { status: "new", playerId: null, candidates: [] };
    }

    candidates.sort(
      (a, b) => b.score - a.score || a.surname.localeCompare(b.surname),
    );
    return {
      status: "suggested",
      playerId: null,
      candidates: candidates.slice(0, MAX_CANDIDATES),
    };
  };

  return { resolve };
}
