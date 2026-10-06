import { Router, type IRouter, type Request } from "express";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, squadMembersTable, type SquadMemberRow } from "@workspace/db";
import {
  GetSquadMemberParams,
  UpdateSquadMemberBody,
  UpdateSquadMemberParams,
  RemoveSquadMemberParams,
  SearchSquadPlayersQueryParams,
} from "@workspace/api-zod";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { adminWriteRateLimiter } from "../middlewares/rate-limit";
import { scorecardUpload, type MulterRequest } from "../lib/import-upload";
import {
  applySquadImport,
  normaliseEmail,
  normaliseMobile,
  parseSquadCsv,
  planSquadImport,
  SquadImportError,
} from "../lib/squad-import";
import { isUnder18OnDate, perthDate } from "../lib/availability-grades";
import { revokeMemberTokens } from "../lib/availability-tokens";
import { linkedPlayerNames, searchClubPlayers } from "../lib/squad-link";

/**
 * The club's squad register for player availability. Admin only. Contact
 * details are admin-only too: the list
 * reports which contacts exist, never their values, and nothing here logs
 * a contact or any cell of the uploaded file.
 */
const router: IRouter = Router();

const SLOTS = [
  {
    key: "account",
    name: "accountHolderName",
    mobile: "accountHolderMobile",
    email: "accountHolderEmail",
    optOut: "accountSmsOptOut",
  },
  {
    key: "guardian1",
    name: "guardian1Name",
    mobile: "guardian1Mobile",
    email: "guardian1Email",
    optOut: "guardian1SmsOptOut",
  },
  {
    key: "guardian2",
    name: "guardian2Name",
    mobile: "guardian2Mobile",
    email: "guardian2Email",
    optOut: "guardian2SmsOptOut",
  },
] as const;

/** Linked player id → name, for the rows being returned (best effort). */
type Names = Map<number, string>;

function serializeBase(r: SquadMemberRow, names: Names) {
  return {
    id: r.id,
    playhqProfileId: r.playhqProfileId,
    firstName: r.firstName,
    lastName: r.lastName,
    preferredName: r.preferredName,
    section: r.section,
    active: r.active,
    activeSetByAdmin: r.activeSetByAdmin,
    under18: isUnder18OnDate(r.dateOfBirth, perthDate(new Date())),
    gradeHint: r.gradeHint,
    teamName: r.teamName,
    ageGroup: r.ageGroup,
    isPrivate: r.isPrivate,
    linkedPlayerId: r.linkedPlayerId,
    linkedPlayerName: r.linkedPlayerId != null ? (names.get(r.linkedPlayerId) ?? null) : null,
    contactChangeFlag: r.contactChangeFlag,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** List shape: contact presence only, never values. */
function serializeSummary(r: SquadMemberRow, names: Names) {
  const out: Record<string, unknown> = serializeBase(r, names);
  for (const s of SLOTS) {
    out[s.key] = {
      hasName: !!r[s.name],
      hasMobile: !!r[s.mobile],
      hasEmail: !!r[s.email],
      smsOptedOut: r[s.optOut],
    };
  }
  return out;
}

/** Admin detail shape: full contacts and date of birth. */
function serializeDetail(r: SquadMemberRow, names: Names) {
  const out: Record<string, unknown> = {
    ...serializeBase(r, names),
    dateOfBirth: r.dateOfBirth,
    contactChangedAt: r.contactChangedAt ? r.contactChangedAt.toISOString() : null,
  };
  for (const s of SLOTS) {
    out[s.key] = {
      name: r[s.name],
      mobile: r[s.mobile],
      email: r[s.email],
      smsOptedOut: r[s.optOut],
    };
  }
  return out;
}

router.post(
  "/squad/import",
  requireAdmin,
  adminWriteRateLimiter,
  scorecardUpload.single("file"),
  async (req: Request, res): Promise<void> => {
    const file = (req as MulterRequest).file;
    if (!file) {
      res.status(400).json({ error: "Missing file field" });
      return;
    }
    let plan;
    try {
      plan = planSquadImport(parseSquadCsv(file.buffer.toString("utf8")));
    } catch (e) {
      if (e instanceof SquadImportError) {
        res.status(400).json({ error: e.message });
        return;
      }
      throw e;
    }
    const tenantId = getTenantId(req);
    const result = await applySquadImport(tenantId, plan);
    // Counts only — never a row's contents.
    req.log?.info(
      {
        tenantId,
        created: result.created,
        updated: result.updated,
        deactivated: result.deactivated,
        contactsKept: result.contactsKept,
        skipped: result.skipped.length,
      },
      "squad import",
    );
    res.json(result);
  },
);

/** Names for the linked players among these rows. */
function namesFor(tenantId: number, rows: SquadMemberRow[]): Promise<Names> {
  return linkedPlayerNames(
    tenantId,
    rows.map((r) => r.linkedPlayerId).filter((id): id is number => id != null),
  );
}

router.get("/squad", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const rows = await db
    .select()
    .from(squadMembersTable)
    .where(eq(squadMembersTable.tenantId, tenantId))
    .orderBy(
      asc(squadMembersTable.lastName),
      asc(squadMembersTable.firstName),
      asc(squadMembersTable.id),
    );
  const names = await namesFor(tenantId, rows);
  res.json(rows.map((r) => serializeSummary(r, names)));
});

// Registered before "/squad/:id" so "player-search" is never read as an id.
router.get("/squad/player-search", requireAdmin, async (req, res): Promise<void> => {
  const query = SearchSquadPlayersQueryParams.safeParse(req.query);
  if (!query.success || query.data.q.trim().length < 2) {
    res.status(400).json({ error: "Type at least two letters to search" });
    return;
  }
  res.json(await searchClubPlayers(getTenantId(req), query.data.q.trim()));
});

router.get("/squad/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = GetSquadMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(squadMembersTable)
    .where(
      and(
        eq(squadMembersTable.id, params.data.id),
        eq(squadMembersTable.tenantId, getTenantId(req)),
      ),
    );
  if (!row) {
    res.status(404).json({ error: "Squad member not found" });
    return;
  }
  res.json(serializeDetail(row, await namesFor(getTenantId(req), [row])));
});

router.patch("/squad/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateSquadMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateSquadMemberBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const b = body.data;
  if (
    b.linkedPlayerId != null &&
    (b.linkedPlayerId <= 0 || b.linkedPlayerId >= FILL_IN_THRESHOLD)
  ) {
    res.status(400).json({ error: "linkedPlayerId must be a club player id (not a fill-in)" });
    return;
  }
  const tenantId = getTenantId(req);
  const scoped = and(
    eq(squadMembersTable.id, params.data.id),
    eq(squadMembersTable.tenantId, tenantId),
  );
  const [prev] = await db.select().from(squadMembersTable).where(scoped);
  if (!prev) {
    res.status(404).json({ error: "Squad member not found" });
    return;
  }
  // One club player, one squad member.
  if (b.linkedPlayerId != null && b.linkedPlayerId !== prev.linkedPlayerId) {
    const [other] = await db
      .select({ id: squadMembersTable.id })
      .from(squadMembersTable)
      .where(
        and(
          eq(squadMembersTable.tenantId, tenantId),
          eq(squadMembersTable.linkedPlayerId, b.linkedPlayerId),
          ne(squadMembersTable.id, prev.id),
        ),
      )
      .limit(1);
    if (other) {
      res.status(409).json({ error: "That player is already linked to another squad member" });
      return;
    }
  }

  const set: Partial<typeof squadMembersTable.$inferInsert> = { updatedAt: new Date() };
  if (b.active !== undefined) {
    set.active = b.active;
    set.activeSetByAdmin = true;
  }
  if (b.section !== undefined) set.section = b.section;
  if (b.gradeHint !== undefined) set.gradeHint = b.gradeHint?.trim() || null;
  if (b.linkedPlayerId !== undefined) set.linkedPlayerId = b.linkedPlayerId;
  if (b.contactChangeFlag !== undefined) set.contactChangeFlag = b.contactChangeFlag;
  for (const s of SLOTS) {
    const c = b[s.key];
    if (!c) continue;
    if (c.name !== undefined) set[s.name] = c.name?.trim() || null;
    if (c.email !== undefined) set[s.email] = normaliseEmail(c.email);
    if (c.mobile !== undefined) {
      const mobile = normaliseMobile(c.mobile);
      set[s.mobile] = mobile;
      // A new number hasn't replied STOP.
      if (mobile !== prev[s.mobile]) set[s.optOut] = false;
    }
  }

  const [row] = await db.update(squadMembersTable).set(set).where(scoped).returning();
  // Links already sent to a changed mobile or email stop working.
  const changedSlots = SLOTS.filter(
    (s) => row[s.mobile] !== prev[s.mobile] || row[s.email] !== prev[s.email],
  ).map((s) => s.key);
  if (changedSlots.length > 0) {
    const revoked = await revokeMemberTokens({ tenantId, memberId: row.id, slots: changedSlots });
    req.log?.info(
      { tenantId, memberId: row.id, slots: changedSlots, revoked },
      "squad contact edit",
    );
  }
  res.json(serializeDetail(row, await namesFor(tenantId, [row])));
});

// A player's or guardian's removal request: contacts and date of birth are
// hard-deleted, the row keeps only the name so past selections and logs still
// read correctly, its live availability links are revoked, and it is set inactive by the admin — so it is never asked
// again and later imports (which skip contacts for admin-held inactive members)
// don't restore the details. The row itself stays: it may be referenced by
// selections and requests, and keeping it is simpler than proving it isn't.
router.delete(
  "/squad/:id",
  requireAdmin,
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const params = RemoveSquadMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const [row] = await db
      .update(squadMembersTable)
      .set({
        active: false,
        activeSetByAdmin: true,
        dateOfBirth: null,
        accountHolderName: null,
        accountHolderMobile: null,
        accountHolderEmail: null,
        guardian1Name: null,
        guardian1Mobile: null,
        guardian1Email: null,
        guardian2Name: null,
        guardian2Mobile: null,
        guardian2Email: null,
        contactChangeFlag: false,
        contactChangedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(squadMembersTable.id, params.data.id), eq(squadMembersTable.tenantId, tenantId)),
      )
      .returning({ id: squadMembersTable.id });
    if (!row) {
      res.status(404).json({ error: "Squad member not found" });
      return;
    }
    // Every link already sent to them stops working.
    await revokeMemberTokens({ tenantId, memberId: row.id });
    res.status(204).end();
  },
);

export default router;
