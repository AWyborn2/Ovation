import { Router, type IRouter, type Request } from "express";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, squadMembersTable, playerIdMapTable, type SquadMemberRow } from "@workspace/db";
import {
  GetSquadMemberParams,
  UpdateSquadMemberBody,
  UpdateSquadMemberParams,
  RemoveSquadMemberParams,
  SearchSquadPlayersQueryParams,
  CreateSquadMemberBody,
  ActivateSquadMemberParams,
} from "@workspace/api-zod";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { requireAdmin } from "../middlewares/require-admin";
import { requireAdminOrCaptain } from "../middlewares/require-admin-or-captain";
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
import { linkedPlayerNames, loadCentralPlayerGroups, searchClubPlayers } from "../lib/squad-link";
import { seedSquadFromSeason } from "../lib/squad-season-seed";

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

// Everyone who has played for the club this season and isn't in the register
// yet (lib/squad-season-seed). Works whether or not the automatic seed ran.
router.post(
  "/squad/seed-from-season",
  requireAdmin,
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const tenantId = getTenantId(req);
    const result = await seedSquadFromSeason(tenantId);
    req.log?.info({ tenantId, ...result }, "squad seeded from this season");
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
router.get("/squad/player-search", requireAdminOrCaptain, async (req, res): Promise<void> => {
  const query = SearchSquadPlayersQueryParams.safeParse(req.query);
  if (!query.success || query.data.q.trim().length < 2) {
    res.status(400).json({ error: "Type at least two letters to search" });
    return;
  }
  res.json(await searchClubPlayers(getTenantId(req), query.data.q.trim()));
});

router.get("/selection/roster", requireAdminOrCaptain, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const rows = await db
    .select()
    .from(squadMembersTable)
    .where(eq(squadMembersTable.tenantId, tenantId))
    .orderBy(asc(squadMembersTable.lastName), asc(squadMembersTable.firstName));
  res.json(rows.map((r) => serializeSummary(r, new Map())));
});

router.post(
  "/squad/:id/activate",
  requireAdminOrCaptain,
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const params = ActivateSquadMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid member id" });
      return;
    }
    const [row] = await db
      .update(squadMembersTable)
      .set({ active: true, activeSetByAdmin: true, updatedAt: new Date() })
      .where(
        and(
          eq(squadMembersTable.tenantId, getTenantId(req)),
          eq(squadMembersTable.id, params.data.id),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Squad member not found" });
      return;
    }
    res.json(serializeSummary(row, new Map()));
  },
);

router.post(
  "/squad",
  requireAdminOrCaptain,
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = CreateSquadMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid player details", issues: parsed.error.issues });
      return;
    }
    const b = parsed.data;
    const firstName = b.firstName.trim();
    const lastName = b.lastName.trim();
    if (!firstName || !lastName) {
      res.status(400).json({ error: "Enter a first name and surname" });
      return;
    }
    if (
      b.dateOfBirth &&
      (b.dateOfBirth > perthDate(new Date()) ||
        Number.isNaN(Date.parse(b.dateOfBirth)) ||
        new Date(b.dateOfBirth).toISOString().slice(0, 10) !== b.dateOfBirth)
    ) {
      res.status(400).json({ error: "Enter a valid date of birth, not in the future" });
      return;
    }
    const tenantId = getTenantId(req);
    let isPrivate = false;
    if (b.linkedPlayerId != null) {
      // Crosswalk ownership is authoritative; never trust an id supplied by the browser.
      const [owned] = await db
        .select()
        .from(playerIdMapTable)
        .where(
          and(
            eq(playerIdMapTable.tenantId, tenantId),
            eq(playerIdMapTable.playerId, b.linkedPlayerId),
          ),
        );
      const nativeName = owned
        ? null
        : (await linkedPlayerNames(tenantId, [b.linkedPlayerId])).get(b.linkedPlayerId);
      if (
        b.linkedPlayerId <= 0 ||
        b.linkedPlayerId >= FILL_IN_THRESHOLD ||
        (!owned && !nativeName)
      ) {
        res.status(400).json({ error: "Choose a player belonging to this club" });
        return;
      }
      const group = (await loadCentralPlayerGroups(tenantId)).find(
        (p) => p.playerId === b.linkedPlayerId,
      );
      isPrivate = group?.isPrivate ?? false;
    }
    const values: typeof squadMembersTable.$inferInsert = {
      tenantId,
      firstName,
      lastName,
      section: b.section,
      dateOfBirth: b.dateOfBirth ?? null,
      gradeHint: b.gradeHint?.trim() || null,
      linkedPlayerId: b.linkedPlayerId ?? null,
      active: true,
      activeSetByAdmin: true,
      isPrivate,
    };
    for (const s of SLOTS) {
      const c = b[s.key];
      if (!c) continue;
      values[s.name] = c.name?.trim() || null;
      values[s.mobile] = normaliseMobile(c.mobile);
      values[s.email] = normaliseEmail(c.email);
      if (c.mobile?.trim() && !/^\+?\d{8,15}$/.test(values[s.mobile] ?? "")) {
        res.status(400).json({ error: `Enter a valid mobile number for ${s.key}` });
        return;
      }
      if (c.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[s.email] ?? "")) {
        res.status(400).json({ error: `Enter a valid email address for ${s.key}` });
        return;
      }
    }
    const row = await db.transaction(async (tx) => {
      // Serialize manual additions/imports for this tenant to prevent double clicks
      // from creating duplicate identities without needing a new schema constraint.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(72401, ${tenantId})`);
      const existing = await tx
        .select()
        .from(squadMembersTable)
        .where(eq(squadMembersTable.tenantId, tenantId));
      const key = (first: string, last: string) =>
        `${first} ${last}`.toLowerCase().trim().replace(/\s+/g, " ");
      const linked =
        b.linkedPlayerId == null
          ? undefined
          : existing.find((r) => r.linkedPlayerId === b.linkedPlayerId);
      const sameName = existing.filter(
        (r) =>
          r.section === b.section &&
          (b.linkedPlayerId == null || r.linkedPlayerId == null) &&
          key(r.firstName, r.lastName) === key(firstName, lastName),
      );
      if (!linked && sameName.length > 1) return null;
      const prev = linked ?? sameName[0];
      if (prev) {
        // Reactivation must not overwrite saved contacts, privacy, names or section.
        const [updated] = await tx
          .update(squadMembersTable)
          .set({
            active: true,
            activeSetByAdmin: true,
            updatedAt: new Date(),
            ...(prev.linkedPlayerId === null && b.linkedPlayerId != null
              ? { linkedPlayerId: b.linkedPlayerId, isPrivate: prev.isPrivate || isPrivate }
              : {}),
          })
          .where(and(eq(squadMembersTable.id, prev.id), eq(squadMembersTable.tenantId, tenantId)))
          .returning();
        return updated;
      }
      const [created] = await tx.insert(squadMembersTable).values(values).returning();
      return created;
    });
    if (!row) {
      res.status(409).json({
        error: "Several roster members have this name. Choose the existing player to reactivate.",
      });
      return;
    }
    res.status(201).json(serializeSummary(row, new Map()));
  },
);

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
