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
import { and, arrayOverlaps, desc, eq, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  clubPhotosTable,
  juniorPhotosTable,
  type KioskPhotoSlideshowJson,
  type KioskSlideshowFolderJson,
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

/** Photos in one library folder (the library's grade / type view). */
function folderFilter(f: KioskSlideshowFolderJson, t: PhotoColumns): SQL | undefined {
  const grade = f.grade === "club-wide" ? isNull(t.grade) : eq(t.grade, f.grade);
  const type =
    f.type == null
      ? undefined
      : f.type === "unsorted"
        ? sql`cardinality(${t.photoTypes}) = 0`
        : arrayOverlaps(t.photoTypes, [f.type]);
  return and(grade, type);
}

/**
 * The slideshow's source filter on either library's columns (null = no rows).
 * `ids` are the hand-picked ids in this library, for the "picked" source.
 */
function sourceFilter(
  s: KioskPhotoSlideshowJson,
  t: PhotoColumns & { id: typeof clubPhotosTable.id | typeof juniorPhotosTable.id },
  now: Date,
  ids: readonly number[],
): SQL | null | true {
  switch (s.source) {
    case "picked":
      return ids.length ? inArray(t.id, [...ids]) : null;
    case "folders": {
      const folders = (s.folders ?? []).map((f) => folderFilter(f, t)).filter(Boolean);
      return folders.length ? (or(...folders) ?? null) : null;
    }
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

type Candidate = SlideshowPhotoOut & { at: number; key: string };

/** The hand-picked ids in one library. */
function pickedIds(s: KioskPhotoSlideshowJson, library: "senior" | "junior"): number[] {
  return s.source === "picked"
    ? (s.picked ?? []).filter((p) => p.library === library).map((p) => p.id)
    : [];
}

async function seniorCandidates(
  tenantId: number,
  s: KioskPhotoSlideshowJson,
  now: Date,
): Promise<Candidate[]> {
  const filter = sourceFilter(s, clubPhotosTable, now, pickedIds(s, "senior"));
  if (filter === null) return [];
  const rows = await db
    .select({
      id: clubPhotosTable.id,
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
    key: `senior:${r.id}`,
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
  const filter = sourceFilter(s, juniorPhotosTable, now, pickedIds(s, "junior"));
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
      key: `junior:${r.id}`,
      url: juniorPhotoUrl(r.id),
      width: r.width ?? 0,
      height: r.height ?? 0,
      caption: s.captions ? slideshowCaption(r.grade, r.season) : null,
      at: new Date(r.at).getTime(),
    }));
}

/**
 * Each slideshow's photos, at most SLIDESHOW_PHOTO_CAP each: newest first, or
 * in the picked order for a manual order. A picked source reads each library
 * its picks name, whatever `library` says.
 */
export async function resolveSlideshows(
  tenantId: number,
  slideshows: readonly KioskPhotoSlideshowJson[],
  now: Date = new Date(),
): Promise<ResolvedSlideshowOut[]> {
  return Promise.all(
    slideshows.map(async (s) => {
      const picked = s.source === "picked";
      const [senior, junior] = await Promise.all([
        !picked && s.library === "junior" ? [] : seniorCandidates(tenantId, s, now),
        !picked && s.library === "senior" ? [] : juniorCandidates(tenantId, s, now),
      ]);
      const rank = new Map((s.picked ?? []).map((p, i) => [`${p.library}:${p.id}`, i]));
      const photos = [...senior, ...junior]
        .sort((a, b) =>
          picked && s.order === "manual"
            ? (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0)
            : b.at - a.at,
        )
        .slice(0, SLIDESHOW_PHOTO_CAP)
        .map(({ at: _at, key: _key, ...p }) => p);
      return { id: s.id, photos };
    }),
  );
}
