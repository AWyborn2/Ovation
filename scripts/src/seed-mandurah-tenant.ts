/**
 * seed-mandurah-tenant.ts — onboard Mandurah Cricket Club as pilot tenant #2
 * (Phase 1 concierge). Thin CLI wrapper over the shared `provisionTenant` service
 * (`@workspace/db/provision`) — the SAME logic the self-serve signup API uses, so
 * the concierge and self-serve paths can never diverge.
 *
 *   pnpm --filter @workspace/scripts run seed-mandurah-tenant
 *   ... -- --club-id=N                                  # pin the central club id
 *   ... -- --name="South Mandurah Cricket Club" --slug=south-mandurah
 *
 * Requires DATABASE_URL (tenant) AND CENTRAL_DATABASE_URL (central). Idempotent
 * (upsert by slug). After running, set CENTRAL_READS=1 and hit a stats endpoint
 * with header `x-tenant-id: <printed id>` to see Mandurah's central data.
 */
import { provisionTenant, ProvisionError } from "@workspace/db/provision";

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

  try {
    const result = await provisionTenant({
      slug,
      centralClubId: clubIdArg ? Number(clubIdArg) : undefined,
      name,
      logoUrl: arg("logo-url") ?? KNOWN_LOGOS[name] ?? null,
      plan: "pilot",
      mode: "upsert",
    });
    const { tenant } = result;
    console.log(
      `seed-mandurah-tenant: tenant #${tenant.id} slug=${tenant.slug} ` +
        `central_club_id=${tenant.centralClubId} — ${tenant.name}`,
    );
    console.log(
      `player_id_map: minted ${result.mintedMappings} new mapping(s) ` +
        `(${result.totalParticipants} central participants total) for tenant #${tenant.id}.`,
    );
    console.log(
      `Validate: set CENTRAL_READS=1, then\n` +
        `  GET /api/grades/A%20Grade/leaderboard  with header  x-tenant-id: ${tenant.id}\n` +
        `should return Mandurah's players; the same request with x-tenant-id: 1 stays Halls Head.`,
    );
  } catch (e) {
    if (e instanceof ProvisionError && e.code === "club_not_found") {
      console.error(
        `${e.message}\nFind the id with:\n` +
          `  SELECT club_id, name FROM central.clubs WHERE name ILIKE '%mandurah%';\n` +
          `then re-run with --club-id=N.`,
      );
      process.exit(1);
    }
    throw e;
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
