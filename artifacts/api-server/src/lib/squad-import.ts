import { parse } from "csv-parse/sync";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  db,
  squadMembersTable,
  playerIdMapTable,
  teamListsTable,
  type SquadMemberRow,
  type SquadSection,
} from "@workspace/db";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { norm } from "./name-match";
import {
  isLinkablePlayerId,
  loadInitialIndex,
  matchByInitial,
  memberInitialKeys,
} from "./squad-link";

/**
 * PlayHQ participant export → the club's squad register.
 *
 * The export carries ~70 columns, most of them sensitive (Indigenous status,
 * country of birth, disability, WWC, addresses, school, emergency contacts…).
 * Only a whitelist of columns is ever read: the parser picks those columns by
 * header
 * name and drops every other cell before a row object exists, so a discarded
 * value can never be stored, logged or echoed. Parse errors are reported
 * by line number only — csv-parse's own messages can quote cell text.
 *
 * Eligibility: `Role` names a player, `Status` is active, the row is in
 * the file's current season (its most common `Season`) and its `Host
 * Organisation ID` is the file's most common one. Everything else is skipped
 * with a reason code. A member is upserted by (tenant, Profile ID);
 * members missing from a later file are left alone, and a re-import never
 * overrides an admin's hand-set active flag.
 */

/** The column whitelist — the only export columns ever read. */
export const SQUAD_IMPORT_COLUMNS = [
  "Profile ID",
  "First Name",
  "Last Name",
  "Preferred Name",
  "Date of Birth",
  "Role",
  "Status",
  "Season",
  "Club",
  "Host Organisation ID",
  "Grade",
  "Team",
  "Age Group",
  "Competition",
  "Format",
  "Privacy Setting",
  "Account Holder",
  "Account Holder Mobile",
  "Account Holder Email",
  "Parent/Guardian1 First Name",
  "Parent/Guardian1 Last Name",
  "Parent/Guardian1 Mobile Number",
  "Parent/Guardian1 Email",
  "Parent/Guardian2 First Name",
  "Parent/Guardian2 Last Name",
  "Parent/Guardian2 Mobile Number",
  "Parent/Guardian2 Email",
] as const;

export type SquadImportColumn = (typeof SQUAD_IMPORT_COLUMNS)[number];
export type SquadImportFields = Record<SquadImportColumn, string>;

/** Columns the import cannot work without; a file missing one is refused. */
export const REQUIRED_SQUAD_COLUMNS: SquadImportColumn[] = [
  "Profile ID",
  "First Name",
  "Last Name",
  "Role",
  "Status",
  "Season",
];

/**
 * `Status` values (lower-cased) that count as a current registration. Anything
 * else — "Cancelled", "Deregistered", "Pending", "Expired" — is inactive.
 */
export const ACTIVE_SQUAD_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "registered",
  "approved",
]);

/** Why a row did not become (or refresh) a member. Codes only — never cell values. */
export type SquadSkipReason =
  | "missing_profile_id"
  | "missing_name"
  | "not_a_player"
  | "inactive_status"
  | "other_season"
  | "other_organisation"
  | "duplicate_profile";

export type SquadSkip = { line: number; name: string; reason: SquadSkipReason };

/** A refused file (bad header, unparseable CSV). The message is safe to return. */
export class SquadImportError extends Error {}

export type ParsedSquadCsv = {
  /** `line` is the 1-based line in the file (the header is line 1). */
  rows: Array<{ line: number; fields: SquadImportFields }>;
};

export function parseSquadCsv(content: string): ParsedSquadCsv {
  let records: string[][];
  try {
    records = parse(content, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as string[][];
  } catch (e) {
    // Never pass csv-parse's message through: it can quote the offending cell.
    const line = (e as { lines?: number }).lines;
    throw new SquadImportError(
      line ? `Could not read the CSV near line ${line}.` : "Could not read the CSV.",
    );
  }
  if (records.length === 0) throw new SquadImportError("The file is empty.");

  const header = records[0].map((h) => h.trim());
  const index = new Map<SquadImportColumn, number>();
  for (const col of SQUAD_IMPORT_COLUMNS) {
    const i = header.indexOf(col);
    if (i >= 0) index.set(col, i);
  }
  const missing = REQUIRED_SQUAD_COLUMNS.filter((c) => !index.has(c));
  if (missing.length > 0) {
    throw new SquadImportError(
      `The file is missing column(s): ${missing.join(", ")}. ` +
        "Upload the PlayHQ participant export.",
    );
  }

  const rows: ParsedSquadCsv["rows"] = [];
  for (let r = 1; r < records.length; r++) {
    const cells = records[r];
    const fields = {} as SquadImportFields;
    for (const col of SQUAD_IMPORT_COLUMNS) {
      const i = index.get(col);
      fields[col] = i === undefined ? "" : (cells[i] ?? "").trim();
    }
    rows.push({ line: r + 1, fields });
  }
  return { rows };
}

/** Junior when an age group or grade names an under-age group. */
export function isJuniorLabel(s: string): boolean {
  return /\bunder\b|\bu\s?-?\s?\d{1,2}(?!\d)|junior/i.test(s);
}

/** `dd/mm/yyyy` (optionally with a time) or `yyyy-mm-dd` → ISO date, else null. */
export function parseExportDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt.toISOString().slice(0, 10);
}

/** Mobile numbers are stored without spaces or punctuation (a leading + stays). */
export function normaliseMobile(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return digits || null;
}

export function normaliseEmail(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  return s || null;
}

function joinName(first: string, last: string): string | null {
  const s = `${first} ${last}`.trim().replace(/\s+/g, " ");
  return s || null;
}

/** The values one export row contributes to a `squad_members` row. */
export type ImportedMember = {
  line: number;
  playhqProfileId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  section: SquadSection;
  gradeHint: string | null;
  teamName: string | null;
  ageGroup: string | null;
  isPrivate: boolean;
  accountHolderName: string | null;
  accountHolderMobile: string | null;
  accountHolderEmail: string | null;
  guardian1Name: string | null;
  guardian1Mobile: string | null;
  guardian1Email: string | null;
  guardian2Name: string | null;
  guardian2Mobile: string | null;
  guardian2Email: string | null;
};

export type SquadImportPlan = {
  /** The file's current season (its most common `Season` value). */
  season: string | null;
  members: ImportedMember[];
  skipped: SquadSkip[];
  /**
   * Profile ids whose current-season row is a player with an inactive status:
   * an existing member the admin hasn't set by hand is stood down.
   */
  inactiveProfileIds: string[];
};

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) [best, bestCount] = [v, c];
  }
  return best;
}

/** Decide, row by row, what becomes a member (pure — no DB). */
export function planSquadImport(parsed: ParsedSquadCsv): SquadImportPlan {
  const season = mostCommon(parsed.rows.map((r) => r.fields.Season));
  const hostOrg = mostCommon(parsed.rows.map((r) => r.fields["Host Organisation ID"]));
  const members: ImportedMember[] = [];
  const skipped: SquadSkip[] = [];
  const inactive = new Set<string>();
  const seen = new Set<string>();

  for (const { line, fields: f } of parsed.rows) {
    const name = joinName(f["First Name"], f["Last Name"]) ?? "";
    const skip = (reason: SquadSkipReason) => skipped.push({ line, name, reason });
    const profileId = f["Profile ID"];
    if (!profileId) {
      skip("missing_profile_id");
      continue;
    }
    if (!f["First Name"] || !f["Last Name"]) {
      skip("missing_name");
      continue;
    }
    if (!/player/i.test(f.Role)) {
      skip("not_a_player");
      continue;
    }
    if ((f.Season || null) !== season) {
      skip("other_season");
      continue;
    }
    if (hostOrg && f["Host Organisation ID"] && f["Host Organisation ID"] !== hostOrg) {
      skip("other_organisation");
      continue;
    }
    if (!ACTIVE_SQUAD_STATUSES.has(f.Status.toLowerCase())) {
      inactive.add(profileId);
      skip("inactive_status");
      continue;
    }
    if (seen.has(profileId)) {
      skip("duplicate_profile");
      continue;
    }
    seen.add(profileId);
    inactive.delete(profileId);

    members.push({
      line,
      playhqProfileId: profileId,
      firstName: f["First Name"],
      lastName: f["Last Name"],
      preferredName: f["Preferred Name"] || null,
      dateOfBirth: parseExportDate(f["Date of Birth"]),
      section: isJuniorLabel(f["Age Group"]) || isJuniorLabel(f.Grade) ? "junior" : "senior",
      gradeHint: f.Grade || null,
      teamName: f.Team || null,
      ageGroup: f["Age Group"] || null,
      isPrivate: /private/i.test(f["Privacy Setting"]),
      accountHolderName: f["Account Holder"] || null,
      accountHolderMobile: normaliseMobile(f["Account Holder Mobile"]),
      accountHolderEmail: normaliseEmail(f["Account Holder Email"]),
      guardian1Name: joinName(f["Parent/Guardian1 First Name"], f["Parent/Guardian1 Last Name"]),
      guardian1Mobile: normaliseMobile(f["Parent/Guardian1 Mobile Number"]),
      guardian1Email: normaliseEmail(f["Parent/Guardian1 Email"]),
      guardian2Name: joinName(f["Parent/Guardian2 First Name"], f["Parent/Guardian2 Last Name"]),
      guardian2Mobile: normaliseMobile(f["Parent/Guardian2 Mobile Number"]),
      guardian2Email: normaliseEmail(f["Parent/Guardian2 Email"]),
    });
  }
  // A profile with an active row as well as a cancelled one stays active.
  for (const id of seen) inactive.delete(id);
  return { season, members, skipped, inactiveProfileIds: [...inactive] };
}

/** Normalised full-name keys a member can be recognised by in team lists. */
export function memberNameKeys(m: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}): string[] {
  const keys = new Set([norm(`${m.firstName}${m.lastName}`)]);
  if (m.preferredName) keys.add(norm(`${m.preferredName}${m.lastName}`));
  return [...keys].filter(Boolean);
}

/**
 * Link candidates: the tenant's `player_id_map` rows for these
 * profile ids, and the unambiguous name → playerId pairs in its team-list
 * history. Fill-in ids (>= FILL_IN_THRESHOLD) are never candidates.
 */
async function loadLinkSources(
  tenantId: number,
  profileIds: string[],
): Promise<{ byProfile: Map<string, number>; byName: Map<string, number> }> {
  const byProfile = new Map<string, number>();
  const lowered = [...new Set(profileIds.map((p) => p.toLowerCase()))];
  if (lowered.length > 0) {
    const rows = await db
      .select({
        participantId: playerIdMapTable.participantId,
        playerId: playerIdMapTable.playerId,
      })
      .from(playerIdMapTable)
      .where(
        and(
          eq(playerIdMapTable.tenantId, tenantId),
          inArray(sql`lower(${playerIdMapTable.participantId})`, lowered),
        ),
      );
    for (const r of rows) {
      if (r.playerId > 0 && r.playerId < FILL_IN_THRESHOLD) {
        byProfile.set(r.participantId.toLowerCase(), r.playerId);
      }
    }
  }

  const ids = new Map<string, Set<number>>();
  const lists = await db
    .select({ players: teamListsTable.players })
    .from(teamListsTable)
    .where(eq(teamListsTable.tenantId, tenantId));
  for (const { players } of lists) {
    for (const p of players ?? []) {
      if (p.playerId == null || p.playerId <= 0 || p.playerId >= FILL_IN_THRESHOLD) continue;
      const key = norm(p.displayName ?? "");
      if (!key) continue;
      if (!ids.has(key)) ids.set(key, new Set());
      ids.get(key)!.add(p.playerId);
    }
  }
  const byName = new Map<string, number>();
  for (const [key, set] of ids) if (set.size === 1) byName.set(key, [...set][0]);
  return { byProfile, byName };
}

export type SquadImportResult = {
  season: string | null;
  created: number;
  updated: number;
  /** Existing members stood down because their registration is no longer active. */
  deactivated: number;
  /** Members newly linked to an app player this import. */
  linked: number;
  /** Members whose contacts were kept: changed from their link, flag not yet cleared. */
  contactsKept: number;
  skipped: SquadSkip[];
  skippedByReason: Array<{ reason: SquadSkipReason; count: number }>;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Upsert the plan into `squad_members` for one tenant, in one transaction.
 *
 * - New members start active; an existing member's `active` follows the file
 *   unless an admin set it by hand (`activeSetByAdmin`), which always wins.
 * - A member an admin has set inactive (including one removed on a guardian's
 *   request, see `DELETE /squad/:id`) keeps its name only: the import does not
 *   write contacts or date of birth back onto it.
 * - A member whose player or guardian changed a contact from their link
 *   (`contactChangeFlag`, until an admin clears it) keeps every contact: the
 *   file may still hold the old details. Counted as `contactsKept`.
 * - A changed mobile clears that contact's SMS opt-out: it is a new number.
 * - Linking only fills an empty `linked_player_id`, so an admin's link
 *   is never replaced, and never reuses a player already linked to another
 *   member of the tenant. Every member in the file that is still unlinked is
 *   tried again, so re-uploading a file links members an earlier import
 *   couldn't. In order: the `Profile ID` in the tenant's crosswalk, a unique
 *   full name in the club's team-list history, then first initial + surname
 *   against the club's central players (`./squad-link`). A name shared by two
 *   members of the file never links by name.
 */
export async function applySquadImport(
  tenantId: number,
  plan: SquadImportPlan,
): Promise<SquadImportResult> {
  const profileIds = plan.members.map((m) => m.playhqProfileId);
  const [links, initialIndex] = await Promise.all([
    loadLinkSources(tenantId, profileIds),
    loadInitialIndex(tenantId),
  ]);

  // Name keys shared by two members of this file can't link by name.
  const nameCounts = new Map<string, number>();
  const initialCounts = new Map<string, number>();
  for (const m of plan.members) {
    for (const k of memberNameKeys(m)) nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
    for (const k of memberInitialKeys(m)) initialCounts.set(k, (initialCounts.get(k) ?? 0) + 1);
  }

  let created = 0;
  let updated = 0;
  let deactivated = 0;
  let linked = 0;
  let contactsKept = 0;

  await db.transaction(async (tx: Tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(72401, ${tenantId})`);
    const existing = await tx
      .select()
      .from(squadMembersTable)
      .where(eq(squadMembersTable.tenantId, tenantId));
    const byProfile = new Map<string, SquadMemberRow>();
    for (const row of existing) {
      if (row.playhqProfileId) byProfile.set(row.playhqProfileId, row);
    }
    const adopted = new Set<number>();

    const taken = new Set<number>(
      (
        await tx
          .select({ id: squadMembersTable.linkedPlayerId })
          .from(squadMembersTable)
          .where(
            and(
              eq(squadMembersTable.tenantId, tenantId),
              isNotNull(squadMembersTable.linkedPlayerId),
            ),
          )
      ).map((r) => r.id!),
    );

    const resolveLink = (m: ImportedMember): number | null => {
      let id = links.byProfile.get(m.playhqProfileId.toLowerCase()) ?? null;
      if (id == null) {
        const hits = new Set<number>();
        for (const k of memberNameKeys(m)) {
          if ((nameCounts.get(k) ?? 0) > 1) return null;
          const hit = links.byName.get(k);
          if (hit != null) hits.add(hit);
        }
        if (hits.size === 1) id = [...hits][0];
      }
      if (id == null && memberInitialKeys(m).every((k) => (initialCounts.get(k) ?? 0) === 1)) {
        const hit = matchByInitial(m, initialIndex);
        if (hit && isLinkablePlayerId(hit.playerId)) id = hit.playerId;
      }
      if (id == null || taken.has(id)) return null;
      taken.add(id);
      return id;
    };

    const now = new Date();
    for (const m of plan.members) {
      let prev = byProfile.get(m.playhqProfileId);
      if (!prev) {
        const initial = matchByInitial(m, initialIndex);
        const knownId =
          links.byProfile.get(m.playhqProfileId.toLowerCase()) ?? initial?.playerId ?? null;
        const keys = memberNameKeys(m);
        const initials = memberInitialKeys(m);
        const candidates = existing.filter(
          (r) =>
            !r.playhqProfileId &&
            !adopted.has(r.id) &&
            ((knownId !== null && r.linkedPlayerId === knownId) ||
              (r.section === m.section &&
                r.linkedPlayerId === null &&
                (memberNameKeys(r).some((k) => keys.includes(k) && nameCounts.get(k) === 1) ||
                  memberInitialKeys(r).some(
                    (k) => initials.includes(k) && initialCounts.get(k) === 1,
                  )))),
        );
        if (candidates.length === 1) {
          prev = candidates[0];
          adopted.add(prev.id);
          byProfile.set(m.playhqProfileId, prev);
        }
      }
      const identity = {
        firstName: m.firstName,
        lastName: m.lastName,
        preferredName: m.preferredName,
        section: m.section,
        gradeHint: m.gradeHint,
        teamName: m.teamName,
        ageGroup: m.ageGroup,
        isPrivate: m.isPrivate,
      };
      const contacts = {
        dateOfBirth: m.dateOfBirth,
        accountHolderName: m.accountHolderName,
        accountHolderMobile: m.accountHolderMobile,
        accountHolderEmail: m.accountHolderEmail,
        guardian1Name: m.guardian1Name,
        guardian1Mobile: m.guardian1Mobile,
        guardian1Email: m.guardian1Email,
        guardian2Name: m.guardian2Name,
        guardian2Mobile: m.guardian2Mobile,
        guardian2Email: m.guardian2Email,
      };

      if (!prev) {
        const linkedPlayerId = resolveLink(m);
        if (linkedPlayerId != null) linked++;
        await tx.insert(squadMembersTable).values({
          tenantId,
          playhqProfileId: m.playhqProfileId,
          ...identity,
          ...contacts,
          active: true,
          linkedPlayerId,
        });
        created++;
        continue;
      }

      const heldByAdmin = prev.activeSetByAdmin && !prev.active;
      const set: Partial<typeof squadMembersTable.$inferInsert> = {
        ...identity,
        playhqProfileId: m.playhqProfileId,
        updatedAt: now,
      };
      if (!heldByAdmin && prev.contactChangeFlag) {
        set.dateOfBirth = contacts.dateOfBirth;
        contactsKept++;
      } else if (!heldByAdmin) {
        Object.assign(set, contacts);
        if (contacts.accountHolderMobile !== prev.accountHolderMobile) {
          set.accountSmsOptOut = false;
        }
        if (contacts.guardian1Mobile !== prev.guardian1Mobile) set.guardian1SmsOptOut = false;
        if (contacts.guardian2Mobile !== prev.guardian2Mobile) set.guardian2SmsOptOut = false;
      }
      if (!prev.activeSetByAdmin) set.active = true;
      if (prev.linkedPlayerId == null) {
        const linkedPlayerId = resolveLink(m);
        if (linkedPlayerId != null) {
          set.linkedPlayerId = linkedPlayerId;
          linked++;
        }
      }
      await tx
        .update(squadMembersTable)
        .set(set)
        .where(and(eq(squadMembersTable.id, prev.id), eq(squadMembersTable.tenantId, tenantId)));
      updated++;
    }

    for (const profileId of plan.inactiveProfileIds) {
      const prev = byProfile.get(profileId);
      if (!prev || prev.activeSetByAdmin || !prev.active) continue;
      await tx
        .update(squadMembersTable)
        .set({ active: false, updatedAt: now })
        .where(and(eq(squadMembersTable.id, prev.id), eq(squadMembersTable.tenantId, tenantId)));
      deactivated++;
    }
  });

  const reasonCounts = new Map<SquadSkipReason, number>();
  for (const s of plan.skipped) reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
  return {
    season: plan.season,
    created,
    updated,
    deactivated,
    linked,
    contactsKept,
    skipped: plan.skipped,
    skippedByReason: [...reasonCounts].map(([reason, count]) => ({ reason, count })),
  };
}
