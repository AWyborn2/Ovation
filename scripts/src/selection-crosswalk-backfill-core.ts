/**
 * The pure rules of the Selection Hub crosswalk backfill (ADR-008 §4): which
 * PlayHQ participant GUIDs on a club's existing team lists already resolve to
 * exactly one squad member, so `squad_member_participants` can be seeded with
 * them and later "Private Player" rows match on their own. No database access;
 * the runner (`selection-crosswalk-backfill.ts`) reads and writes.
 */
import type { TeamListPlayer } from "@workspace/db";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import {
  buildMemberMatcher,
  memberDisplayName,
  normaliseName,
  normaliseParticipantId,
  type MemberIdentity,
} from "../../artifacts/api-server/src/lib/availability-grades";

export type BackfillMember = MemberIdentity & { section: "senior" | "junior" };

/** One team list as the backfill reads it. */
export type BackfillList = {
  fixtureId: number;
  grade: string;
  players: readonly TeamListPlayer[];
};

/** What the backfill does with one participant GUID. */
export type BackfillAction =
  /** Resolves to one member and the crosswalk has no row: written by `--apply`. */
  | "insert"
  /** The crosswalk already names the same member. */
  | "already"
  /** Rows of this GUID resolve to different members: left alone. */
  | "conflict"
  /** The crosswalk already names a different member: never overwritten. */
  | "conflict_existing";

export type BackfillRow = {
  participantId: string;
  action: BackfillAction;
  /** The member it resolves to (the first, for a conflict). */
  memberId: number;
  memberName: string;
  /** Every member its rows resolved to, for a conflict. */
  memberIds: number[];
  /** The member the crosswalk already names, if any. */
  existingMemberId: number | null;
  /** Team-list rows carrying this GUID that resolved, and the grades they were in. */
  rows: number;
  grades: string[];
  /** How the rows resolved: by a unique link alone (a "Private Player" row) or by the matcher. */
  via: ("link" | "matcher")[];
};

export type BackfillPlan = {
  rows: BackfillRow[];
  /** Rows carrying a GUID that resolved to nobody. */
  unresolvedRows: number;
  /** Distinct GUIDs seen on the lists. */
  participants: number;
  counts: Record<BackfillAction, number>;
};

/** The name PlayHQ gives a player who keeps their profile private. */
const PRIVATE_NAME = normaliseName("Private Player");

/**
 * Plan the backfill for one tenant. A row resolves through the Hub's member
 * matcher (unique link, then unique name, with its guards against a wrong
 * family link). A "Private Player" row has no name to check, so it resolves
 * only through a link exactly one member holds. A GUID is seeded only when all
 * its resolved rows agree on one member.
 */
export function planCrosswalkBackfill(input: {
  members: readonly BackfillMember[];
  lists: readonly BackfillList[];
  /** The tenant's crosswalk as it stands (normalised GUID to member id). */
  existing: ReadonlyMap<string, number>;
}): BackfillPlan {
  const { members, existing } = input;
  const byId = new Map(members.map((m) => [m.id, m]));
  // The same tie-break the senior draft uses: a name on both registers is the senior record.
  const match = buildMemberMatcher(members, (m) => byId.get(m.id)?.section === "senior");
  const linkHolders = new Map<number, BackfillMember[]>();
  for (const m of members) {
    if (m.linkedPlayerId == null) continue;
    const list = linkHolders.get(m.linkedPlayerId) ?? [];
    list.push(m);
    linkHolders.set(m.linkedPlayerId, list);
  }

  type Seen = {
    members: Set<number>;
    rows: number;
    grades: Set<string>;
    via: Set<"link" | "matcher">;
  };
  const seen = new Map<string, Seen>();
  const guids = new Set<string>();
  let unresolvedRows = 0;

  for (const list of input.lists) {
    for (const entry of list.players) {
      const guid = normaliseParticipantId(entry.participantId);
      if (!guid) continue;
      guids.add(guid);
      let member: BackfillMember | null = null;
      let via: "link" | "matcher" = "matcher";
      if (normaliseName(entry.displayName) === PRIVATE_NAME) {
        const pid = entry.playerId;
        const holders = pid != null && pid < FILL_IN_THRESHOLD ? (linkHolders.get(pid) ?? []) : [];
        if (holders.length === 1) {
          member = holders[0]!;
          via = "link";
        }
      } else {
        member = match(entry);
      }
      if (!member) {
        unresolvedRows++;
        continue;
      }
      const s = seen.get(guid) ?? {
        members: new Set<number>(),
        rows: 0,
        grades: new Set<string>(),
        via: new Set<"link" | "matcher">(),
      };
      s.members.add(member.id);
      s.rows++;
      s.grades.add(list.grade);
      s.via.add(via);
      seen.set(guid, s);
    }
  }

  const counts: Record<BackfillAction, number> = {
    insert: 0,
    already: 0,
    conflict: 0,
    conflict_existing: 0,
  };
  const rows: BackfillRow[] = [];
  for (const [participantId, s] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
    const memberIds = [...s.members].sort((a, b) => a - b);
    const memberId = memberIds[0]!;
    const existingMemberId = existing.get(participantId) ?? null;
    const action: BackfillAction =
      memberIds.length > 1
        ? "conflict"
        : existingMemberId == null
          ? "insert"
          : existingMemberId === memberId
            ? "already"
            : "conflict_existing";
    counts[action]++;
    const m = byId.get(memberId);
    rows.push({
      participantId,
      action,
      memberId,
      memberName: m ? memberDisplayName(m) : `#${memberId}`,
      memberIds,
      existingMemberId,
      rows: s.rows,
      grades: [...s.grades].sort(),
      via: [...s.via].sort(),
    });
  }
  return { rows, unresolvedRows, participants: guids.size, counts };
}

/** The `--tenant=<id>` / `--apply` / `--out=<dir>` arguments, or an error. */
export function parseBackfillArgs(
  argv: readonly string[],
): { tenantId: number; apply: boolean; out: string | null } | { error: string } {
  let tenantId: number | null = null;
  let apply = false;
  let out: string | null = null;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg === "--yes") continue;
    else if (arg.startsWith("--tenant=")) tenantId = Number(arg.slice("--tenant=".length));
    else if (arg.startsWith("--out=")) out = arg.slice("--out=".length) || null;
    else return { error: `Unknown argument: ${arg}` };
  }
  if (tenantId == null || !Number.isInteger(tenantId) || tenantId <= 0) {
    return { error: "A target tenant is required: --tenant=<id>." };
  }
  return { tenantId, apply, out };
}
