import { Router, type IRouter, type Request } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, squadMembersTable, type SquadMemberRow } from "@workspace/db";
import {
  GetSquadMemberParams,
  UpdateSquadMemberBody,
  UpdateSquadMemberParams,
  RemoveSquadMemberParams,
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

/**
 * The club's squad register for player availability (plan 2026-10-06-002 U3;
 * R1–R4, R6, R7). Admin only. Contact details are admin-only too: the list
 * reports which contacts exist, never their values (R6), and nothing here logs
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

/** Today's date in Perth, YYYY-MM-DD. */
function perthToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth" }).format(new Date());
}

/** Under 18 on Perth's today, from an ISO date of birth; null when unknown (R5). */
export function isUnder18(dateOfBirth: string | null, today = perthToday()): boolean | null {
  if (!dateOfBirth) return null;
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  const eighteenth = `${String(y + 18).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return today < eighteenth;
}

function serializeBase(r: SquadMemberRow) {
  return {
    id: r.id,
    playhqProfileId: r.playhqProfileId,
    firstName: r.firstName,
    lastName: r.lastName,
    preferredName: r.preferredName,
    section: r.section,
    active: r.active,
    activeSetByAdmin: r.activeSetByAdmin,
    under18: isUnder18(r.dateOfBirth),
    gradeHint: r.gradeHint,
    teamName: r.teamName,
    ageGroup: r.ageGroup,
    isPrivate: r.isPrivate,
    linkedPlayerId: r.linkedPlayerId,
    contactChangeFlag: r.contactChangeFlag,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** List shape: contact presence only, never values. */
function serializeSummary(r: SquadMemberRow) {
  const out: Record<string, unknown> = serializeBase(r);
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
function serializeDetail(r: SquadMemberRow) {
  const out: Record<string, unknown> = {
    ...serializeBase(r),
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
        skipped: result.skipped.length,
      },
      "squad import",
    );
    res.json(result);
  },
);

router.get("/squad", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(squadMembersTable)
    .where(eq(squadMembersTable.tenantId, getTenantId(req)))
    .orderBy(
      asc(squadMembersTable.lastName),
      asc(squadMembersTable.firstName),
      asc(squadMembersTable.id),
    );
  res.json(rows.map(serializeSummary));
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
  res.json(serializeDetail(row));
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
  res.json(serializeDetail(row));
});

// A player's or guardian's removal request: contacts and date of birth are
// hard-deleted, the row keeps only the name so past selections and logs still
// read correctly, and it is set inactive by the admin — so it is never asked
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
        and(
          eq(squadMembersTable.id, params.data.id),
          eq(squadMembersTable.tenantId, getTenantId(req)),
        ),
      )
      .returning({ id: squadMembersTable.id });
    if (!row) {
      res.status(404).json({ error: "Squad member not found" });
      return;
    }
    res.status(204).end();
  },
);

export default router;
