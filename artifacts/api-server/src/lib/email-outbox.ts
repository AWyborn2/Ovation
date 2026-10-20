import { and, eq, inArray, lt, sql } from "drizzle-orm";
import {
  db,
  emailListMembersTable,
  emailListTeamsTable,
  emailListsTable,
  emailSendsTable,
  selectionsTable,
  type EmailSendRow,
} from "@workspace/db";
import { env } from "../config";
import { emailEnabled, sendEmail } from "./integrations/email";
import { renderHtmlToPdf } from "./card-video-renderer";
import {
  TeamSheetError,
  absoluteLogoUrl,
  buildTeamSheet,
  renderTeamSheetHtml,
  type TeamSheet,
} from "./team-sheet";
import { logger as defaultLogger } from "./logger";
import { sendModeOf, teamSheetEmail, teamSheetKey } from "./team-sheet-email";

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

/** The active team-sheet lists covering a senior grade. */
async function listsForGrade(ex: Executor, tenantId: number, grade: string) {
  return ex
    .select({ id: emailListsTable.id, settings: emailListsTable.settings })
    .from(emailListsTable)
    .innerJoin(emailListTeamsTable, eq(emailListTeamsTable.listId, emailListsTable.id))
    .where(
      and(
        eq(emailListsTable.tenantId, tenantId),
        eq(emailListsTable.kind, "team_sheet"),
        eq(emailListsTable.active, true),
        eq(emailListTeamsTable.gradeKey, grade),
      ),
    );
}

/**
 * Queue the finalised sheet for every "on publish" list covering the grade.
 * Runs inside the finalise transaction, so the queue and the side commit together.
 * Senior sides only: junior sides never reach a club list (juniors isolation).
 */
export async function enqueueTeamSheetOnFinalise(
  tx: Tx,
  input: {
    tenantId: number;
    selectionId: number;
    version: number;
    grade: string;
    origin: string | null;
  },
): Promise<number> {
  const lists = (await listsForGrade(tx, input.tenantId, input.grade)).filter(
    (l) => sendModeOf(l.settings) === "on_publish",
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
        payload: { origin: input.origin, grade: input.grade },
      })),
    )
    .onConflictDoNothing({ target: emailSendsTable.idempotencyKey })
    .returning({ id: emailSendsTable.id });
  return rows.length;
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
  grade: string;
  origin: string | null;
  now?: Date;
}): Promise<number> {
  const [side] = await db
    .select({ state: selectionsTable.state, version: selectionsTable.version })
    .from(selectionsTable)
    .where(
      and(eq(selectionsTable.id, input.selectionId), eq(selectionsTable.tenantId, input.tenantId)),
    );
  if (!side) throw new EmailOutboxError(404, "Side not found");
  if (side.state !== "final")
    throw new EmailOutboxError(409, "Finalise the side before emailing it.");
  const lists = (await listsForGrade(db, input.tenantId, input.grade)).filter(
    (l) => sendModeOf(l.settings) !== "off",
  );
  if (lists.length === 0) {
    throw new EmailOutboxError(
      409,
      `No email list covers ${input.grade}. Add one in Admin → Email lists.`,
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
        payload: { origin: input.origin, grade: input.grade, manual: true },
      })),
    )
    .onConflictDoNothing({ target: emailSendsTable.idempotencyKey })
    .returning({ id: emailSendsTable.id });
  return rows.length;
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
      payload: { ...row.payload, resendOf: row.id },
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
  | { status: "sent"; recipients: number }
  | { status: "skipped"; reason: string; recipients?: number }
  | { status: "failed"; error: string; recipients: number };

async function deliverTeamSheet(row: EmailSendRow): Promise<SendOutcome> {
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
  // The club's own address goes in "to"; contacts are bcc'd so none sees the others.
  const from = env.EMAIL_FROM();
  if (!emailEnabled() || !from) return { status: "skipped", reason: "Email is not configured." };

  let sheet: TeamSheet;
  try {
    sheet = await buildTeamSheet(row.tenantId, row.subjectId);
  } catch (err) {
    // The side was reopened or removed before the send: nothing to send.
    if (err instanceof TeamSheetError) return { status: "skipped", reason: err.message };
    throw err;
  }
  // Juniors isolation: a junior side never reaches a club list.
  if (sheet.section !== "senior")
    return { status: "skipped", reason: "Junior sides aren't emailed." };
  const origin =
    (typeof row.payload.origin === "string" ? row.payload.origin : null) ??
    env.RENDER_HARNESS_ORIGIN() ??
    null;
  const pdf = await renderHtmlToPdf(
    renderTeamSheetHtml(sheet, absoluteLogoUrl(sheet.logoUrl, origin)),
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
  const recipients = members.map((m) => m.email);
  const result = await sendEmail({
    to: from,
    bcc: recipients,
    subject,
    text,
    attachments: [
      { filename: fileName(sheet), content: Buffer.from(pdf), contentType: "application/pdf" },
    ],
  });
  if (result.sent) return { status: "sent", recipients: recipients.length };
  if (result.reason === "disabled")
    return { status: "skipped", reason: "Email is not configured." };
  return { status: "failed", error: result.error ?? "Send failed", recipients: recipients.length };
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
      outcome =
        row.kind === "team_sheet"
          ? await deliverTeamSheet(row)
          : { status: "skipped", reason: `Unknown kind ${row.kind}` };
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
              : null,
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

/** Fire-and-forget drain after a commit; errors are logged, never thrown. */
export function kickOutbox(tenantId: number, logger?: Logger): void {
  void drainOutbox({ tenantId, logger }).catch((err) =>
    (logger ?? defaultLogger).warn({ tenantId, err }, "email outbox drain failed"),
  );
}

/** Rows for the admin send log, newest first (no addresses — the table holds none). */
export async function listSends(tenantId: number, opts: { listId?: number; limit?: number } = {}) {
  return db
    .select({
      id: emailSendsTable.id,
      listId: emailSendsTable.listId,
      listName: emailListsTable.name,
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
    .innerJoin(emailListsTable, eq(emailListsTable.id, emailSendsTable.listId))
    .where(
      and(
        eq(emailSendsTable.tenantId, tenantId),
        opts.listId != null ? eq(emailSendsTable.listId, opts.listId) : undefined,
      ),
    )
    .orderBy(sql`${emailSendsTable.queuedAt} DESC, ${emailSendsTable.id} DESC`)
    .limit(Math.min(opts.limit ?? 100, 500));
}
