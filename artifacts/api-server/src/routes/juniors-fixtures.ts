import { Router, type IRouter } from "express";
import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import {
  db,
  juniorFixturesTable,
  juniorParticipantsTable,
  juniorShirtNumbersTable,
  juniorTeamListsTable,
  type JuniorFixtureRow,
} from "@workspace/db";
import { getShirtNumberSettings } from "@workspace/db/shirt-numbers";
import {
  GetJuniorFixtureParams,
  GetJuniorFixtureTeamListParams,
  ListJuniorFixturesQueryParams,
  PutJuniorFixtureTeamListBody,
  PutJuniorFixtureTeamListParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { isJuniorSyncOn } from "../lib/junior-sync";
import { getJuniorNameStyle } from "../lib/junior-helpers";
import { makeJuniorNaming, type JuniorNameFacts } from "../lib/junior-names";
import { juniorCanonicalizer, loadJuniorIdentity } from "../lib/junior-shirt-numbers";
import {
  juniorFixtureListFrom,
  serializeJuniorFixture,
  shapeAdminJuniorTeamList,
  shapeJuniorTeamListCandidates,
  shapePublicJuniorTeamList,
  validateJuniorTeamList,
  type JuniorCandidateRow,
} from "../lib/junior-fixtures";

/**
 * Junior fixtures and team lists (junior PlayHQ sync plan U6; KTD9, KTD12, KTD15,
 * R8, R9, R15, R17, R23).
 *
 *  - GET /juniors/fixtures, GET /juniors/fixtures/:id — public. The club's upcoming
 *    junior games and a game's PUBLISHED team list, named through the club's junior
 *    naming style (withheld players as "Private Player"). Both read nothing while the
 *    club's junior sync is switched off: the list is empty and a fixture 404s (R23).
 *  - GET / PUT /juniors/fixtures/:id/team-list — admin. Full names, the junior
 *    shirt number for the fixture's season, and the club's juniors to pick from. A
 *    save is stored with source `admin`, which the PlayHQ sync never overwrites
 *    (KTD9), and may only name the club's own junior participants.
 *
 * Juniors isolation: only `junior_*` tables (and the shared shirt-number settings
 * switch) are read here; nothing senior, nothing central. Every query is scoped to
 * the request's tenant.
 */

const router: IRouter = Router();

const NOT_FOUND = "Junior fixture not found";

/** Whether the club's junior sync is on (the U1 three-part gate) — public reads need it. */
const juniorSyncOn = (tenantId: number): Promise<boolean> =>
  isJuniorSyncOn(tenantId, { requireActive: false });

/** The tenant's junior fixture with this id, or undefined (never another tenant's). */
async function findFixture(tenantId: number, id: number): Promise<JuniorFixtureRow | undefined> {
  const [row] = await db
    .select()
    .from(juniorFixturesTable)
    .where(and(eq(juniorFixturesTable.id, id), eq(juniorFixturesTable.tenantId, tenantId)))
    .limit(1);
  return row;
}

async function findTeamList(tenantId: number, fixtureId: number) {
  const [row] = await db
    .select()
    .from(juniorTeamListsTable)
    .where(
      and(
        eq(juniorTeamListsTable.tenantId, tenantId),
        eq(juniorTeamListsTable.juniorFixtureId, fixtureId),
      ),
    )
    .limit(1);
  return row;
}

/**
 * The season's junior shirt numbers by participant id, or null when the club has
 * shirt numbers switched off (local batch read of the juniors register).
 */
async function seasonShirtNumbers(
  tenantId: number,
  season: number,
): Promise<Map<string, string> | null> {
  const settings = await getShirtNumberSettings(db, tenantId);
  if (!settings.enabled) return null;
  const rows = await db
    .select({
      participantId: juniorShirtNumbersTable.participantId,
      number: juniorShirtNumbersTable.number,
    })
    .from(juniorShirtNumbersTable)
    .where(
      and(
        eq(juniorShirtNumbersTable.tenantId, tenantId),
        eq(juniorShirtNumbersTable.season, season),
        isNotNull(juniorShirtNumbersTable.number),
        // A held number (its player not here yet, or a name to check) is never shown.
        eq(juniorShirtNumbersTable.held, false),
      ),
    );
  return new Map(rows.map((r) => [r.participantId.toLowerCase(), r.number!]));
}

/** The club's junior participants (all of them, or just `ids`), keyed by lowercased id. */
async function loadParticipants(
  tenantId: number,
  ids?: readonly string[],
): Promise<Map<string, JuniorCandidateRow>> {
  if (ids !== undefined && ids.length === 0) return new Map();
  const rows = await db
    .select({
      participantId: juniorParticipantsTable.participantId,
      displayName: juniorParticipantsTable.displayName,
      isPrivate: juniorParticipantsTable.isPrivate,
      privacyOverride: juniorParticipantsTable.privacyOverride,
      teams: juniorParticipantsTable.teams,
      lastSeason: juniorParticipantsTable.lastSeason,
    })
    .from(juniorParticipantsTable)
    .where(
      and(
        eq(juniorParticipantsTable.tenantId, tenantId),
        // Ids compare lowercased: team lists and the register store them lowercased.
        ids === undefined
          ? undefined
          : inArray(sql`lower(${juniorParticipantsTable.participantId})`, [...ids]),
      ),
    );
  return new Map(rows.map((r) => [r.participantId.toLowerCase(), r]));
}

/** The admin editor's view of a fixture's team list. */
async function adminView(tenantId: number, fixture: JuniorFixtureRow) {
  const season = fixture.seasonStartYear;
  const [list, people, numbers] = await Promise.all([
    findTeamList(tenantId, fixture.id),
    loadParticipants(tenantId),
    seasonShirtNumbers(tenantId, season),
  ]);
  const facts = people as ReadonlyMap<string, JuniorNameFacts>;
  return {
    fixture: serializeJuniorFixture(fixture, !!list?.isPublished && list.players.length > 0),
    season,
    shirtNumbersEnabled: numbers !== null,
    teamList: list
      ? {
          players: shapeAdminJuniorTeamList(list.players, facts, numbers),
          isPublished: list.isPublished,
          source: list.source,
          updatedAt: list.updatedAt.toISOString(),
        }
      : null,
    candidates: shapeJuniorTeamListCandidates([...people.values()], numbers),
  };
}

router.get("/juniors/fixtures", async (req, res): Promise<void> => {
  const query = ListJuniorFixturesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  if (!(await juniorSyncOn(tenantId))) {
    res.json([]);
    return;
  }
  const conditions = [
    eq(juniorFixturesTable.tenantId, tenantId),
    gte(juniorFixturesTable.startAt, juniorFixtureListFrom(new Date())),
  ];
  if (query.data.ageGroup) conditions.push(eq(juniorFixturesTable.ageGroup, query.data.ageGroup));
  const rows = await db
    .select()
    .from(juniorFixturesTable)
    .where(and(...conditions))
    .orderBy(asc(juniorFixturesTable.startAt), asc(juniorFixturesTable.id));
  const lists =
    rows.length === 0
      ? []
      : await db
          .select({
            fixtureId: juniorTeamListsTable.juniorFixtureId,
            players: juniorTeamListsTable.players,
          })
          .from(juniorTeamListsTable)
          .where(
            and(
              eq(juniorTeamListsTable.tenantId, tenantId),
              eq(juniorTeamListsTable.isPublished, true),
              inArray(
                juniorTeamListsTable.juniorFixtureId,
                rows.map((r) => r.id),
              ),
            ),
          );
  const withList = new Set(lists.filter((l) => l.players.length > 0).map((l) => l.fixtureId));
  res.json(rows.map((r) => serializeJuniorFixture(r, withList.has(r.id))));
});

router.get("/juniors/fixtures/:id", async (req, res): Promise<void> => {
  const params = GetJuniorFixtureParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  // Read together; nothing is served unless the sync is on and the fixture is the tenant's.
  const [syncOn, found, list] = await Promise.all([
    juniorSyncOn(tenantId),
    findFixture(tenantId, params.data.id),
    findTeamList(tenantId, params.data.id),
  ]);
  const fixture = syncOn ? found : undefined;
  if (!fixture) {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }
  const published = list?.isPublished && list.players.length > 0 ? list : null;
  if (!published) {
    res.json({ fixture: serializeJuniorFixture(fixture, false), teamList: null });
    return;
  }
  const ids = published.players.map((p) => p.participantId.toLowerCase());
  const [style, people, numbers] = await Promise.all([
    getJuniorNameStyle(tenantId),
    loadParticipants(tenantId, ids),
    seasonShirtNumbers(tenantId, fixture.seasonStartYear),
  ]);
  const naming = makeJuniorNaming(style, people);
  const players = published.players.map((p) => ({
    ...p,
    participantId: p.participantId.toLowerCase(),
  }));
  res.json({
    fixture: serializeJuniorFixture(fixture, true),
    teamList: shapePublicJuniorTeamList(players, naming, new Set(people.keys()), numbers),
  });
});

router.get("/juniors/fixtures/:id/team-list", requireAdmin, async (req, res): Promise<void> => {
  const params = GetJuniorFixtureTeamListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const fixture = await findFixture(tenantId, params.data.id);
  if (!fixture) {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }
  res.json(await adminView(tenantId, fixture));
});

router.put(
  "/juniors/fixtures/:id/team-list",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const params = PutJuniorFixtureTeamListParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = PutJuniorFixtureTeamListBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const fixture = await findFixture(tenantId, params.data.id);
    if (!fixture) {
      res.status(404).json({ error: NOT_FOUND });
      return;
    }
    // Only this club's own junior participants (merged-away ids follow to the
    // keeper): an opposition child has no participant row of ours, and another
    // club's child is a different tenant's row.
    const { participants, merges } = await loadJuniorIdentity(db, tenantId);
    const checked = validateJuniorTeamList(
      body.data.players,
      juniorCanonicalizer(participants, merges),
    );
    if (!checked.ok) {
      res.status(400).json({ error: checked.error });
      return;
    }
    const players = checked.players;
    // One list per fixture: upsert on the (tenant, fixture) unique index. An admin's
    // save makes the list theirs, so the PlayHQ sync stops updating it (KTD9).
    await db
      .insert(juniorTeamListsTable)
      .values({
        tenantId,
        juniorFixtureId: fixture.id,
        players,
        isPublished: body.data.isPublished ?? false,
        source: "admin",
      })
      .onConflictDoUpdate({
        target: [juniorTeamListsTable.tenantId, juniorTeamListsTable.juniorFixtureId],
        set: {
          players,
          source: "admin",
          updatedAt: new Date(),
          ...(body.data.isPublished !== undefined ? { isPublished: body.data.isPublished } : {}),
        },
      });
    res.json(await adminView(tenantId, fixture));
  },
);

export default router;
