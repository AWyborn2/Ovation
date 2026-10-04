/**
 * link-hh-cap-only-players-core.ts — the PURE rules behind
 * link-hh-cap-only-players.ts (no database, no I/O; unit tested).
 *
 * Halls Head keeps players who were capped before its digital records as
 * cap-only native rows (`players.is_cap_only`, ids 95001+). Ids >= 90000 are
 * the fill-in / cap-only range and are excluded from every stats derivation,
 * so a cap-only id can't simply be given a crosswalk row: its stats would be
 * hidden. Linking one to its PlayHQ identity therefore gives the player a
 * regular id (the next one in Halls Head's sequence, below 90000), moves every
 * curated link (cap, awards, premierships, photos …) from the cap-only id to
 * it, maps the PlayHQ GUID onto it, and removes the cap-only row.
 *
 * Owner decision (4 Oct 2026): Ash approved linking the 14 cap-only players the
 * first Halls Head cut-over preview found with PlayHQ records (unlinked
 * identities report). Each link is named here with the PlayHQ GUID; the native
 * row is found by name, so the same list works on dev and production.
 */

/** The approved links: native cap-only player name → PlayHQ participant GUID. */
export const APPROVED_CAP_ONLY_LINKS: readonly CapOnlyLinkRequest[] = [
  { name: "Nick Rostin", participantId: "4dd22e68-b462-49e0-9f4c-fccb764acc83" },
  { name: "Toby Bairstow", participantId: "971c8c90-0ae9-49eb-9f97-c561675d65ca" },
  { name: "Nathan Dovey", participantId: "e9f503de-6cd0-4be3-832e-8a2f2667495c" },
  { name: "Tristan Clough", participantId: "53323224-eb13-4a14-81b2-85e3a29953cf" },
  { name: "Peter Moir", participantId: "0202f24d-a481-434b-ad66-7db2d2f929b2" },
  { name: "Brad Holmes", participantId: "12b61f63-c894-478b-8a09-eed87ec3db8f" },
  { name: "Perry Allen", participantId: "41d64af8-ec44-4672-9559-cc28bf743bc7" },
  { name: "Jake Withers", participantId: "5d08af35-7448-4a31-a707-8e131c3af031" },
  { name: "Michael Sprott", participantId: "6694b00c-6026-41ea-920a-b2d0135b7d79" },
  { name: "Gary Hocking", participantId: "bcc19ff1-5fad-44b6-ae06-e31a499138c3" },
  { name: "Josh McGee", participantId: "dc025adc-66a6-49c5-8774-309c7bfe0856" },
  { name: "Chris King", participantId: "bb887fe7-0049-4a72-ab41-a7affe25258b" },
  { name: "Adam Clues", participantId: "ead94bc6-c0ee-419c-bc1e-509a593c1c7a" },
  { name: "Jason Sparrow", participantId: "279ed314-e913-4a86-9cab-120f6eb2b52f" },
];

/** Ids at or above this are fill-ins / cap-only (matches MINT_ID_CEILING). */
export const CAP_ONLY_RANGE_FLOOR = 90000;

export interface CapOnlyLinkRequest {
  name: string;
  participantId: string;
}

export interface NativeCapOnlyRow {
  id: number;
  givenName: string | null;
  surname: string | null;
  isCapOnly: boolean;
}

export interface CentralIdentity {
  participantId: string;
  displayName: string | null;
  isPrivate: boolean;
  /** Halls Head (central club 1) team-sheet appearances under this GUID. */
  clubMatches: number;
}

export interface PlannedLink {
  name: string;
  participantId: string;
  centralName: string | null;
  clubMatches: number;
  capOnlyId: number;
  newId: number;
}

export interface RefusedLink {
  name: string;
  participantId: string;
  reason: string;
}

export interface LinkPlan {
  links: PlannedLink[];
  refused: RefusedLink[];
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** The surname in a central display name: "Holmes, Brad" → holmes; "N Rostin" → rostin. */
export function centralSurname(displayName: string | null): string {
  const d = norm(displayName);
  if (d.includes(",")) return d.split(",")[0]!.trim();
  const parts = d.split(" ");
  return parts[parts.length - 1] ?? "";
}

/**
 * Decide each approved link. A link is refused (and nothing is written for it)
 * when the cap-only native row isn't exactly one, the GUID is already in Halls
 * Head's crosswalk, central doesn't have the GUID, the GUID has no Halls Head
 * appearance, central marks the player private (their page would then 404,
 * where the cap-only profile shows today), or the surnames disagree. New ids
 * are assigned in request order from `mintFloor + 1`, and must stay below the
 * fill-in range.
 */
export function planCapOnlyLinks(input: {
  requests: readonly CapOnlyLinkRequest[];
  nativeRows: readonly NativeCapOnlyRow[];
  mappedParticipantIds: ReadonlySet<string>;
  central: ReadonlyMap<string, CentralIdentity>;
  mintFloor: number;
}): LinkPlan {
  const links: PlannedLink[] = [];
  const refused: RefusedLink[] = [];
  let next = input.mintFloor + 1;
  const seenGuids = new Set<string>();

  for (const r of input.requests) {
    const refuse = (reason: string) =>
      refused.push({ name: r.name, participantId: r.participantId, reason });
    const guid = r.participantId.toLowerCase();
    const native = input.nativeRows.filter(
      (p) =>
        p.isCapOnly &&
        p.id >= CAP_ONLY_RANGE_FLOOR &&
        norm(`${p.givenName ?? ""} ${p.surname ?? ""}`) === norm(r.name),
    );
    if (native.length !== 1) {
      refuse(
        native.length === 0
          ? "no cap-only native player with this name (already linked, or renamed)"
          : `${native.length} cap-only native players share this name`,
      );
      continue;
    }
    if (seenGuids.has(guid)) {
      refuse("the same PlayHQ GUID is requested twice");
      continue;
    }
    if (input.mappedParticipantIds.has(guid)) {
      refuse("the PlayHQ GUID is already in Halls Head's crosswalk");
      continue;
    }
    const c = input.central.get(guid);
    if (!c) {
      refuse("central has no player with this GUID");
      continue;
    }
    if (c.isPrivate) {
      refuse("central marks the player private (the page would disappear)");
      continue;
    }
    if (c.clubMatches === 0) {
      refuse("the GUID has no Halls Head appearance in central");
      continue;
    }
    const surname = norm(native[0]!.surname);
    if (!surname || centralSurname(c.displayName) !== surname) {
      refuse(`surname differs: central "${c.displayName ?? ""}"`);
      continue;
    }
    if (next >= CAP_ONLY_RANGE_FLOOR) {
      refuse("no regular player id left below the fill-in range");
      continue;
    }
    seenGuids.add(guid);
    links.push({
      name: r.name,
      participantId: guid,
      centralName: c.displayName,
      clubMatches: c.clubMatches,
      capOnlyId: native[0]!.id,
      newId: next,
    });
    next += 1;
  }
  return { links, refused };
}

export const LINK_ALLOWED_FLAGS = new Set(["--tenant", "--commit", "--out", "--help", "-h"]);

export interface LinkArgs {
  tenant: number | null;
  commit: boolean;
  out: string | null;
  help: boolean;
}

/** Parse argv (after the script name). Unknown flags throw. */
export function parseLinkArgs(argv: readonly string[]): LinkArgs {
  const out: LinkArgs = { tenant: null, commit: false, out: null, help: false };
  for (const a of argv) {
    const [flag, value] = a.split("=", 2) as [string, string | undefined];
    if (!LINK_ALLOWED_FLAGS.has(flag)) throw new Error(`Unknown argument: ${a}`);
    if (flag === "--tenant") out.tenant = value ? Number(value) : null;
    else if (flag === "--commit") out.commit = true;
    else if (flag === "--out") out.out = value ?? null;
    else out.help = true;
  }
  return out;
}
