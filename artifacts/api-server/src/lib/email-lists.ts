import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  emailListMembersTable,
  emailListTeamsTable,
  emailListsTable,
  type EmailListKind,
  type EmailListSettings,
  type TeamSheetSendMode,
} from "@workspace/db";
import { resendOnChangeOf, sendModeOf } from "./team-sheet-email";

/**
 * The club's email distribution lists (admin CRUD). A save replaces the list's
 * grades and members whole, in one transaction. Addresses are trimmed and
 * de-duplicated case-insensitively; every query is tenant-scoped.
 */

type Schedule = { dow: number; time: string };

export type EmailListInput = {
  kind: EmailListKind;
  name: string;
  /** team_sheet lists (default on_publish). */
  sendMode?: TeamSheetSendMode;
  schedule?: Schedule | null;
  resendOnChange?: boolean;
  /** social lists. */
  assetReady?: boolean;
  reviewNeeded?: boolean;
  milestone?: boolean;
  active?: boolean;
  gradeKeys: string[];
  members: { name: string; email: string }[];
};

export type EmailListView = {
  id: number;
  kind: EmailListKind;
  name: string;
  sendMode: TeamSheetSendMode;
  schedule: Schedule | null;
  resendOnChange: boolean;
  assetReady: boolean;
  reviewNeeded: boolean;
  milestone: boolean;
  active: boolean;
  gradeKeys: string[];
  members: { name: string; email: string }[];
  createdAt: Date;
};

/**
 * The settings saved for a list: team-sheet lists keep their send mode,
 * schedule and resend switch; social lists their three toggles (and no grades).
 */
export function settingsFor(input: EmailListInput): EmailListSettings {
  if (input.kind === "social") {
    return {
      assetReady: input.assetReady ?? false,
      reviewNeeded: input.reviewNeeded ?? false,
      milestone: input.milestone ?? false,
    };
  }
  const sendMode = input.sendMode ?? "on_publish";
  return {
    sendMode,
    schedule: sendMode === "scheduled" ? (input.schedule ?? null) : null,
    resendOnChange: input.resendOnChange ?? true,
  };
}

export class EmailListInputError extends Error {}

/** A scheduled list needs its day and time. */
export function checkListInput(input: EmailListInput): void {
  if (input.kind === "team_sheet" && input.sendMode === "scheduled" && !input.schedule)
    throw new EmailListInputError("Choose a day and time for a scheduled list.");
}

/** Trimmed members, first spelling of each address kept. */
export function cleanMembers(members: EmailListInput["members"]) {
  const seen = new Set<string>();
  const out: { name: string; email: string }[] = [];
  for (const m of members) {
    const email = m.email.trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: m.name.trim(), email });
  }
  return out;
}

const cleanGrades = (grades: string[]) => [...new Set(grades.map((g) => g.trim()).filter(Boolean))];

export async function listEmailLists(tenantId: number, ids?: number[]): Promise<EmailListView[]> {
  const lists = await db
    .select()
    .from(emailListsTable)
    .where(
      and(
        eq(emailListsTable.tenantId, tenantId),
        ids ? inArray(emailListsTable.id, ids) : undefined,
      ),
    )
    .orderBy(asc(emailListsTable.name), asc(emailListsTable.id));
  if (lists.length === 0) return [];
  const listIds = lists.map((l) => l.id);
  const [members, teams] = await Promise.all([
    db
      .select()
      .from(emailListMembersTable)
      .where(
        and(
          eq(emailListMembersTable.tenantId, tenantId),
          inArray(emailListMembersTable.listId, listIds),
        ),
      )
      .orderBy(asc(emailListMembersTable.id)),
    db
      .select()
      .from(emailListTeamsTable)
      .where(
        and(
          eq(emailListTeamsTable.tenantId, tenantId),
          inArray(emailListTeamsTable.listId, listIds),
        ),
      )
      .orderBy(asc(emailListTeamsTable.gradeKey)),
  ]);
  return lists.map((l) => ({
    id: l.id,
    kind: l.kind,
    name: l.name,
    sendMode: l.kind === "social" ? "off" : sendModeOf(l.settings),
    schedule: l.kind === "social" ? null : (l.settings.schedule ?? null),
    resendOnChange: resendOnChangeOf(l.settings),
    assetReady: l.settings.assetReady === true,
    reviewNeeded: l.settings.reviewNeeded === true,
    milestone: l.settings.milestone === true,
    active: l.active,
    gradeKeys: teams.filter((t) => t.listId === l.id).map((t) => t.gradeKey),
    members: members
      .filter((m) => m.listId === l.id)
      .map((m) => ({ name: m.name, email: m.email })),
    createdAt: l.createdAt,
  }));
}

/** Create (id null) or replace a list; null when the id isn't this club's. */
export async function saveEmailList(
  tenantId: number,
  id: number | null,
  input: EmailListInput,
): Promise<EmailListView | null> {
  checkListInput(input);
  const savedId = await db.transaction(async (tx) => {
    const values = {
      kind: input.kind,
      name: input.name.trim(),
      settings: settingsFor(input),
      active: input.active ?? true,
    };
    let listId: number;
    if (id == null) {
      const [row] = await tx
        .insert(emailListsTable)
        .values({ tenantId, ...values })
        .returning({ id: emailListsTable.id });
      listId = row.id;
    } else {
      const [row] = await tx
        .update(emailListsTable)
        .set(values)
        .where(and(eq(emailListsTable.id, id), eq(emailListsTable.tenantId, tenantId)))
        .returning({ id: emailListsTable.id });
      if (!row) return null;
      listId = row.id;
      await tx.delete(emailListMembersTable).where(eq(emailListMembersTable.listId, listId));
      await tx.delete(emailListTeamsTable).where(eq(emailListTeamsTable.listId, listId));
    }
    const members = cleanMembers(input.members);
    if (members.length > 0) {
      await tx
        .insert(emailListMembersTable)
        .values(members.map((m) => ({ tenantId, listId, ...m })));
    }
    // Social lists cover no grades.
    const grades = input.kind === "social" ? [] : cleanGrades(input.gradeKeys);
    if (grades.length > 0) {
      await tx
        .insert(emailListTeamsTable)
        .values(grades.map((gradeKey) => ({ tenantId, listId, gradeKey })));
    }
    return listId;
  });
  if (savedId == null) return null;
  const [view] = await listEmailLists(tenantId, [savedId]);
  return view ?? null;
}

export async function deleteEmailList(tenantId: number, id: number): Promise<boolean> {
  const rows = await db
    .delete(emailListsTable)
    .where(and(eq(emailListsTable.id, id), eq(emailListsTable.tenantId, tenantId)))
    .returning({ id: emailListsTable.id });
  return rows.length > 0;
}
