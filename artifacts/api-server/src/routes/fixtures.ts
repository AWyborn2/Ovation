import { Router, type IRouter } from "express";
import { and, asc, eq, gte } from "drizzle-orm";
import { db, fixturesTable, teamListsTable, type TeamListPlayer } from "@workspace/db";
import {
  ListFixturesQueryParams,
  CreateFixtureBody,
  UpdateFixtureParams,
  UpdateFixtureBody,
  DeleteFixtureParams,
  GetFixtureTeamListParams,
  PutFixtureTeamListParams,
  PutFixtureTeamListBody,
  type TeamListPlayer as ApiTeamListPlayer,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";

const router: IRouter = Router();

// Fill-ins (playerId >= 90000) are excluded from every stats derivation and
// must never appear on a published team list either.
const FILL_IN_FLOOR = 90000;

/** The tenant's fixture with this id, or undefined (never another tenant's). */
async function findFixture(tenantId: number, id: number) {
  const [row] = await db
    .select()
    .from(fixturesTable)
    .where(and(eq(fixturesTable.id, id), eq(fixturesTable.tenantId, tenantId)));
  return row;
}

router.get("/fixtures", async (req, res): Promise<void> => {
  const query = ListFixturesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const conditions = [eq(fixturesTable.tenantId, getTenantId(req))];
  if (query.data.grade) conditions.push(eq(fixturesTable.grade, query.data.grade));
  if (query.data.upcomingOnly) conditions.push(gte(fixturesTable.startAt, new Date()));
  const rows = await db
    .select()
    .from(fixturesTable)
    .where(and(...conditions))
    .orderBy(asc(fixturesTable.startAt), asc(fixturesTable.id));
  res.json(rows);
});

router.post("/fixtures", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const parsed = CreateFixtureBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(fixturesTable)
    .values({
      tenantId: getTenantId(req),
      grade: parsed.data.grade,
      roundLabel: parsed.data.roundLabel ?? null,
      opponentName: parsed.data.opponentName,
      opponentClubId: parsed.data.opponentClubId ?? null,
      opponentLogoUrl: parsed.data.opponentLogoUrl ?? null,
      venue: parsed.data.venue ?? null,
      startAt: parsed.data.startAt,
      isHome: parsed.data.isHome ?? true,
      notes: parsed.data.notes ?? null,
      // `source` stays the schema default "manual" — the admin API never
      // writes "playhq"; that value is reserved for the follow-up ingest.
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/fixtures/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = UpdateFixtureParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateFixtureBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  if (Object.keys(body.data).length === 0) {
    const existing = await findFixture(tenantId, params.data.id);
    if (!existing) {
      res.status(404).json({ error: "Fixture not found" });
      return;
    }
    res.json(existing);
    return;
  }
  const [row] = await db
    .update(fixturesTable)
    .set(body.data)
    .where(and(eq(fixturesTable.id, params.data.id), eq(fixturesTable.tenantId, tenantId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Fixture not found" });
    return;
  }
  res.json(row);
});

router.delete("/fixtures/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = DeleteFixtureParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // The team list cascades via the fixture FK.
  const deleted = await db
    .delete(fixturesTable)
    .where(and(eq(fixturesTable.id, params.data.id), eq(fixturesTable.tenantId, getTenantId(req))))
    .returning({ id: fixturesTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "Fixture not found" });
    return;
  }
  res.status(204).end();
});

router.get("/fixtures/:id/team-list", async (req, res): Promise<void> => {
  const params = GetFixtureTeamListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const fixture = await findFixture(tenantId, params.data.id);
  if (!fixture) {
    res.status(404).json({ error: "Fixture not found" });
    return;
  }
  const [row] = await db
    .select()
    .from(teamListsTable)
    .where(and(eq(teamListsTable.fixtureId, fixture.id), eq(teamListsTable.tenantId, tenantId)));
  res.json(row ?? null);
});

router.put("/fixtures/:id/team-list", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = PutFixtureTeamListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = PutFixtureTeamListBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const fillIns = body.data.players.filter(
    (p: ApiTeamListPlayer) => p.playerId != null && p.playerId >= FILL_IN_FLOOR,
  );
  if (fillIns.length > 0) {
    res.status(400).json({
      error: `Fill-in player ids (>= ${FILL_IN_FLOOR}) cannot appear on a team list`,
    });
    return;
  }
  const tenantId = getTenantId(req);
  const fixture = await findFixture(tenantId, params.data.id);
  if (!fixture) {
    res.status(404).json({ error: "Fixture not found" });
    return;
  }
  // Store entries exactly as submitted (order preserved); drop null playerIds
  // so free-typed names serialise without a playerId key.
  const players: TeamListPlayer[] = body.data.players.map((p: ApiTeamListPlayer) => ({
    order: p.order,
    ...(p.playerId != null ? { playerId: p.playerId } : {}),
    displayName: p.displayName,
    ...(p.role != null ? { role: p.role } : {}),
  }));
  // One XI per fixture: upsert on the (tenantId, fixtureId) unique index.
  const [row] = await db
    .insert(teamListsTable)
    .values({
      tenantId,
      fixtureId: fixture.id,
      players,
      isPublished: body.data.isPublished ?? false,
    })
    .onConflictDoUpdate({
      target: [teamListsTable.tenantId, teamListsTable.fixtureId],
      set: {
        players,
        ...(body.data.isPublished !== undefined ? { isPublished: body.data.isPublished } : {}),
      },
    })
    .returning();
  res.json(row);
});

export default router;
