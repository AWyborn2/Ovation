/**
 * playhq-project-fixtures.ts — project each linked tenant's PlayHQ matches into
 * `public.fixtures` (source = "playhq") so Social Studio's fixture-driven cards
 * (Match Day, Team List, Countdown) and the admin fixtures page see the real
 * season schedule without anyone typing it in.
 *
 * Usage (DATABASE_URL = tenant DB, CENTRAL_DATABASE_URL = the Postgres holding playhq.*):
 *   pnpm --filter @workspace/scripts run playhq-project-fixtures -- --dry-run
 *   pnpm --filter @workspace/scripts run playhq-project-fixtures -- --yes
 *   pnpm --filter @workspace/scripts run playhq-project-fixtures -- --tenant=1 --yes
 *   # Link a tenant to its PlayHQ organisation first (GUID = last path segment of
 *   # the club's play.cricket.com.au URL), then project:
 *   pnpm --filter @workspace/scripts run playhq-project-fixtures -- --tenant=1 --set-org=<guid> --yes
 *   # `playhq-load --project` runs this after a load.
 *
 * What it writes: one `fixtures` row per senior PlayHQ match involving the
 * tenant's organisation with a known start time inside the window (default: from
 * 14 days ago onwards, so this week's results stay visible), keyed on
 * `(tenant_id, playhq_match_id)`. Re-runs refresh grade, round, opponent, venue,
 * start time and home/away; `notes` and the team list are the admin's and are
 * never touched. Rows are never deleted here — a fixture PlayHQ drops or
 * abandons stays until an admin removes it.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import pg from "pg";
import { confirmDatabaseTarget, isDryRun } from "./lib/cli";
import { confirmTarget, sslFor } from "./playhq-load";

// ---------------------------------------------------------------------------
// Pure mapping (unit-tested)
// ---------------------------------------------------------------------------

export interface PlayhqMatchLite {
  id: string;
  gradeName: string | null;
  roundName: string | null;
  startAt: Date;
  venueName: string | null;
  surfaceName: string | null;
  status: string | null;
  homeOrgId: string | null;
  awayOrgId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
}

export interface OrgLite {
  name: string | null;
  shortName: string | null;
  logoUrl: string | null;
}

export interface FixtureUpsert {
  tenantId: number;
  grade: string;
  roundLabel: string | null;
  opponentName: string;
  opponentClubId: number | null;
  opponentLogoUrl: string | null;
  venue: string | null;
  startAt: Date;
  isHome: boolean;
  source: "playhq";
  playhqMatchId: string;
}

/** Shape one PlayHQ match as the tenant's fixture row (the club's perspective). */
export function toFixtureRow(
  m: PlayhqMatchLite,
  orgId: string,
  tenantId: number,
  orgs: Map<string, OrgLite>,
  clubIdByOrg: Map<string, number>,
  gradeOf: (playhqGradeName: string | null) => string | null,
): FixtureUpsert {
  const isHome = m.homeOrgId === orgId || m.awayOrgId !== orgId;
  const oppOrgId = isHome ? m.awayOrgId : m.homeOrgId;
  const oppTeamName = isHome ? m.awayTeamName : m.homeTeamName;
  const org = oppOrgId ? orgs.get(oppOrgId) : undefined;
  return {
    tenantId,
    grade: gradeOf(m.gradeName) ?? m.gradeName ?? "Unknown",
    roundLabel: m.roundName,
    opponentName: org?.name ?? oppTeamName ?? "TBC",
    opponentClubId: (oppOrgId && clubIdByOrg.get(oppOrgId)) || null,
    opponentLogoUrl: org?.logoUrl ?? null,
    venue: m.venueName,
    startAt: m.startAt,
    isHome,
    source: "playhq",
    playhqMatchId: m.id,
  };
}

export const PLAYHQ_ORG_GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export interface ProjectionOpts {
  /** Restrict to one tenant; absent → every tenant with a `playhq_org_id`. */
  tenantId?: number;
  /** Include matches whose start is at least this many days in the past. */
  windowDays?: number;
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface ProjectionSummary {
  tenantId: number;
  slug: string;
  orgId: string;
  matches: number;
  inserted: number;
  updated: number;
}

export async function projectFixtures(opts: ProjectionOpts = {}): Promise<ProjectionSummary[]> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const windowDays = opts.windowDays ?? 14;
  const centralUrl = process.env.CENTRAL_DATABASE_URL;
  if (!centralUrl)
    throw new Error("CENTRAL_DATABASE_URL must be set (the Postgres that holds playhq.*).");

  // Both handles are opened lazily so importing this module never needs a DB.
  const { db, tenantsTable, fixturesTable, clubsTable } = await import("@workspace/db");
  const { appGradeFromCentral } = await import("@workspace/db/central-queries");

  const tenantConds = [isNotNull(tenantsTable.playhqOrgId)];
  if (opts.tenantId) tenantConds.push(eq(tenantsTable.id, opts.tenantId));
  const tenants = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug, orgId: tenantsTable.playhqOrgId })
    .from(tenantsTable)
    .where(and(...tenantConds));
  if (tenants.length === 0) {
    log(
      "No tenant has a playhq_org_id set — nothing to project (use --tenant=<id> --set-org=<guid>).",
    );
    return [];
  }

  const clubs = await db
    .select({ id: clubsTable.id, orgId: clubsTable.playhqOrgId })
    .from(clubsTable)
    .where(isNotNull(clubsTable.playhqOrgId));
  const clubIdByOrg = new Map<string, number>();
  for (const c of clubs) if (c.orgId) clubIdByOrg.set(c.orgId.toLowerCase(), c.id);

  const central = new pg.Client({ connectionString: centralUrl, ssl: sslFor(centralUrl) });
  await central.connect();
  const summaries: ProjectionSummary[] = [];
  try {
    for (const t of tenants) {
      const orgId = (t.orgId ?? "").toLowerCase();
      const res = await central.query<{
        id: string;
        grade_name: string | null;
        round_name: string | null;
        start_at: Date;
        venue_name: string | null;
        surface_name: string | null;
        status: string | null;
        home_org_id: string | null;
        away_org_id: string | null;
        home_team_name: string | null;
        away_team_name: string | null;
      }>(
        `select m.id, g.name as grade_name, m.round_name, m.start_at, m.venue_name, m.surface_name,
                m.status, m.home_org_id, m.away_org_id, m.home_team_name, m.away_team_name
           from playhq.matches m
           join playhq.grades g on g.id = m.grade_id
          where (m.home_org_id = $1 or m.away_org_id = $1)
            and g.is_junior = false
            and m.start_at is not null
            and m.start_at >= now() - ($2 || ' days')::interval
          order by m.start_at, m.id`,
        [orgId, String(windowDays)],
      );
      const matches: PlayhqMatchLite[] = res.rows.map((r) => ({
        id: r.id,
        gradeName: r.grade_name,
        roundName: r.round_name,
        startAt: r.start_at,
        venueName: r.venue_name,
        surfaceName: r.surface_name,
        status: r.status,
        homeOrgId: r.home_org_id,
        awayOrgId: r.away_org_id,
        homeTeamName: r.home_team_name,
        awayTeamName: r.away_team_name,
      }));

      const oppIds = [
        ...new Set(
          matches
            .map((m) => (m.homeOrgId === orgId ? m.awayOrgId : m.homeOrgId))
            .filter((id): id is string => !!id),
        ),
      ];
      const orgs = new Map<string, OrgLite>();
      if (oppIds.length) {
        const o = await central.query<{
          id: string;
          name: string | null;
          short_name: string | null;
          logo_url: string | null;
        }>(
          `select id, name, short_name, logo_url from playhq.organisations where id = any($1::uuid[])`,
          [oppIds],
        );
        for (const r of o.rows)
          orgs.set(r.id, { name: r.name, shortName: r.short_name, logoUrl: r.logo_url });
      }

      const rows = matches.map((m) =>
        toFixtureRow(m, orgId, t.id, orgs, clubIdByOrg, appGradeFromCentral),
      );
      const existing = new Set(
        (
          await db
            .select({ id: fixturesTable.playhqMatchId })
            .from(fixturesTable)
            .where(and(eq(fixturesTable.tenantId, t.id), isNotNull(fixturesTable.playhqMatchId)))
        ).map((r) => r.id),
      );
      const inserted = rows.filter((r) => !existing.has(r.playhqMatchId)).length;
      const summary: ProjectionSummary = {
        tenantId: t.id,
        slug: t.slug,
        orgId,
        matches: rows.length,
        inserted,
        updated: rows.length - inserted,
      };
      summaries.push(summary);
      log(
        `tenant ${t.id} (${t.slug}): ${rows.length} PlayHQ matches in window → ${inserted} new, ${rows.length - inserted} refreshed${opts.dryRun ? " [dry-run]" : ""}`,
      );
      if (opts.dryRun || rows.length === 0) continue;

      for (let i = 0; i < rows.length; i += 200) {
        await db
          .insert(fixturesTable)
          .values(rows.slice(i, i + 200))
          .onConflictDoUpdate({
            target: [fixturesTable.tenantId, fixturesTable.playhqMatchId],
            targetWhere: sql`"playhq_match_id" IS NOT NULL`,
            set: {
              grade: sql`excluded.grade`,
              roundLabel: sql`excluded.round_label`,
              opponentName: sql`excluded.opponent_name`,
              opponentClubId: sql`excluded.opponent_club_id`,
              opponentLogoUrl: sql`excluded.opponent_logo_url`,
              venue: sql`excluded.venue`,
              startAt: sql`excluded.start_at`,
              isHome: sql`excluded.is_home`,
              source: sql`excluded.source`,
            },
          });
      }
    }
  } finally {
    await central.end();
  }
  return summaries;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(flag: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && !process.argv[idx + 1]?.startsWith("--") ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const tenantRaw = argValue("--tenant");
  const tenantId = tenantRaw ? Number(tenantRaw) : undefined;
  if (tenantRaw && (!Number.isInteger(tenantId) || (tenantId ?? 0) <= 0))
    throw new Error("--tenant must be a positive integer");
  const setOrg = argValue("--set-org");
  const windowDays = Number(argValue("--window-days") ?? 14);
  const dryRun = isDryRun();

  confirmDatabaseTarget();
  const centralUrl = process.env.CENTRAL_DATABASE_URL;
  if (!centralUrl)
    throw new Error("CENTRAL_DATABASE_URL must be set (the Postgres that holds playhq.*).");
  confirmTarget(centralUrl);

  if (setOrg) {
    if (!tenantId) throw new Error("--set-org requires --tenant=<id>");
    if (!PLAYHQ_ORG_GUID_RE.test(setOrg))
      throw new Error("--set-org must be the PlayHQ organisation GUID (8-4-4-4-12 hex)");
    if (dryRun)
      console.log(`[dry-run] would set tenants.playhq_org_id = ${setOrg} for tenant ${tenantId}`);
    else {
      const { db, tenantsTable } = await import("@workspace/db");
      const updated = await db
        .update(tenantsTable)
        .set({ playhqOrgId: setOrg.toLowerCase() })
        .where(eq(tenantsTable.id, tenantId))
        .returning({ id: tenantsTable.id, slug: tenantsTable.slug });
      if (!updated.length) throw new Error(`tenant ${tenantId} not found`);
      console.log(
        `tenant ${tenantId} (${updated[0].slug}) linked to PlayHQ organisation ${setOrg}`,
      );
    }
  }

  await projectFixtures({ tenantId, windowDays, dryRun });
  const { closeDb } = await import("@workspace/db");
  await closeDb();
}

const invokedDirectly =
  process.argv[1] &&
  (await import("node:path")).resolve(process.argv[1]) ===
    (await import("node:url")).fileURLToPath(import.meta.url);
if (invokedDirectly)
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
