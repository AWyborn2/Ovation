import type { Logger } from "pino";
import { and, asc, isNull, or, sql } from "drizzle-orm";
import { db, sponsorsTable } from "@workspace/db";
import { migrateSponsorLogos } from "./sponsor-logo-migration";

/**
 * Sponsors whose active window covers today, ordered by displayOrder. The
 * date-window rule treats a null bound as open-ended (no start / no end). Logos
 * are run through the lazy data-URL → object-storage migration on read. Shared
 * by the social-card bundle and the honour-board kiosk so both surface the same
 * "live" sponsor set. NOTE: card-kind filtering is a share-card concern and is
 * applied by the caller, never here.
 */
export async function loadActiveSponsors(log: Logger) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(sponsorsTable)
    .where(
      and(
        or(isNull(sponsorsTable.activeFrom), sql`${sponsorsTable.activeFrom} <= ${today}`),
        or(isNull(sponsorsTable.activeTo), sql`${sponsorsTable.activeTo} >= ${today}`),
      ),
    )
    .orderBy(asc(sponsorsTable.displayOrder), asc(sponsorsTable.id));
  return migrateSponsorLogos(rows, log);
}
