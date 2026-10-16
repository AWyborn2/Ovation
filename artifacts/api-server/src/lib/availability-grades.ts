import type { SquadMemberRow, SquadSection, TeamListPlayer } from "@workspace/db";
import { isSeniorAppGrade } from "@workspace/db/central-queries";
import { perthDate as perthDateOrNull } from "@workspace/db/playhq-ingest";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";

/**
 * Shared rules for player availability and the Selection Hub (plan
 * 2026-10-06-002): which section a fixture belongs to and which grade a squad
 * member plays in, how a team-list entry is matched to a member,
 * and the Perth calendar arithmetic of a round. Pure — no DB access — so the
 * scheduler, the response API, the draft builder and the board
 * all apply the same rules.
 */

/** The member fields these rules read. */
export type MemberIdentity = Pick<
  SquadMemberRow,
  "id" | "firstName" | "lastName" | "preferredName" | "linkedPlayerId" | "active" | "gradeHint"
>;

/** A team-list entry as the matcher sees it. */
export type ListEntry = Pick<TeamListPlayer, "playerId" | "displayName">;

/** A past team list with its fixture's grade and start, for `memberGrades`. */
export type GradeList = { grade: string; startAt: Date; players: ListEntry[] };

/** A fixture is senior when its grade is a senior app grade, else junior. */
export function fixtureSection(grade: string | null | undefined): SquadSection {
  return isSeniorAppGrade(grade) ? "senior" : "junior";
}

/** Lower case, accents stripped, punctuation dropped, hyphens and spaces collapsed to one space. */
export function normaliseName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The name a member goes by: preferred name, else first name. */
export function memberFirstName(m: Pick<MemberIdentity, "firstName" | "preferredName">): string {
  return m.preferredName?.trim() || m.firstName;
}

/** "Preferred (or first) Last". */
export function memberDisplayName(
  m: Pick<MemberIdentity, "firstName" | "lastName" | "preferredName">,
): string {
  const first = m.preferredName?.trim() || m.firstName.trim();
  return `${first} ${m.lastName.trim()}`.trim();
}

/** The normalised names a team-list entry may use for a member: preferred and first, each with last. */
function memberNameKeys(m: MemberIdentity): string[] {
  const keys = new Set<string>();
  for (const first of [m.preferredName, m.firstName]) {
    if (first?.trim()) keys.add(normaliseName(`${first} ${m.lastName}`));
  }
  return [...keys];
}

/** Whether a list name and a member share first initial and surname ("T. Brooks", Thomas Brooks). */
function sameInitialSurname(
  displayName: string,
  m: Pick<MemberIdentity, "firstName" | "lastName" | "preferredName">,
): boolean {
  const tokens = normaliseName(displayName).split(" ").filter(Boolean);
  if (tokens.length < 2) return false;
  const initial = tokens[0]![0];
  const surname = tokens.slice(1).join(" ");
  if (surname !== normaliseName(m.lastName)) return false;
  return [m.firstName, m.preferredName].some((f) => f && normaliseName(f)[0] === initial);
}

/**
 * Matches team-list entries to members: by linked `playerId` first, then
 * by normalised display name (preferred or first name plus last name). A
 * fill-in id (>= 90000) never matches. A name match skips members linked
 * to a different player, and an ambiguous name prefers the one active member
 * (then `prefer`); still ambiguous, it stays unmatched rather than guess.
 *
 * A link is not trusted over a plainly different name, because a squad
 * member can be linked to the wrong person (PlayHQ accounts hold a whole
 * family, so a link can land on a sibling):
 * - a link two members share belongs to neither and is ignored;
 * - an id hit whose name differs from the entry gives way to the one member
 *   carrying the entry's exact name, so a sibling never takes the slot; with
 *   no such member it stands only for the same initial and surname, so a
 *   parent's id on a child's record matches nobody;
 * - an exact, unique name still matches a member linked elsewhere when no
 *   member is linked to the entry's player.
 */
export function buildMemberMatcher<M extends MemberIdentity>(
  members: readonly M[],
  /** Breaks a tie between same-named members (e.g. a senior side prefers the senior record). */
  prefer?: (m: M) => boolean,
): (entry: ListEntry) => M | null {
  const linkUse = new Map<number, number>();
  for (const m of members) {
    if (m.linkedPlayerId != null)
      linkUse.set(m.linkedPlayerId, (linkUse.get(m.linkedPlayerId) ?? 0) + 1);
  }
  /** The member's link, or null when it is a fill-in id or shared with another member. */
  const linkOf = (m: M) =>
    m.linkedPlayerId != null &&
    m.linkedPlayerId < FILL_IN_THRESHOLD &&
    linkUse.get(m.linkedPlayerId) === 1
      ? m.linkedPlayerId
      : null;
  const byPlayerId = new Map<number, M>();
  const byName = new Map<string, M[]>();
  for (const m of members) {
    const link = linkOf(m);
    if (link != null) byPlayerId.set(link, m);
    for (const key of memberNameKeys(m)) {
      const list = byName.get(key) ?? [];
      list.push(m);
      byName.set(key, list);
    }
  }
  const narrow = (list: M[]): M | null => {
    let candidates = list;
    if (candidates.length > 1) candidates = candidates.filter((m) => m.active);
    if (candidates.length > 1 && prefer) {
      const preferred = candidates.filter(prefer);
      if (preferred.length === 1) candidates = preferred;
    }
    return candidates.length === 1 ? candidates[0] : null;
  };
  return (entry) => {
    const pid = entry.playerId;
    if (pid != null && pid >= FILL_IN_THRESHOLD) return null;
    const key = normaliseName(entry.displayName);
    const named = byName.get(key) ?? [];
    const linked = pid != null ? byPlayerId.get(pid) : undefined;
    if (linked) {
      // The linked member, unless the entry plainly names someone else on the squad.
      if (!key || memberNameKeys(linked).includes(key)) return linked;
      const other = narrow(named.filter((m) => m.id !== linked.id));
      if (other) return other;
      // A spelling of the same person ("T. Brooks" for Thomas Brooks) keeps the
      // link; a different person (Ben Dreckow on his son Noah's record, via a
      // family PlayHQ account) is not this member: unmatched, not the son.
      return sameInitialSurname(entry.displayName, linked) ? linked : null;
    }
    // Nobody is linked to this player: a member linked elsewhere still matches
    // on their exact name (their link is wrong, or a sibling's).
    const unlinkedOrSame = named.filter((m) => {
      const link = linkOf(m);
      return link == null || pid == null || link === pid;
    });
    const exact = narrow(unlinkedOrSame) ?? (pid != null ? narrow(named) : null);
    if (exact) return exact;
    // Last resort, a close spelling of one member's name ("Tahj" for "Taj"
    // Bashford): same surname and first initial, first names at most two letters
    // apart, exactly one such member, and none linked to another player.
    const close = members.filter((m) => {
      const link = linkOf(m);
      return (
        (link == null || pid == null || link === pid) &&
        !(pid != null && byPlayerId.has(pid)) &&
        closeSpelling(entry.displayName, m)
      );
    });
    return narrow(close);
  };
}

/** Edit distance between two short strings (insert, delete, substitute). */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = row[j]!;
      row[j] = next;
    }
  }
  return row[b.length]!;
}

/**
 * A list name that is a close spelling of the member's ("Tahj Bashford" for Taj
 * Bashford, "Jaden" for Jayden): same surname, same first initial, and first
 * names at most two letters apart. A parent and child (Ben / Noah) never are.
 */
function closeSpelling(
  displayName: string,
  m: Pick<MemberIdentity, "firstName" | "lastName" | "preferredName">,
): boolean {
  const tokens = normaliseName(displayName).split(" ").filter(Boolean);
  if (tokens.length < 2) return false;
  const first = tokens[0]!;
  if (first.length < 2) return false;
  if (tokens.slice(1).join(" ") !== normaliseName(m.lastName)) return false;
  return [m.firstName, m.preferredName].some((f) => {
    const given = normaliseName(f ?? "").split(" ")[0] ?? "";
    return given.length >= 2 && given[0] === first[0] && editDistance(given, first) <= 2;
  });
}

/**
 * Each member's grade: the grade of the most recent team list they
 * appear in, else their imported grade hint when it matches one of the club's
 * fixture grades, else null (asked about every date in their section).
 */
export function memberGrades<M extends MemberIdentity>(
  members: readonly M[],
  lists: readonly GradeList[],
  fixtureGrades: Iterable<string>,
): Map<number, string | null> {
  const known = new Set(fixtureGrades);
  const match = buildMemberMatcher(members);
  const out = new Map<number, string | null>();
  const newestFirst = [...lists].sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  for (const list of newestFirst) {
    for (const entry of list.players) {
      const m = match(entry);
      if (m && !out.has(m.id)) out.set(m.id, list.grade);
    }
  }
  for (const m of members) {
    if (out.has(m.id)) continue;
    const hint = m.gradeHint?.trim();
    out.set(m.id, hint && known.has(hint) ? hint : null);
  }
  return out;
}

/** One member's grade; see `memberGrades` for the bulk form. */
export function memberGradeFor(
  member: MemberIdentity,
  lists: readonly GradeList[],
  fixtureGrades: Iterable<string>,
): string | null {
  return memberGrades([member], lists, fixtureGrades).get(member.id) ?? null;
}

// --- Perth calendar (AWST, UTC+8, no daylight saving) ---

const DAY_MS = 86_400_000;
const AWST_MS = 8 * 3_600_000;

/** `YYYY-MM-DD` of the Perth day containing `at`. */
export function perthDate(at: Date): string {
  const d = perthDateOrNull(at);
  if (!d) throw new RangeError("perthDate: invalid date");
  return d;
}

/** Perth day of week (0 = Sunday) of an instant, or of a `YYYY-MM-DD` Perth date. */
export function perthDow(at: Date | string): number {
  if (typeof at === "string") return new Date(`${at}T00:00:00Z`).getUTCDay();
  return new Date(at.getTime() + AWST_MS).getUTCDay();
}

/**
 * Under 18 on the Perth date `today` (YYYY-MM-DD), from a YYYY-MM-DD date of
 * birth: true until the 18th birthday. Null when the date of birth is missing
 * or malformed.
 */
export function isUnder18OnDate(
  dateOfBirth: string | null | undefined,
  today: string,
): boolean | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  const eighteenth = `${String(y + 18).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return today < eighteenth;
}

/** The instant a Perth calendar date begins (16:00Z the day before). */
export function perthDayStart(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - AWST_MS);
}

/** `YYYY-MM-DD` `days` after a date (negative for before). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * A round's fixture window: Friday 00:00 to Monday 00:00 Perth around the
 * round's weekend Saturday (`from` inclusive, `to` exclusive).
 */
export function roundWindow(weekendDate: string): { from: Date; to: Date } {
  return {
    from: perthDayStart(addDays(weekendDate, -1)),
    to: perthDayStart(addDays(weekendDate, 2)),
  };
}
