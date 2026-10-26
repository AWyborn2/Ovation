/**
 * Photo slideshow resolution for the honours kiosk (kiosk redesign D1/D3,
 * .10x/decisions/architect/kiosk-photo-rotation.md section B).
 *
 * The server picks each slideshow's photos; the client never evaluates
 * filters. Everything is tenant-scoped. Junior photos only appear when they
 * pass the one consent rule (every tagged child may be shown, at least one
 * tag), and they are served through the gated junior photo route, which
 * re-checks consent on every request, so a withdrawal takes effect at the
 * next image load. Captions are grade and season only, never names.
 */
import { and, arrayOverlaps, desc, eq, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";
import {
  db,
  clubPhotosTable,
  juniorPhotosTable,
  type KioskPhotoSlideshowJson,
} from "@workspace/db";
import { objectUrl } from "../photo-store";
import { juniorPhotoUrl, loadJuniorPhotoConsent } from "../junior-photos";
import { seasonLabel } from "./premierships";

/** Most photos a slideshow carries to the TV (it shows `perPass` of them a pass). */
export const SLIDESHOW_PHOTO_CAP = 60;

export interface SlideshowPhotoOut {
  url: string;
  width: number;
  height: number;
  caption: string | null;
}

export interface ResolvedSlideshowOut {
  id: string;
  photos: SlideshowPhotoOut[];
}

/** The season under way (start year): a cricket season runs from July. */
export function currentSeasonStartYear(now: Date): number {
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/** "A Grade · 2024/25", or whichever half is known; null when neither is. */
export function slideshowCaption(grade: string | null, season: number | null): string | null {
  const parts = [grade?.trim() || null, season != null ? seasonLabel(season) : null].filter(
    (p): p is string => p !== null,
  );
  return parts.length ? parts.join(" · ") : null;
}

type PhotoColumns = {
  season: typeof clubPhotosTable.season | typeof juniorPhotosTable.season;
  grade: typeof clubPhotosTable.grade | typeof juniorPhotosTable.grade;
  photoTypes: typeof clubPhotosTable.photoTypes | typeof juniorPhotosTable.photoTypes;
  takenAt: typeof clubPhotosTable.takenAt | typeof juniorPhotosTable.takenAt;
  createdAt: typeof clubPhotosTable.createdAt | typeof juniorPhotosTable.createdAt;
};

/** The slideshow's source filter on either library's columns (null = no rows). */
function sourceFilter(s: KioskPhotoSlideshowJson, t: PhotoColumns, now: Date): SQL | null | true {
  switch (s.source) {
    case "recent": {
      const days = Math.min(365, Math.max(1, s.recentDays ?? 30));
      const since = new Date(now.getTime() - days * 86_400_000);
      return gte(sql`coalesce(${t.takenAt}, ${t.createdAt})`, since);
    }
    case "season":
      return eq(t.season, currentSeasonStartYear(now));
    case "types":
      return s.types?.length ? arrayOverlaps(t.photoTypes, s.types) : null;
    case "grades":
      return s.grades?.length ? inArray(t.grade, s.grades) : null;
    default:
      return true;
  }
}

type Candidate = SlideshowPhotoOut & { at: number };

async function seniorCandidates(
  tenantId: number,
  s: KioskPhotoSlideshowJson,
  now: Date,
): Promise<Candidate[]> {
  const filter = sourceFilter(s, clubPhotosTable, now);
  if (filter === null) return [];
  const rows = await db
    .select({
      objectPath: clubPhotosTable.objectPath,
      width: clubPhotosTable.width,
      height: clubPhotosTable.height,
      grade: clubPhotosTable.grade,
      season: clubPhotosTable.season,
      at: sql<Date>`coalesce(${clubPhotosTable.takenAt}, ${clubPhotosTable.createdAt})`,
    })
    .from(clubPhotosTable)
    .where(
      and(
        eq(clubPhotosTable.tenantId, tenantId),
        // Junior stock artwork is for junior cards, not the clubroom slideshow.
        eq(clubPhotosTable.juniorStock, false),
        // Background-removed cut-outs are card material, not photographs.
        isNull(clubPhotosTable.sourcePhotoId),
        filter === true ? undefined : filter,
      ),
    )
    .orderBy(desc(sql`coalesce(${clubPhotosTable.takenAt}, ${clubPhotosTable.createdAt})`))
    .limit(SLIDESHOW_PHOTO_CAP);
  return rows.map((r) => ({
    url: objectUrl(r.objectPath),
    width: r.width,
    height: r.height,
    caption: s.captions ? slideshowCaption(r.grade, r.season) : null,
    at: new Date(r.at).getTime(),
  }));
}

async function juniorCandidates(
  tenantId: number,
  s: KioskPhotoSlideshowJson,
  now: Date,
): Promise<Candidate[]> {
  const filter = sourceFilter(s, juniorPhotosTable, now);
  if (filter === null) return [];
  // Read more than the cap: some may fail the consent rule.
  const rows = await db
    .select({
      id: juniorPhotosTable.id,
      width: juniorPhotosTable.width,
      height: juniorPhotosTable.height,
      grade: juniorPhotosTable.grade,
      season: juniorPhotosTable.season,
      at: sql<Date>`coalesce(${juniorPhotosTable.takenAt}, ${juniorPhotosTable.createdAt})`,
    })
    .from(juniorPhotosTable)
    .where(and(eq(juniorPhotosTable.tenantId, tenantId), filter === true ? undefined : filter))
    .orderBy(desc(sql`coalesce(${juniorPhotosTable.takenAt}, ${juniorPhotosTable.createdAt})`))
    .limit(SLIDESHOW_PHOTO_CAP * 3);
  const allowed = await loadJuniorPhotoConsent(
    tenantId,
    rows.map((r) => r.id),
  );
  return rows
    .filter((r) => allowed.get(r.id) === true)
    .slice(0, SLIDESHOW_PHOTO_CAP)
    .map((r) => ({
      url: juniorPhotoUrl(r.id),
      width: r.width ?? 0,
      height: r.height ?? 0,
      caption: s.captions ? slideshowCaption(r.grade, r.season) : null,
      at: new Date(r.at).getTime(),
    }));
}

/** Each slideshow's photos, newest first, at most SLIDESHOW_PHOTO_CAP each. */
export async function resolveSlideshows(
  tenantId: number,
  slideshows: readonly KioskPhotoSlideshowJson[],
  now: Date = new Date(),
): Promise<ResolvedSlideshowOut[]> {
  return Promise.all(
    slideshows.map(async (s) => {
      const [senior, junior] = await Promise.all([
        s.library === "junior" ? [] : seniorCandidates(tenantId, s, now),
        s.library === "senior" ? [] : juniorCandidates(tenantId, s, now),
      ]);
      const photos = [...senior, ...junior]
        .sort((a, b) => b.at - a.at)
        .slice(0, SLIDESHOW_PHOTO_CAP)
        .map(({ at: _at, ...p }) => p);
      return { id: s.id, photos };
    }),
  );
}
