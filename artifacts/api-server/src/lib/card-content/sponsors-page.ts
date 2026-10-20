/**
 * What the Match Day sponsors page's optional blocks draw on (ADR-010 P6):
 * the club's chosen background photo, its next senior home game and its
 * social handles. Loaded for the Weekend Carousel's sources; the browser puts
 * them into the sponsors content (`matchDaySponsorsContent`) and the club's
 * toggles decide what shows.
 *
 * Every read is this tenant's own rows. Each block is best effort: a failed
 * read leaves it empty, and an empty block hides itself on the page.
 *
 * Juniors: the next home game is a senior fixture, so a junior-only set gets
 * none; junior-looking grades are never picked.
 */

import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { clubPhotosTable, db, fixturesTable, socialSettingsTable } from "@workspace/db";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import type { CardNames } from "@workspace/scorecard/card-names";
import type { MatchDayFixtureContent } from "@workspace/scorecard/card-content";
import { nonSeniorPlayerIds, presentPhotos } from "../club-photo-library";
import { loadConnection } from "../publishing/connections";
import { buildMatchDayContent } from "./match-day";

type PhotoDto = Awaited<ReturnType<typeof presentPhotos>>[number];

export interface SponsorsPageSources {
  backgroundPhoto: PhotoDto | null;
  nextHomeGame: MatchDayFixtureContent | null;
  socials: string[];
}

export interface SponsorsPageOptions {
  /** The set's first instant: the next home game is the first from here. */
  from: Date;
  /** A junior-only set: no senior fixture is read. */
  juniorOnly: boolean;
  names: CardNames;
  onError?: (block: string, err: unknown) => void;
}

/** "https://www.ourclub.com.au/" → "ourclub.com.au". */
export function displayUrl(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

const CANCELLED = /\b(cancelled|canceled|abandoned)\b/i;

async function backgroundPhoto(tenantId: number, photoId: number | null) {
  if (photoId == null) return null;
  const rows = await db
    .select()
    .from(clubPhotosTable)
    .where(
      and(
        eq(clubPhotosTable.id, photoId),
        eq(clubPhotosTable.tenantId, tenantId),
        isNull(clubPhotosTable.grade),
      ),
    );
  const [photo] = await presentPhotos(tenantId, rows);
  if (!photo) return null;
  // The same privacy rule as cover photos: no junior or fill-in player tagged.
  const unsafe = await nonSeniorPlayerIds(tenantId, photo.playerIds);
  return unsafe.length ? null : photo;
}

async function nextHomeGame(tenantId: number, from: Date, names: CardNames) {
  const rows = await db
    .select()
    .from(fixturesTable)
    .where(
      and(
        eq(fixturesTable.tenantId, tenantId),
        eq(fixturesTable.isHome, true),
        gte(fixturesTable.startAt, from),
      ),
    )
    .orderBy(asc(fixturesTable.startAt), asc(fixturesTable.id))
    .limit(20);
  const next = rows.find(
    (f) =>
      !isJuniorGradeLabel(f.grade) &&
      !/^bye$/i.test(f.opponentName.trim()) &&
      !CANCELLED.test(f.notes ?? ""),
  );
  if (!next) return null;
  return (await buildMatchDayContent(tenantId, [next], { names })).get(next.id) ?? null;
}

async function socials(tenantId: number, clubUrl: string): Promise<string[]> {
  const out: string[] = [];
  const connection = await loadConnection(tenantId);
  if (connection?.status === "connected") {
    if (connection.igUsername) out.push(`@${connection.igUsername.replace(/^@/, "")}`);
    if (connection.pageName) out.push(connection.pageName);
  }
  const site = displayUrl(clubUrl);
  if (site) out.push(site);
  return out;
}

async function settle<T>(
  block: string,
  fallback: T,
  load: () => Promise<T>,
  onError?: SponsorsPageOptions["onError"],
): Promise<T> {
  try {
    return await load();
  } catch (err) {
    onError?.(block, err);
    return fallback;
  }
}

export async function loadSponsorsPageSources(
  tenantId: number,
  opts: SponsorsPageOptions,
): Promise<SponsorsPageSources> {
  const [settings] = await db
    .select({
      backgroundPhotoId: socialSettingsTable.sponsorsBackgroundPhotoId,
      clubUrl: socialSettingsTable.clubUrl,
    })
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  const [photo, game, links] = await Promise.all([
    settle(
      "background",
      null,
      () => backgroundPhoto(tenantId, settings?.backgroundPhotoId ?? null),
      opts.onError,
    ),
    opts.juniorOnly
      ? Promise.resolve(null)
      : settle(
          "next home game",
          null,
          () => nextHomeGame(tenantId, opts.from, opts.names),
          opts.onError,
        ),
    settle(
      "socials",
      [] as string[],
      () => socials(tenantId, settings?.clubUrl ?? ""),
      opts.onError,
    ),
  ]);
  return { backgroundPhoto: photo, nextHomeGame: game, socials: links };
}
