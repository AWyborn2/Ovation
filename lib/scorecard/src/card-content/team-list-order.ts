/**
 * Team List player order (round 3 retest, build decision 16). Pure.
 *
 * - `selected` (the default): the order the side was picked in (Selection Hub,
 *   PlayHQ or the admin's list), by each row's `order`.
 * - `shirt`: by shirt number, lowest first; players with no number go after
 *   every numbered player, by surname then first initial.
 * - `alpha`: by surname, then first initial.
 *
 * Whatever the order, a withheld junior ("Private Player") goes last, so a
 * row's position never hints at who it is. Rows are moved whole: a captain or
 * keeper mark stays with its player. Ties keep the order the rows came in.
 *
 * The club's default lives in `social_settings.card_content.teamList.playerOrder`;
 * a design can choose its own (`playerOrderOverride` on a single card's input,
 * `playerOrder` on a carousel's team slide) without changing the club's.
 */

export const TEAM_LIST_ORDERS = ["selected", "shirt", "alpha"] as const;
export type TeamListOrder = (typeof TEAM_LIST_ORDERS)[number];
export const DEFAULT_TEAM_LIST_ORDER: TeamListOrder = "selected";

export const TEAM_LIST_ORDER_LABELS: Record<TeamListOrder, string> = {
  selected: "As selected",
  shirt: "Shirt number",
  alpha: "Alphabetical",
};

export const TEAM_LIST_ORDER_HINTS: Record<TeamListOrder, string> = {
  selected: "The order the side was picked in.",
  shirt: "Lowest number first; players with no number go last, by surname.",
  alpha: "By surname, then first initial.",
};

export function isTeamListOrder(v: unknown): v is TeamListOrder {
  return typeof v === "string" && (TEAM_LIST_ORDERS as readonly string[]).includes(v);
}

/** The fields an order reads; every team list row shape has them. */
export interface OrderableTeamListRow {
  order?: unknown;
  surname?: unknown;
  firstInitial?: unknown;
  shirtNumber?: unknown;
}

const WITHHELD = "PRIVATE PLAYER";
const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/** A withheld junior's row ("Private Player"), however it was printed. */
export function isWithheldTeamListRow(row: OrderableTeamListRow): boolean {
  return text(row.surname).toUpperCase() === WITHHELD;
}

const byName = (a: OrderableTeamListRow, b: OrderableTeamListRow) =>
  text(a.surname).localeCompare(text(b.surname), "en", { sensitivity: "base" }) ||
  text(a.firstInitial).localeCompare(text(b.firstInitial), "en", { sensitivity: "base" });

/** A shirt number's sort key: its number; text that is not a number sorts after them. */
function shirtKey(v: unknown): { n: number; s: string } | null {
  const s = typeof v === "number" ? String(v) : text(v);
  if (!s) return null;
  const m = /^\d+/.exec(s);
  return { n: m ? Number(m[0]) : Number.POSITIVE_INFINITY, s };
}

const byShirt = (a: OrderableTeamListRow, b: OrderableTeamListRow) => {
  const x = shirtKey(a.shirtNumber);
  const y = shirtKey(b.shirtNumber);
  if (!x || !y) return x ? -1 : y ? 1 : byName(a, b);
  return x.n - y.n || x.s.localeCompare(y.s, "en", { numeric: true }) || byName(a, b);
};

const selectionOrder = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;

const bySelection = (a: OrderableTeamListRow, b: OrderableTeamListRow) =>
  selectionOrder(a.order) - selectionOrder(b.order);

/**
 * The rows in `order`, withheld juniors last. A new array; the rows themselves
 * are unchanged. An unknown order reads as `selected`.
 */
export function orderTeamListPlayers<T extends OrderableTeamListRow>(
  players: readonly T[],
  order: unknown = DEFAULT_TEAM_LIST_ORDER,
): T[] {
  const chosen = isTeamListOrder(order) ? order : DEFAULT_TEAM_LIST_ORDER;
  const compare = chosen === "shirt" ? byShirt : chosen === "alpha" ? byName : bySelection;
  // Array.prototype.sort is stable, so ties keep the order the rows came in.
  return players
    .map((p, i) => ({ p, i, withheld: isWithheldTeamListRow(p) }))
    .sort(
      (a, b) =>
        Number(a.withheld) - Number(b.withheld) ||
        (a.withheld ? 0 : compare(a.p, b.p)) ||
        a.i - b.i,
    )
    .map((x) => x.p);
}

/**
 * The order a team list card input is drawn in: the design's own choice
 * (`playerOrderOverride`), else the order it was built with (`playerOrder`),
 * else As selected.
 */
export function teamListInputOrder(input: {
  playerOrder?: unknown;
  playerOrderOverride?: unknown;
}): TeamListOrder {
  if (isTeamListOrder(input.playerOrderOverride)) return input.playerOrderOverride;
  if (isTeamListOrder(input.playerOrder)) return input.playerOrder;
  return DEFAULT_TEAM_LIST_ORDER;
}

/** Whether any row carries a shirt number (shirt order needs them to sort by). */
export function teamListHasShirtNumbers(players: readonly OrderableTeamListRow[]): boolean {
  return players.some((p) => shirtKey(p.shirtNumber) !== null);
}

/** The rows as they came, withheld juniors last. */
function withheldLast<T extends OrderableTeamListRow>(players: readonly T[]): T[] {
  return [
    ...players.filter((p) => !isWithheldTeamListRow(p)),
    ...players.filter(isWithheldTeamListRow),
  ];
}

/**
 * A card input's players as they are drawn (the binder, captions): in the
 * input's order, withheld juniors last. A card that hides its shirt numbers
 * no longer carries them; it was put in shirt order when it was built, so
 * shirt order keeps the rows as they are rather than sort them by name.
 */
export function orderTeamListInputPlayers<T extends OrderableTeamListRow>(input: {
  players?: readonly T[] | null;
  playerOrder?: unknown;
  playerOrderOverride?: unknown;
}): T[] {
  const players = input.players ?? [];
  const order = teamListInputOrder(input);
  if (order === "shirt" && !teamListHasShirtNumbers(players)) return withheldLast(players);
  return orderTeamListPlayers(players, order);
}
