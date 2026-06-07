import { eq } from "drizzle-orm";
import { db, clubsTable } from "@workspace/db";
import { HALLS_HEAD_BRAND, type HallsHeadBrand } from "@workspace/scorecard/brand";

/**
 * The clubs register id of the Halls Head record — the single source of truth
 * for the club's official logo and colours.
 */
const HALLS_HEAD_CLUB_ID = 2;

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { value: HallsHeadBrand; at: number } | null = null;

/**
 * Resolve Halls Head's official branding (logo + colours) from the clubs
 * register record (id 2). Falls back to the shared built-in brand if the record
 * is missing so callers always get the official values. Cached briefly to avoid
 * hitting the DB on every match/social request.
 */
export async function getHallsHeadBrand(): Promise<HallsHeadBrand> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const [row] = await db
    .select({
      name: clubsTable.name,
      shortName: clubsTable.shortName,
      logoUrl: clubsTable.logoUrl,
      logoUrl128: clubsTable.logoUrl128,
      primaryColour: clubsTable.primaryColour,
      secondaryColour: clubsTable.secondaryColour,
      tertiaryColour: clubsTable.tertiaryColour,
    })
    .from(clubsTable)
    .where(eq(clubsTable.id, HALLS_HEAD_CLUB_ID));

  const value: HallsHeadBrand = row
    ? {
        name: row.name,
        shortName: row.shortName,
        logoUrl: row.logoUrl,
        logoUrl128: row.logoUrl128,
        primaryColour: row.primaryColour,
        secondaryColour: row.secondaryColour,
        tertiaryColour: row.tertiaryColour,
      }
    : HALLS_HEAD_BRAND;

  cached = { value, at: Date.now() };
  return value;
}
