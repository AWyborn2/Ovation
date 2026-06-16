/**
 * seed-mandurah-tenant.ts — onboard Mandurah Cricket Club as pilot tenant #2
 * (Phase 1 concierge). Resolves the central PCA club row by name (id, name,
 * short name, primary colour) so you don't have to look the club id up, and
 * upserts a tenants row pointing at it.
 *
 *   pnpm --filter @workspace/scripts run seed-mandurah-tenant
 *   ... -- --club-id=N                                  # pin the central club id
 *   ... -- --name="South Mandurah Cricket Club" --slug=south-mandurah
 *
 * Requires DATABASE_URL (tenant) AND CENTRAL_DATABASE_URL (central). Idempotent
 * (upsert by slug). After running, set CENTRAL_READS=1 and hit a stats endpoint
 * with header `x-tenant-id: <printed id>` to see Mandurah's central data.
 */
import { eq, ilike } from "drizzle-orm";
import { db, tenantsTable, playerIdMapTable } from "@workspace/db";
import { centralDb, centralClubsTable } from "@workspace/db/central";
import { centralClubParticipants } from "@workspace/db/central-queries";

const arg = (n: string): string | undefined =>
  process.argv.slice(2).find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

// PlayHQ logos from attached_assets/PCA_PlayHQ_Logos_and_URLs_*.csv.
const KNOWN_LOGOS: Record<string, string> = {
  "Mandurah Cricket Club":
    "https://res.cloudinary.com/playhq/image/upload/v1/production/ca/84fe5d06-5eeb-4fe5-85d1-bf3fd59956aa/1689819925822/logo.png",
  "South Mandurah Cricket Club":
    "https://res.cloudinary.com/playhq/image/upload/v1/production/ca/b9d1dea7-ea47-4c49-b7a5-0e87141d9644/1687664961809/logo.jpg",
};

async function main(): Promise<void> {
  const name = arg("name") ?? "Mandurah Cricket Club";
  const slug = arg("slug") ?? "mandurah";
  const clubIdArg = arg("club-id");
  const logoUrl = arg("logo-url") ?? KNOWN_LOGOS[name] ?? null;

  // Resolve the central club row — by explicit id, else by exact name.
  const clubRows = clubIdArg
    ? await centralDb
        .select()
        .from(centralClubsTable)
        .where(eq(centralClubsTable.clubId, Number(clubIdArg)))
    : await centralDb
        .select()
        .from(centralClubsTable)
        .where(ilike(centralClubsTable.name, name));

  if (clubRows.length === 0) {
    console.error(
      `No central.clubs row matching "${clubIdArg ?? name}". Find the id with:\n` +
        `  SELECT club_id, name FROM central.clubs WHERE name ILIKE '%mandurah%';\n` +
        `then re-run with --club-id=N.`,
    );
    process.exit(1);
  }
  if (clubRows.length > 1) {
    console.error(
      `Multiple central.clubs match "${name}": ` +
        clubRows.map((c) => `${c.clubId}=${c.name}`).join(", ") +
        `. Re-run with --club-id=N.`,
    );
    process.exit(1);
  }
  const club = clubRows[0];

  const values = {
    slug,
    centralClubId: club.clubId,
    appClubId: null, // Mandurah has no app clubs-register row; brand from below.
    name: club.name ?? name,
    shortName: club.shortName ?? null,
    logoUrl,
    faviconUrl: null,
    // central.clubs carries only a primary colour; secondary/tertiary are left
    // null so the theme accent falls back to the default until Mandurah sets them.
    primaryColour: club.primaryColour ?? null,
    secondaryColour: null,
    tertiaryColour: null,
    customDomain: null,
    plan: "pilot",
  };

  const [row] = await db
    .insert(tenantsTable)
    .values(values)
    .onConflictDoUpdate({ target: tenantsTable.slug, set: values })
    .returning();

  console.log(
    `seed-mandurah-tenant: tenant #${row.id} slug=${row.slug} ` +
      `central_club_id=${row.centralClubId} — ${row.name}`,
  );

  // Mint the player identity crosswalk: one stable per-tenant int id per central
  // participant the club fielded, so central player reads can present int ids
  // against the existing /players/:id contract. Idempotent — only new GUIDs get
  // a fresh int; the per-tenant sequence continues from the current max.
  const participants = await centralClubParticipants(row.centralClubId);
  const existing = await db
    .select({
      participantId: playerIdMapTable.participantId,
      playerId: playerIdMapTable.playerId,
    })
    .from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, row.id));
  const mappedGuids = new Set(existing.map((e) => e.participantId));
  let nextId = existing.reduce((m, e) => Math.max(m, e.playerId), 0) + 1;
  const toInsert = participants
    .filter((p) => !mappedGuids.has(p.participantId))
    .map((p) => ({
      tenantId: row.id,
      participantId: p.participantId,
      playerId: nextId++,
    }));
  if (toInsert.length > 0) {
    await db.insert(playerIdMapTable).values(toInsert);
  }
  console.log(
    `player_id_map: minted ${toInsert.length} new mapping(s) ` +
      `(${participants.length} central participants total) for tenant #${row.id}.`,
  );
  console.log(
    `Validate: set CENTRAL_READS=1, then\n` +
      `  GET /api/grades/A%20Grade/leaderboard  with header  x-tenant-id: ${row.id}\n` +
      `should return Mandurah's players; the same request with x-tenant-id: 1 stays Halls Head.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
