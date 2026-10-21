import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import {
  db,
  emailListMembersTable,
  emailListTeamsTable,
  emailListsTable,
  emailSendsTable,
  fixturesTable,
  juniorFixturesTable,
  selectionsTable,
  socialDraftsTable,
  type EmailListSection,
  type EmailListSettings,
  type EmailSendRow,
  type SocialDraftRow,
} from "@workspace/db";
import { env } from "../config";
import { emailEnabled, sendEmail } from "./integrations/email";
import { renderHtmlToPdf } from "./card-video-renderer";
import {
  TeamSheetError,
  absoluteLogoUrl,
  buildTeamSheet,
  renderTeamSheetHtml,
  renderTeamSheetsHtml,
  type TeamSheet,
} from "./team-sheet";
import { logger as defaultLogger } from "./logger";
import {
  resendOnChangeOf,
  scheduleDueAt,
  groupRecipients,
  sendModeOf,
  teamSheetEmail,
  teamSheetKey,
  teamSheetsEmail,
  teamSheetsFileName,
} from "./team-sheet-email";
import {
  assetReadyEmail,
  assetReadyKey,
  digestEmail,
  digestKey,
  isMilestoneDraft,
  queueLink,
  socialToggleOn,
  type SocialEmailKind,
} from "./social-list-email";
import { fixtureSection } from "./availability-grades";
import { juniorSideLabel, loadSideFixture, sideSection } from "./selection-fixtures";
import { getTenantBrand } from "./tenant-brand";

export { sendModeOf, teamSheetEmail, teamSheetKey };

/**
 * Email distribution lists: the outbox (.10x/decisions/architect/email-distribution-lists.md).
 * A send is queued as an `email_sends` row alongside the change it reports
 * (idempotency key unique, so a repeat finalise of the same version queues
 * nothing), then drained after commit and again by the hourly sweep, which
 * also retries failures. Email never blocks the state change it describes;
 * addresses are read at send time and never written to the log.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;
type Logger = {
  warn: (obj: unknown, msg?: string) => void;
  info?: (obj: unknown, msg?: string) => void;
};

/** Attempts before a failed send stops being retried. */
export const MAX_EMAIL_ATTEMPTS = 3;
/** A row stuck in "sending" this long (server died mid-send) is put back in the queue. */
export const STALE_SENDING_MS = 15 * 60 * 1000;

/** A batch row: several sides, sent per recipient group with one combined PDF each. */
export const BATCH_KIND = "team_sheet_batch";

const numbers = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * The active team-sheet lists of one section covering a grade (senior) or a
 * junior team label (junior). A senior list never matches a junior side and a
 * junior list never a senior one, even when the keys read the same.
 */
async function listsForGrade(
  ex: Executor,
  tenantId: number,
  grade: string,
  section: EmailListSection,
) {
  return ex
    .select({ id: emailListsTable.id, settings: emailListsTable.settings })
    .from(emailListsTable)
    .innerJoin(emailListTeamsTable, eq(emailListTeamsTable.listId, emailListsTable.id))
    .where(
      and(
        eq(emailListsTable.tenantId, tenantId),
        eq(emailListsTable.kind, "team_sheet"),
        eq(emailListsTable.section, section),
        eq(emailListsTable.active, true),
        eq(emailListTeamsTable.tenantId, tenantId),
        eq(emailListTeamsTable.gradeKey, grade),
      ),
    );
}

/**
 * The lists that take this version of a side. A list with resendOnChange off
 * that was already sent an earlier version drops the new one; the same version
 * again is a no-op anyway (idempotency key).
 */
async function listsTakingVersion<L extends { id: number; settings: EmailListSettings }>(
  ex: Executor,
  tenantId: number,
  selectionId: number,
  version: number,
  lists: L[],
): Promise<L[]> {
  const out: L[] = [];
  for (const l of lists) {
    if (!resendOnChangeOf(l.settings)) {
      const [earlier] = await ex
        .select({ id: emailSendsTable.id })
        .from(emailSendsTable)
        .where(
          and(
            eq(emailSendsTable.tenantId, tenantId),
            eq(emailSendsTable.listId, l.id),
            eq(emailSendsTable.kind, "team_sheet"),
            eq(emailSendsTable.subjectType, "selection"),
            eq(emailSendsTable.subjectId, selectionId),
            ne(emailSendsTable.status, "skipped"),
            ne(emailSendsTable.idempotencyKey, `${teamSheetKey(selectionId, version)}:l${l.id}`),
          ),
        )
        .limit(1);
      if (earlier) continue;
    }
    out.push(l);
  }
  return out;
}

/**
 * Queue the finalised sheet for every "on publish" list of the side's section
 * covering its grade (senior) or team (junior). Runs inside the finalise
 * transaction, so the queue and the side commit together.
 */
export async function enqueueTeamSheetOnFinalise(
  tx: Tx,
  input: {
    tenantId: number;
    selectionId: number;
    version: number;
    grade: string;
    section: EmailListSection;
    origin: string | null;
  },
): Promise<number> {
  const lists = await listsTakingVersion(
    tx,
    input.tenantId,
    input.selectionId,
    input.version,
    (await listsForGrade(tx, input.tenantId, input.grade, input.section)).filter(
      (l) => sendModeOf(l.settings) === "on_publish",
    ),
  );
  if (lists.length === 0) return 0;
  const rows = await tx
    .insert(emailSendsTable)
    .values(
      lists.map((l) => ({
        tenantId: input.tenantId,
        listId: l.id,
        kind: "team_sheet",
        subjectType: "selection",
        subjectId: input.selectionId,
        idempotencyKey: `${teamSheetKey(input.selectionId, input.version)}:l${l.id}`,
        payload: { origin: input.origin, grade: input.grade, section: input.section },
      })),
    )
    .onConflictDoNothing({ target: emailSendsTable.idempotencyKey })
    .returning({ id: emailSendsTable.id });
  return rows.length;
}

/** How far ahead a scheduled send looks for the coming round's fixtures. */
const SCHEDULE_LOOKAHEAD_MS = 8 * 24 * 60 * 60 * 1000;
/** A fixture that started this recently still counts as the coming round. */
const SCHEDULE_LOOKBACK_MS = 12 * 60 * 60 * 1000;

/**
 * Scheduled team-sheet lists (hourly sweep): each list whose weekly slot fell
 * in the last hour is due, per covered grade (senior list) or team (junior
 * list), the finalised side of that section for the coming round. All of a
 * club's due lists go out as one batch, so a contact on several gets one email
 * with one PDF. Each list's slot is batched once (`slots` in the payload).
 */
export async function enqueueScheduledTeamSheets(
  now: Date,
  opts: { tenantId?: number } = {},
): Promise<number> {
  const lists = await db
    .select({
      id: emailListsTable.id,
      tenantId: emailListsTable.tenantId,
      section: emailListsTable.section,
      settings: emailListsTable.settings,
    })
    .from(emailListsTable)
    .where(
      and(
        eq(emailListsTable.kind, "team_sheet"),
        eq(emailListsTable.active, true),
        sql`${emailListsTable.settings}->>'sendMode' = 'scheduled'`,
        opts.tenantId != null ? eq(emailListsTable.tenantId, opts.tenantId) : undefined,
      ),
    );
  const origin = env.RENDER_HARNESS_ORIGIN() ?? null;
  // One batch per club per sweep: a contact on several due lists gets one email.
  const due = new Map<number, { slots: string[]; listIds: number[]; sideIds: number[] }>();
  for (const list of lists) {
    const at = scheduleDueAt(list.settings.schedule, now);
    if (!at) continue;
    // Each list's weekly slot is batched once, whichever sweep (and batch) took it.
    const slot = `l${list.id}@${at.toISOString()}`;
    const [taken] = await db
      .select({ id: emailSendsTable.id })
      .from(emailSendsTable)
      .where(
        and(
          eq(emailSendsTable.tenantId, list.tenantId),
          eq(emailSendsTable.kind, BATCH_KIND),
          sql`${emailSendsTable.payload}->'slots' ? ${slot}`,
        ),
      )
      .limit(1);
    if (taken) continue;
    const grades = await db
      .select({ grade: emailListTeamsTable.gradeKey })
      .from(emailListTeamsTable)
      .where(
        and(
          eq(emailListTeamsTable.tenantId, list.tenantId),
          eq(emailListTeamsTable.listId, list.id),
        ),
      )
      .orderBy(asc(emailListTeamsTable.gradeKey));
    const from = new Date(now.getTime() - SCHEDULE_LOOKBACK_MS);
    const to = new Date(now.getTime() + SCHEDULE_LOOKAHEAD_MS);
    const entry = due.get(list.tenantId) ?? { slots: [], listIds: [], sideIds: [] };
    for (const { grade } of grades) {
      const side =
        list.section === "junior"
          ? await comingJuniorSide(list.tenantId, grade, from, to)
          : await comingSeniorSide(list.tenantId, grade, from, to);
      if (side && !entry.sideIds.includes(side.id)) entry.sideIds.push(side.id);
    }
    entry.slots.push(slot);
    entry.listIds.push(list.id);
    due.set(list.tenantId, entry);
  }
  let queued = 0;
  for (const [tenantId, entry] of due) {
    if (entry.sideIds.length === 0) continue;
    const rows = await db
      .insert(emailSendsTable)
      .values({
        tenantId,
        listId: null,
        kind: BATCH_KIND,
        subjectType: "batch",
        subjectId: entry.sideIds[0],
        idempotencyKey: `batch:scheduled:t${tenantId}:${[...entry.slots].sort().join(",")}`,
        payload: {
          selectionIds: entry.sideIds,
          listIds: entry.listIds,
          slots: entry.slots,
          origin,
          reason: "scheduled",
        },
      })
      .onConflictDoNothing({ target: emailSendsTable.idempotencyKey })
      .returning({ id: emailSendsTable.id });
    queued += rows.length;
  }
  return queued;
}

/** The earliest finalised senior side of a grade starting in the window. */
async function comingSeniorSide(tenantId: number, grade: string, from: Date, to: Date) {
  if (fixtureSection(grade) !== "senior") return null;
  const [side] = await db
    .select({ id: selectionsTable.id, version: selectionsTable.version })
    .from(selectionsTable)
    .innerJoin(fixturesTable, eq(fixturesTable.id, selectionsTable.fixtureId))
    .where(
      and(
        eq(selectionsTable.tenantId, tenantId),
        eq(fixturesTable.tenantId, tenantId),
        eq(selectionsTable.state, "final"),
        isNull(selectionsTable.juniorFixtureId),
        eq(fixturesTable.grade, grade),
        gte(fixturesTable.startAt, from),
        lte(fixturesTable.startAt, to),
      ),
    )
    .orderBy(asc(fixturesTable.startAt))
    .limit(1);
  return side ?? null;
}

/**
 * The earliest finalised junior side of a team (its juniorSideLabel) starting
 * in the window. The label is derived, so candidates are matched here.
 */
async function comingJuniorSide(tenantId: number, team: string, from: Date, to: Date) {
  const rows = await db
    .select({
      id: selectionsTable.id,
      version: selectionsTable.version,
      teamName: juniorFixturesTable.teamName,
      grade: juniorFixturesTable.grade,
      ageGroup: juniorFixturesTable.ageGroup,
    })
    .from(selectionsTable)
    .innerJoin(juniorFixturesTable, eq(juniorFixturesTable.id, selectionsTable.juniorFixtureId))
    .where(
      and(
        eq(selectionsTable.tenantId, tenantId),
        eq(juniorFixturesTable.tenantId, tenantId),
        eq(selectionsTable.state, "final"),
        gte(juniorFixturesTable.startAt, from),
        lte(juniorFixturesTable.startAt, to),
      ),
    )
    .orderBy(asc(juniorFixturesTable.startAt));
  const side = rows.find((r) => juniorSideLabel(r) === team);
  return side ? { id: side.id, version: side.version } : null;
}

/** The club's active social lists with this email switched on. */
async function socialListsFor(ex: Executor, tenantId: number, kind: SocialEmailKind) {
  const lists = await ex
    .select({
      id: emailListsTable.id,
      settings: emailListsTable.settings,
      createdAt: emailListsTable.createdAt,
    })
    .from(emailListsTable)
    .where(
      and(
        eq(emailListsTable.tenantId, tenantId),
        eq(emailListsTable.kind, "social"),
        eq(emailListsTable.active, true),
      ),
    );
  return lists.filter((l) => socialToggleOn(l.settings, kind));
}

/** Junior cards never reach a club list (juniors isolation). */
const seniorDraft = () =>
  sql`(${socialDraftsTable.sourceMatchIsJunior} = false AND coalesce(${socialDraftsTable.cardInput}->>'junior', 'false') <> 'true')`;

const isJuniorDraft = (d: SocialDraftRow): boolean =>
  d.sourceMatchIsJunior || (d.cardInput as { junior?: unknown } | null)?.junior === true;

/**
 * Queue "card ready to post" for each senior draft and each social list with
 * assetReady on: one send per draft per list (key sa:{draftId}:asset_ready:l{listId}).
 */
export async function enqueueAssetReady(
  ex: Executor,
  input: { tenantId: number; draftIds: number[]; origin: string | null },
): Promise<number> {
  if (input.draftIds.length === 0) return 0;
  const lists = await socialListsFor(ex, input.tenantId, "asset_ready");
  if (lists.length === 0) return 0;
  const drafts = await ex
    .select({ id: socialDraftsTable.id })
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, input.tenantId),
        inArray(socialDraftsTable.id, input.draftIds),
        seniorDraft(),
      ),
    );
  if (drafts.length === 0) return 0;
  const rows = await ex
    .insert(emailSendsTable)
    .values(
      lists.flatMap((l) =>
        drafts.map((d) => ({
          tenantId: input.tenantId,
          listId: l.id,
          kind: "asset_ready",
          subjectType: "social_draft",
          subjectId: d.id,
          idempotencyKey: assetReadyKey(d.id, l.id),
          payload: { origin: input.origin },
        })),
      ),
    )
    .onConflictDoNothing({ target: emailSendsTable.idempotencyKey })
    .returning({ id: emailSendsTable.id });
  return rows.length;
}

/** Drafts that no earlier batch of this kind listed for the list. */
const notYetListed = (listId: number, kind: SocialEmailKind) => sql`NOT EXISTS (
  SELECT 1 FROM email_sends s
  WHERE s.list_id = ${listId} AND s.kind = ${kind}
    AND s.payload->'draftIds' @> to_jsonb(${socialDraftsTable.id}))`;

/** How far back a sweep batch looks for drafts. */
const DIGEST_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;
/** The most drafts one batch email lists. */
const DIGEST_MAX = 50;

/**
 * One "review needed" and one "milestone" email per list per sweep, listing
 * the senior drafts made since the list was created that no earlier batch
 * listed. Runs from the hourly sweep, after the draft sweep.
 */
export async function enqueueSocialDigests(
  now: Date,
  opts: { tenantId?: number } = {},
): Promise<number> {
  const tenants = await db
    .selectDistinct({ tenantId: emailListsTable.tenantId })
    .from(emailListsTable)
    .where(
      and(
        eq(emailListsTable.kind, "social"),
        eq(emailListsTable.active, true),
        opts.tenantId != null ? eq(emailListsTable.tenantId, opts.tenantId) : undefined,
      ),
    );
  const windowStart = new Date(now.getTime() - DIGEST_WINDOW_MS);
  const origin = env.RENDER_HARNESS_ORIGIN() ?? null;
  let queued = 0;
  for (const { tenantId } of tenants) {
    for (const kind of ["review_needed", "milestone"] as const) {
      for (const list of await socialListsFor(db, tenantId, kind)) {
        const since = list.createdAt > windowStart ? list.createdAt : windowStart;
        const drafts = await db
          .select({
            id: socialDraftsTable.id,
            engine: socialDraftsTable.engine,
            family: socialDraftsTable.family,
          })
          .from(socialDraftsTable)
          .where(
            and(
              eq(socialDraftsTable.tenantId, tenantId),
              kind === "review_needed"
                ? eq(socialDraftsTable.status, "awaiting_review")
                : inArray(socialDraftsTable.status, ["awaiting_review", "ready"]),
              gte(socialDraftsTable.createdAt, since),
              seniorDraft(),
              notYetListed(list.id, kind),
            ),
          )
          .orderBy(asc(socialDraftsTable.id));
        const ids = (kind === "milestone" ? drafts.filter(isMilestoneDraft) : drafts)
          .slice(0, DIGEST_MAX)
          .map((d) => d.id);
        if (ids.length === 0) continue;
        const rows = await db
          .insert(emailSendsTable)
          .values({
            tenantId,
            listId: list.id,
            kind,
            subjectType: "social_drafts",
            subjectId: ids[0],
            idempotencyKey: digestKey(kind, list.id, ids),
            payload: { draftIds: ids, origin },
          })
          .onConflictDoNothing({ target: emailSendsTable.idempotencyKey })
          .returning({ id: emailSendsTable.id });
        queued += rows.length;
      }
    }
  }
  return queued;
}

/**
 * The club's active social list addresses (any toggle), de-duplicated, for the
 * in-app notices that echo by email (draft-notifications). Never logged.
 */
export async function socialListAddresses(tenantId: number): Promise<string[]> {
  const rows = await db
    .select({ email: emailListMembersTable.email })
    .from(emailListMembersTable)
    .innerJoin(emailListsTable, eq(emailListsTable.id, emailListMembersTable.listId))
    .where(
      and(
        eq(emailListMembersTable.tenantId, tenantId),
        eq(emailListsTable.tenantId, tenantId),
        eq(emailListsTable.kind, "social"),
        eq(emailListsTable.active, true),
      ),
    );
  const seen = new Set<string>();
  return rows
    .map((r) => r.email)
    .filter((e) => {
      const k = e.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export class EmailOutboxError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * "Email team sheet" by hand: queue the finalised side for every list covering
 * its grade that isn't switched off. Each click sends again on purpose.
 */
export async function enqueueTeamSheetManual(input: {
  tenantId: number;
  selectionId: number;
  origin: string | null;
  now?: Date;
}): Promise<number> {
  const [side] = await db
    .select({
      state: selectionsTable.state,
      version: selectionsTable.version,
      fixtureId: selectionsTable.fixtureId,
      juniorFixtureId: selectionsTable.juniorFixtureId,
    })
    .from(selectionsTable)
    .where(
      and(eq(selectionsTable.id, input.selectionId), eq(selectionsTable.tenantId, input.tenantId)),
    );
  if (!side) throw new EmailOutboxError(404, "Side not found");
  if (side.state !== "final")
    throw new EmailOutboxError(409, "Finalise the side before emailing it.");
  // The key lists match on: a senior grade, or a junior side's team label (as on finalise).
  const fixture = await loadSideFixture(db, input.tenantId, side);
  if (!fixture) throw new EmailOutboxError(404, "Side not found");
  const grade = fixture.grade;
  const section = sideSection(fixture);
  const lists = (await listsForGrade(db, input.tenantId, grade, section)).filter(
    (l) => sendModeOf(l.settings) !== "off",
  );
  if (lists.length === 0) {
    throw new EmailOutboxError(
      409,
      `No ${section} email list covers ${grade}. Add one in Admin → Email lists.`,
    );
  }
  const stamp = (input.now ?? new Date()).getTime();
  const rows = await db
    .insert(emailSendsTable)
    .values(
      lists.map((l) => ({
        tenantId: input.tenantId,
        listId: l.id,
        kind: "team_sheet",
        subjectType: "selection",
        subjectId: input.selectionId,
        idempotencyKey: `${teamSheetKey(input.selectionId, side.version)}:l${l.id}:manual:${stamp}`,
        payload: { origin: input.origin, grade, section, manual: true },
      })),
    )
    .onConflictDoNothing({ target: emailSendsTable.idempotencyKey })
    .returning({ id: emailSendsTable.id });
  return rows.length;
}

/**
 * "Email all" from the Selection Hub: queue the finalised sides shown on the
 * board as one batch. Each contact then gets one email with every sheet they
 * are due (across all their lists) as pages of one PDF. Every click sends again.
 */
export async function enqueueTeamSheetBatch(input: {
  tenantId: number;
  selectionIds: number[];
  origin: string | null;
  now?: Date;
}): Promise<{ sides: number }> {
  const wanted = [...new Set(input.selectionIds)];
  const rows =
    wanted.length === 0
      ? []
      : await db
          .select({
            id: selectionsTable.id,
            state: selectionsTable.state,
            fixtureId: selectionsTable.fixtureId,
            juniorFixtureId: selectionsTable.juniorFixtureId,
          })
          .from(selectionsTable)
          .where(
            and(eq(selectionsTable.tenantId, input.tenantId), inArray(selectionsTable.id, wanted)),
          );
  const final = new Map(rows.filter((r) => r.state === "final").map((r) => [r.id, r]));
  const ids = wanted.filter((id) => final.has(id));
  if (ids.length === 0) {
    throw new EmailOutboxError(409, "No finalised sides to email. Finalise a side first.");
  }
  let covered = false;
  for (const id of ids) {
    const fixture = await loadSideFixture(db, input.tenantId, final.get(id)!);
    if (!fixture) continue;
    const lists = await listsForGrade(db, input.tenantId, fixture.grade, sideSection(fixture));
    if (lists.some((l) => sendModeOf(l.settings) !== "off")) {
      covered = true;
      break;
    }
  }
  if (!covered) {
    throw new EmailOutboxError(
      409,
      "No email list covers these sides. Add one in Admin → Email lists.",
    );
  }
  const stamp = (input.now ?? new Date()).getTime();
  await db.insert(emailSendsTable).values({
    tenantId: input.tenantId,
    listId: null,
    kind: BATCH_KIND,
    subjectType: "batch",
    subjectId: ids[0],
    idempotencyKey: `batch:email_all:t${input.tenantId}:${stamp}`,
    payload: { selectionIds: ids, listIds: null, origin: input.origin, reason: "email_all" },
  });
  return { sides: ids.length };
}

/** Re-queue one logged send (any status) as a fresh row. */
export async function requeueSend(tenantId: number, sendId: number, now = new Date()) {
  const [row] = await db
    .select()
    .from(emailSendsTable)
    .where(and(eq(emailSendsTable.id, sendId), eq(emailSendsTable.tenantId, tenantId)));
  if (!row) throw new EmailOutboxError(404, "Send not found");
  const [copy] = await db
    .insert(emailSendsTable)
    .values({
      tenantId,
      listId: row.listId,
      kind: row.kind,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      idempotencyKey: `${row.idempotencyKey}:resend:${now.getTime()}`,
      // A resent batch goes to every group again, not only the ones that failed.
      payload: { ...row.payload, sentGroups: [], resendOf: row.id },
    })
    .returning();
  return copy;
}

const fileName = (sheet: TeamSheet) =>
  `team-sheet-${sheet.grade}-${sheet.round ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") + ".pdf";

type SendOutcome =
  | { status: "sent"; recipients: number; note?: string }
  | { status: "skipped"; reason: string; recipients?: number }
  | { status: "failed"; error: string; recipients: number };

/**
 * The list's addresses (read at send time, never logged) and the sender, or
 * why the row is skipped. The club's own address goes in "to"; contacts are
 * bcc'd so none sees the others.
 */
async function recipientsFor(
  row: ListSendRow,
): Promise<{ from: string; recipients: string[] } | SendOutcome> {
  const members = await db
    .select({ email: emailListMembersTable.email })
    .from(emailListMembersTable)
    .where(
      and(
        eq(emailListMembersTable.listId, row.listId),
        eq(emailListMembersTable.tenantId, row.tenantId),
      ),
    );
  if (members.length === 0) return { status: "skipped", reason: "The list has no members." };
  const from = env.EMAIL_FROM();
  if (!emailEnabled() || !from) return { status: "skipped", reason: "Email is not configured." };
  return { from, recipients: members.map((m) => m.email) };
}

const payloadOrigin = (row: EmailSendRow): string | null =>
  (typeof row.payload.origin === "string" ? row.payload.origin : null) ??
  env.RENDER_HARNESS_ORIGIN() ??
  null;

function finish(
  result: Awaited<ReturnType<typeof sendEmail>>,
  recipients: number,
  note?: string,
): SendOutcome {
  if (result.sent) return { status: "sent", recipients, note };
  if (result.reason === "disabled")
    return { status: "skipped", reason: "Email is not configured." };
  return { status: "failed", error: result.error ?? "Send failed", recipients };
}

async function deliverTeamSheet(row: ListSendRow): Promise<SendOutcome> {
  const to = await recipientsFor(row);
  if ("status" in to) return to;

  let sheet: TeamSheet;
  try {
    sheet = await buildTeamSheet(row.tenantId, row.subjectId);
  } catch (err) {
    // The side was reopened or removed before the send: nothing to send.
    if (err instanceof TeamSheetError) return { status: "skipped", reason: err.message };
    throw err;
  }
  // A senior list only ever gets a senior sheet and a junior list a junior one.
  const [list] = await db
    .select({ section: emailListsTable.section })
    .from(emailListsTable)
    .where(and(eq(emailListsTable.id, row.listId), eq(emailListsTable.tenantId, row.tenantId)));
  if (!list || list.section !== sheet.section)
    return {
      status: "skipped",
      reason: `A ${list?.section ?? "removed"} list doesn't get ${sheet.section} sheets.`,
    };
  const pdf = await renderHtmlToPdf(
    renderTeamSheetHtml(sheet, absoluteLogoUrl(sheet.logoUrl, payloadOrigin(row))),
  );

  // "UPDATED" when this list was already sent an earlier version of the side.
  const [earlier] = await db
    .select({ id: emailSendsTable.id })
    .from(emailSendsTable)
    .where(
      and(
        eq(emailSendsTable.tenantId, row.tenantId),
        eq(emailSendsTable.listId, row.listId),
        eq(emailSendsTable.subjectType, row.subjectType),
        eq(emailSendsTable.subjectId, row.subjectId),
        eq(emailSendsTable.status, "sent"),
        lt(emailSendsTable.id, row.id),
      ),
    )
    .limit(1);
  const { subject, text } = teamSheetEmail(sheet, earlier != null && row.payload.manual !== true);
  const result = await sendEmail({
    to: to.from,
    bcc: to.recipients,
    subject,
    text,
    attachments: [
      { filename: fileName(sheet), content: Buffer.from(pdf), contentType: "application/pdf" },
    ],
  });
  return finish(result, to.recipients.length);
}

/**
 * A batch: every contact on a list (not switched off; for a scheduled batch,
 * only its due lists) covering one of the sides gets the sheets they're due as
 * pages of one PDF, in one email. Contacts due the same sheets share one bcc'd
 * email. Senior and junior sheets never share an email. A group already sent
 * is recorded by its sheet set (never an address), so a retry sends only the rest.
 */
async function deliverTeamSheetBatch(row: EmailSendRow): Promise<SendOutcome> {
  const from = env.EMAIL_FROM();
  if (!emailEnabled() || !from) return { status: "skipped", reason: "Email is not configured." };
  const ids = numbers(row.payload.selectionIds);
  const only = Array.isArray(row.payload.listIds) ? numbers(row.payload.listIds) : null;
  const sentGroups = strings(row.payload.sentGroups);
  const sides =
    ids.length === 0
      ? []
      : await db
          .select({
            id: selectionsTable.id,
            state: selectionsTable.state,
            fixtureId: selectionsTable.fixtureId,
            juniorFixtureId: selectionsTable.juniorFixtureId,
          })
          .from(selectionsTable)
          .where(and(eq(selectionsTable.tenantId, row.tenantId), inArray(selectionsTable.id, ids)));

  // Per section: address (first spelling kept) -> the sides it is due, in batch order.
  const due = { senior: new Map<string, number[]>(), junior: new Map<string, number[]>() };
  const spelling = new Map<string, string>();
  for (const id of ids) {
    const side = sides.find((s) => s.id === id);
    if (!side || side.state !== "final") continue;
    const fixture = await loadSideFixture(db, row.tenantId, side);
    if (!fixture) continue;
    const section = sideSection(fixture);
    const lists = (await listsForGrade(db, row.tenantId, fixture.grade, section)).filter(
      (l) => sendModeOf(l.settings) !== "off" && (!only || only.includes(l.id)),
    );
    if (lists.length === 0) continue;
    const members = await db
      .select({ email: emailListMembersTable.email })
      .from(emailListMembersTable)
      .where(
        and(
          eq(emailListMembersTable.tenantId, row.tenantId),
          inArray(
            emailListMembersTable.listId,
            lists.map((l) => l.id),
          ),
        ),
      );
    for (const m of members) {
      const address = m.email.trim();
      const key = address.toLowerCase();
      if (!spelling.has(key)) spelling.set(key, address);
      const got = due[section].get(key) ?? [];
      if (!got.includes(id)) got.push(id);
      due[section].set(key, got);
    }
  }

  const groups = (["senior", "junior"] as const).flatMap((section) =>
    groupRecipients(due[section]).map((g) => ({
      key: `${section}:${g.ids.join(",")}`,
      ids: g.ids,
      to: g.to.map((k) => spelling.get(k) ?? k),
    })),
  );
  if (groups.length === 0)
    return { status: "skipped", reason: "No list with contacts covers these sides." };

  const origin = payloadOrigin(row);
  const sheets = new Map<number, TeamSheet | null>();
  const sheetOf = async (id: number) => {
    if (!sheets.has(id)) {
      try {
        sheets.set(id, await buildTeamSheet(row.tenantId, id));
      } catch (err) {
        // Re-opened or removed since it was queued: left out of the email.
        if (!(err instanceof TeamSheetError)) throw err;
        sheets.set(id, null);
      }
    }
    return sheets.get(id) ?? null;
  };

  let reached = 0;
  const errors: string[] = [];
  for (const g of groups) {
    if (sentGroups.includes(g.key)) {
      reached += g.to.length;
      continue;
    }
    const pages = (await Promise.all(g.ids.map(sheetOf))).filter((s): s is TeamSheet => !!s);
    if (pages.length === 0) continue;
    const pdf = await renderHtmlToPdf(
      renderTeamSheetsHtml(
        pages.map((sheet) => ({ sheet, logoSrc: absoluteLogoUrl(sheet.logoUrl, origin) })),
      ),
    );
    const { subject, text } = teamSheetsEmail(pages);
    const result = await sendEmail({
      to: from,
      bcc: g.to,
      subject,
      text,
      attachments: [
        {
          filename: teamSheetsFileName(pages),
          content: Buffer.from(pdf),
          contentType: "application/pdf",
        },
      ],
    });
    if (result.sent) {
      reached += g.to.length;
      sentGroups.push(g.key);
      await db
        .update(emailSendsTable)
        .set({ payload: { ...row.payload, sentGroups } })
        .where(eq(emailSendsTable.id, row.id));
    } else if (result.reason === "disabled") {
      return { status: "skipped", reason: "Email is not configured." };
    } else {
      errors.push(result.error ?? "Send failed");
    }
  }
  if (errors.length > 0)
    return {
      status: "failed",
      error: `${errors.length} of ${groups.length} emails failed: ${errors[0]}`,
      recipients: reached,
    };
  if (reached === 0)
    return { status: "skipped", reason: "None of the sides is finalised any more." };
  return { status: "sent", recipients: reached };
}

type CardPngRenderer = (draft: SocialDraftRow, origin: string | null) => Promise<Buffer[]>;
let cardPngRenderer: CardPngRenderer | null = null;

/** Test seam: CI has no Chromium, so tests swap the card PNG renderer. */
export function setCardPngRenderer(fn: CardPngRenderer | null): void {
  cardPngRenderer = fn;
}

/** The card's PNGs at the club's first enabled size, via the /__card-render harness. */
async function renderCardPngs(draft: SocialDraftRow, origin: string | null): Promise<Buffer[]> {
  if (cardPngRenderer) return cardPngRenderer(draft, origin);
  // Loaded on use: it pulls in the pack and sponsor stack the team-sheet path never needs.
  const { canRenderHeadless, enabledSizes, renderDraftSlides } = await import("./draft-render");
  if (!canRenderHeadless() && !origin) throw new Error("no render harness configured");
  const [size] = await enabledSizes(draft.tenantId);
  const slides = await renderDraftSlides(draft, [size], origin, defaultLogger);
  return slides.map((s) => s.png);
}

async function deliverAssetReady(row: ListSendRow): Promise<SendOutcome> {
  const [draft] = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(eq(socialDraftsTable.id, row.subjectId), eq(socialDraftsTable.tenantId, row.tenantId)),
    );
  if (!draft || draft.status === "dismissed")
    return { status: "skipped", reason: "The card was removed." };
  if (isJuniorDraft(draft)) return { status: "skipped", reason: "Junior cards aren't emailed." };
  const to = await recipientsFor(row);
  if ("status" in to) return to;
  const origin = payloadOrigin(row);
  let pngs: Buffer[] = [];
  let note: string | undefined;
  try {
    pngs = await renderCardPngs(draft, origin);
  } catch (err) {
    // Send anyway, with a link to the queue instead of the image.
    note = `Sent with a queue link: the card image didn't render (${err instanceof Error ? err.message : String(err)}).`;
  }
  const brand = await getTenantBrand(row.tenantId);
  const { subject, text } = assetReadyEmail({
    clubName: brand.name ?? "Club",
    draft,
    link: queueLink(origin, [draft.id]),
    attached: pngs.length > 0,
  });
  const result = await sendEmail({
    to: to.from,
    bcc: to.recipients,
    subject,
    text,
    attachments: pngs.map((content, i) => ({
      filename: pngs.length > 1 ? `card-${draft.id}-${i + 1}.png` : `card-${draft.id}.png`,
      content,
      contentType: "image/png",
    })),
  });
  return finish(result, to.recipients.length, note);
}

async function deliverDigest(
  row: ListSendRow,
  kind: "review_needed" | "milestone",
): Promise<SendOutcome> {
  const raw = row.payload.draftIds;
  const ids = Array.isArray(raw) ? raw.filter((v): v is number => typeof v === "number") : [];
  const drafts =
    ids.length === 0
      ? []
      : await db
          .select({
            id: socialDraftsTable.id,
            caption: socialDraftsTable.caption,
            cardInput: socialDraftsTable.cardInput,
          })
          .from(socialDraftsTable)
          .where(
            and(
              eq(socialDraftsTable.tenantId, row.tenantId),
              inArray(socialDraftsTable.id, ids),
              ne(socialDraftsTable.status, "dismissed"),
              seniorDraft(),
            ),
          )
          .orderBy(asc(socialDraftsTable.id));
  if (drafts.length === 0) return { status: "skipped", reason: "The cards were removed." };
  const to = await recipientsFor(row);
  if ("status" in to) return to;
  const brand = await getTenantBrand(row.tenantId);
  const { subject, text } = digestEmail({
    kind,
    clubName: brand.name ?? "Club",
    drafts,
    link: queueLink(
      payloadOrigin(row),
      drafts.map((d) => d.id),
    ),
  });
  const result = await sendEmail({ to: to.from, bcc: to.recipients, subject, text });
  return finish(result, to.recipients.length);
}

/** A send to one list (every kind but a batch). */
type ListSendRow = EmailSendRow & { listId: number };

async function deliver(row: EmailSendRow): Promise<SendOutcome> {
  if (row.kind === BATCH_KIND) return deliverTeamSheetBatch(row);
  if (row.listId == null) return { status: "skipped", reason: "The list was removed." };
  return deliverToList({ ...row, listId: row.listId });
}

async function deliverToList(row: ListSendRow): Promise<SendOutcome> {
  switch (row.kind) {
    case "team_sheet":
      return deliverTeamSheet(row);
    case "asset_ready":
      return deliverAssetReady(row);
    case "review_needed":
    case "milestone":
      return deliverDigest(row, row.kind);
    default:
      return { status: "skipped", reason: `Unknown kind ${row.kind}` };
  }
}

/**
 * Claim and send queued rows (and failed ones still under the attempt cap),
 * oldest first. Safe to run concurrently: rows are claimed with SKIP LOCKED.
 */
export async function drainOutbox(
  opts: { tenantId?: number; limit?: number; now?: Date; logger?: Logger } = {},
): Promise<{ sent: number; failed: number; skipped: number }> {
  const now = opts.now ?? new Date();
  const log = opts.logger ?? defaultLogger;
  const limit = opts.limit ?? 20;
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);
  const tenantFilter = opts.tenantId != null ? sql`AND tenant_id = ${opts.tenantId}` : sql``;

  const claimed = await db.transaction(async (tx) => {
    const ids = await tx.execute<{ id: number }>(sql`
      SELECT id FROM email_sends
      WHERE (status = 'queued'
         OR (status = 'failed' AND attempts < ${MAX_EMAIL_ATTEMPTS})
         OR (status = 'sending' AND claimed_at < ${staleBefore}))
      ${tenantFilter}
      ORDER BY queued_at, id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`);
    const list = ids.rows.map((r) => Number(r.id));
    if (list.length === 0) return [];
    return tx
      .update(emailSendsTable)
      .set({ status: "sending", claimedAt: now, attempts: sql`${emailSendsTable.attempts} + 1` })
      .where(inArray(emailSendsTable.id, list))
      .returning();
  });

  const totals = { sent: 0, failed: 0, skipped: 0 };
  for (const row of claimed.sort((a, b) => a.id - b.id)) {
    let outcome: SendOutcome;
    try {
      outcome = await deliver(row);
    } catch (err) {
      outcome = {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        recipients: 0,
      };
    }
    totals[outcome.status]++;
    await db
      .update(emailSendsTable)
      .set({
        status: outcome.status,
        lastError:
          outcome.status === "failed"
            ? outcome.error
            : outcome.status === "skipped"
              ? outcome.reason
              : (outcome.note ?? null),
        recipientCount: outcome.recipients ?? 0,
        sentAt: outcome.status === "sent" ? new Date() : null,
      })
      .where(eq(emailSendsTable.id, row.id));
    if (outcome.status === "failed") {
      log.warn(
        { tenantId: row.tenantId, sendId: row.id, attempts: row.attempts, error: outcome.error },
        "list email failed",
      );
    }
  }
  return totals;
}

const inFlight = new Set<Promise<void>>();

/** Fire-and-forget drain after a commit; errors are logged, never thrown. */
export function kickOutbox(tenantId: number, logger?: Logger): void {
  const run = drainOutbox({ tenantId, logger })
    .then(() => undefined)
    .catch((err) => (logger ?? defaultLogger).warn({ tenantId, err }, "email outbox drain failed"));
  inFlight.add(run);
  void run.finally(() => inFlight.delete(run));
}

/** Test helper: wait for every fire-and-forget drain started so far. */
export async function settleOutbox(): Promise<void> {
  while (inFlight.size > 0) await Promise.all([...inFlight]);
}

/** Rows for the admin send log, newest first (no addresses — the table holds none). */
export async function listSends(tenantId: number, opts: { listId?: number; limit?: number } = {}) {
  const rows = await db
    .select({
      id: emailSendsTable.id,
      listId: emailSendsTable.listId,
      listName: emailListsTable.name,
      reason: sql<string | null>`${emailSendsTable.payload}->>'reason'`,
      sheets: sql<number | null>`jsonb_array_length(${emailSendsTable.payload}->'selectionIds')`,
      kind: emailSendsTable.kind,
      subjectType: emailSendsTable.subjectType,
      subjectId: emailSendsTable.subjectId,
      status: emailSendsTable.status,
      attempts: emailSendsTable.attempts,
      lastError: emailSendsTable.lastError,
      recipientCount: emailSendsTable.recipientCount,
      queuedAt: emailSendsTable.queuedAt,
      sentAt: emailSendsTable.sentAt,
    })
    .from(emailSendsTable)
    .leftJoin(
      emailListsTable,
      and(
        eq(emailListsTable.id, emailSendsTable.listId),
        eq(emailListsTable.tenantId, emailSendsTable.tenantId),
      ),
    )
    .where(
      and(
        eq(emailSendsTable.tenantId, tenantId),
        opts.listId != null ? eq(emailSendsTable.listId, opts.listId) : undefined,
      ),
    )
    .orderBy(sql`${emailSendsTable.queuedAt} DESC, ${emailSendsTable.id} DESC`)
    .limit(Math.min(opts.limit ?? 100, 500));
  // A batch has no list: it is named for what sent it.
  return rows.map(({ reason, sheets, ...r }) => ({
    ...r,
    listName:
      r.listName ??
      `${reason === "scheduled" ? "Scheduled team sheets" : "Email all team sheets"}${sheets ? ` (${sheets} ${sheets === 1 ? "side" : "sides"})` : ""}`,
  }));
}
