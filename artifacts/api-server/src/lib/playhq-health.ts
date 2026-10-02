import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  db,
  notificationsTable,
  playhqSyncIncidentsTable,
  socialSettingsTable,
  tenantsTable,
} from "@workspace/db";
import {
  assertIngestScope,
  assessHealth,
  duePlans,
  getPlayhqIngestPool,
  loadCadenceInputs,
  loadRunSummaries,
  type OrgHealth,
  type Queryable,
} from "@workspace/db/playhq-ingest";
import { sendEmail } from "./integrations/email";
import { env } from "../config";

/**
 * Scheduled PlayHQ sync health and its watchdog (docs/plans/2026-10-01-001-feat-playhq-
 * scheduled-sync-plan.md, U8/U9).
 *
 * Health is computed per PlayHQ organisation linked to an active, sync-enabled tenant (the
 * same set the runner plans for). The watchdog turns state CHANGES into alerts, recorded as
 * `playhq_sync_incidents` rows so each incident alerts exactly twice — once when it opens,
 * once when it resolves — however often the watchdog runs:
 *   - opens:    email the platform (PLATFORM_ALERT_EMAIL, else PLATFORM_ADMIN_EMAIL) and give
 *               every affected tenant one in-app notification (plus email when the club set a
 *               notification address);
 *   - resolves: email the platform "recovered" and mark those tenant notifications read.
 * Email is best-effort and never blocks the state change (see integrations/email.ts).
 */

type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

export const STALE_NOTIFICATION_KIND = "playhq_sync_stale";
const FIXTURES_LINK = "/admin/social/fixtures";

type LinkedTenant = { id: number; slug: string; name: string; orgId: string };

async function syncTenants(): Promise<LinkedTenant[]> {
  const rows = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      name: tenantsTable.name,
      orgId: tenantsTable.playhqOrgId,
    })
    .from(tenantsTable)
    .where(
      and(
        isNotNull(tenantsTable.playhqOrgId),
        isNull(tenantsTable.suspendedAt),
        eq(tenantsTable.playhqSyncEnabled, true),
      ),
    );
  return rows.map((r) => ({ ...r, orgId: r.orgId!.toLowerCase() }));
}

export interface HealthSnapshot {
  now: Date;
  tenants: LinkedTenant[];
  health: OrgHealth[];
}

/** Health of every synced organisation right now (reads `playhq.*` on the ingest role). */
export async function computeHealth(now: Date): Promise<HealthSnapshot> {
  const pool = getPlayhqIngestPool();
  await assertIngestScope(pool);
  const reader = pool as unknown as Queryable;
  const tenants = await syncTenants();
  const orgIds = [...new Set(tenants.map((t) => t.orgId))];
  const [{ matches, lastRuns }, runs] = await Promise.all([
    loadCadenceInputs(reader, orgIds),
    loadRunSummaries(reader, orgIds),
  ]);
  const due = duePlans(now, orgIds, matches, lastRuns);
  return { now, tenants, health: assessHealth(now, orgIds, due, runs) };
}

function platformAlertAddress(): string | undefined {
  return env.PLATFORM_ALERT_EMAIL() ?? env.PLATFORM_ADMIN_EMAIL();
}

async function emailPlatform(subject: string, text: string, log: Logger): Promise<void> {
  const to = platformAlertAddress();
  if (!to) return;
  const r = await sendEmail({ to, subject, text });
  if (!r.sent && r.reason === "failed")
    log.warn({ error: r.error }, "playhq sync alert email failed");
}

export interface WatchdogResult {
  checked: number;
  opened: { orgId: string; kind: string; tenants: number[] }[];
  resolved: { orgId: string; tenants: number[] }[];
  open: number;
}

export async function runWatchdog(now: Date, log: Logger): Promise<WatchdogResult> {
  const snap = await computeHealth(now);
  const open = await db
    .select()
    .from(playhqSyncIncidentsTable)
    .where(isNull(playhqSyncIncidentsTable.resolvedAt));
  const openByOrg = new Map(open.map((i) => [i.orgId, i]));
  const result: WatchdogResult = { checked: snap.health.length, opened: [], resolved: [], open: 0 };

  for (const h of snap.health) {
    const incident = openByOrg.get(h.orgId);
    const tenants = snap.tenants.filter((t) => t.orgId === h.orgId);
    const names = tenants.map((t) => t.name).join(", ");

    if (h.state !== "ok" && !incident) {
      // Opening is the one write that may race a concurrent watchdog: the partial unique
      // index lets only one open row per org exist, and the loser does nothing.
      const [row] = await db
        .insert(playhqSyncIncidentsTable)
        .values({ orgId: h.orgId, kind: h.state, detail: { reasons: h.reasons } })
        .onConflictDoNothing()
        .returning();
      if (!row) continue;
      await emailPlatform(
        `PlayHQ sync ${h.state}: ${names || h.orgId}`,
        [
          `PlayHQ scheduled sync is ${h.state} for ${names || "an organisation"} (org ${h.orgId}).`,
          "",
          ...h.reasons.map((r) => `- ${r}`),
          "",
          `Last successful load: ${h.lastSuccessAt?.toISOString() ?? "never"}.`,
          "Platform console → PlayHQ sync shows every organisation's state.",
        ].join("\n"),
        log,
      );
      for (const t of tenants) await notifyTenantStale(t, row.id, h, log);
      result.opened.push({ orgId: h.orgId, kind: h.state, tenants: tenants.map((t) => t.id) });
    } else if (h.state === "ok" && incident) {
      await db
        .update(playhqSyncIncidentsTable)
        .set({ resolvedAt: now })
        .where(eq(playhqSyncIncidentsTable.id, incident.id));
      await db
        .update(notificationsTable)
        .set({ readAt: now })
        .where(
          and(
            eq(notificationsTable.kind, STALE_NOTIFICATION_KIND),
            isNull(notificationsTable.readAt),
            sql`(${notificationsTable.payload} ->> 'incidentId')::int = ${incident.id}`,
          ),
        );
      await emailPlatform(
        `PlayHQ sync recovered: ${names || h.orgId}`,
        `PlayHQ scheduled sync is back to normal for ${names || "an organisation"} (org ${h.orgId}). ` +
          `The ${incident.kind} incident opened at ${incident.openedAt.toISOString()} is resolved.`,
        log,
      );
      result.resolved.push({ orgId: h.orgId, tenants: tenants.map((t) => t.id) });
    }
  }
  result.open = (
    await db
      .select({ id: playhqSyncIncidentsTable.id })
      .from(playhqSyncIncidentsTable)
      .where(isNull(playhqSyncIncidentsTable.resolvedAt))
  ).length;
  log.info(result, "playhq sync watchdog");
  return result;
}

async function notifyTenantStale(
  t: LinkedTenant,
  incidentId: number,
  h: OrgHealth,
  log: Logger,
): Promise<void> {
  const when = h.lastSuccessAt
    ? `Fixtures and results were last refreshed from PlayHQ at ${h.lastSuccessAt.toISOString()}.`
    : "Fixtures and results haven't been refreshed from PlayHQ yet.";
  const title = "PlayHQ fixtures aren't updating";
  const body = `${when} Ovation has been alerted and is looking into it; there's nothing you need to do.`;
  await db.insert(notificationsTable).values({
    tenantId: t.id,
    kind: STALE_NOTIFICATION_KIND,
    title,
    body,
    link: FIXTURES_LINK,
    payload: { incidentId, orgId: h.orgId, state: h.state },
  });
  const [settings] = await db
    .select({ email: socialSettingsTable.notificationEmail })
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, t.id));
  if (settings?.email) {
    const r = await sendEmail({ to: settings.email, subject: title, text: body });
    if (!r.sent && r.reason === "failed")
      log.warn({ tenantId: t.id, error: r.error }, "playhq stale notice email failed");
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The platform console's view: every synced organisation, its tenants, state and runs. */
export async function platformSyncOverview(now: Date) {
  const snap = await computeHealth(now);
  const open = await db
    .select()
    .from(playhqSyncIncidentsTable)
    .where(isNull(playhqSyncIncidentsTable.resolvedAt));
  const openByOrg = new Map(open.map((i) => [i.orgId, i]));
  return {
    now: now.toISOString(),
    orgs: snap.health.map((h) => {
      const inc = openByOrg.get(h.orgId);
      return {
        orgId: h.orgId,
        state: h.state,
        reasons: h.reasons,
        tenants: snap.tenants
          .filter((t) => t.orgId === h.orgId)
          .map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
        lastRunAt: iso(h.lastRunAt),
        lastRunStatus: h.lastRunStatus,
        lastRunPlan: h.lastRunPlan,
        lastRunCollector: h.lastRunCollector,
        lastSuccessAt: iso(h.lastSuccessAt),
        due: h.due,
        openIncident: inc ? { kind: inc.kind, openedAt: inc.openedAt.toISOString() } : null,
      };
    }),
  };
}

/**
 * A club admin's view of its own sync: linked? enabled? when did fixtures last refresh, and is
 * there an open incident? Cheap — no `playhq.*` read when the tenant isn't synced.
 */
export async function tenantSyncStatus(tenantId: number) {
  const [t] = await db
    .select({ orgId: tenantsTable.playhqOrgId, enabled: tenantsTable.playhqSyncEnabled })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  const linked = !!t?.orgId;
  const enabled = linked && !!t?.enabled;
  if (!linked || !enabled)
    return { linked, syncEnabled: enabled, lastRefreshedAt: null, stale: false, staleSince: null };
  const orgId = t!.orgId!.toLowerCase();
  const pool = getPlayhqIngestPool();
  await assertIngestScope(pool);
  const [summary] = await loadRunSummaries(pool as unknown as Queryable, [orgId]);
  const [incident] = await db
    .select({ openedAt: playhqSyncIncidentsTable.openedAt })
    .from(playhqSyncIncidentsTable)
    .where(
      and(
        inArray(playhqSyncIncidentsTable.orgId, [orgId]),
        isNull(playhqSyncIncidentsTable.resolvedAt),
      ),
    );
  return {
    linked,
    syncEnabled: enabled,
    lastRefreshedAt: iso(summary?.lastSuccessAt ?? null),
    stale: !!incident,
    staleSince: incident ? incident.openedAt.toISOString() : null,
  };
}
