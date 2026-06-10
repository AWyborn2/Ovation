/**
 * Seed the curated background-music library for animated share-card video clips.
 *
 * The matching mp3 files are generated instrumental loops that live in object
 * storage under the PUBLIC search path (`/public-objects/card-audio/...`), served
 * by the API at `/api/storage/public-objects/...`. This script only inserts the
 * DB rows that point at those public objects.
 *
 * Idempotent / re-runnable: a row is only inserted when no row with the same url
 * already exists, so re-running never duplicates or clobbers admin uploads.
 *
 * Run with: pnpm --filter @workspace/scripts run seed-card-audio
 */
import { db, cardAudioTracksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type CuratedTrack = {
  name: string;
  url: string;
  durationMs: number;
  displayOrder: number;
};

const CURATED: CuratedTrack[] = [
  {
    name: "Sports Hype",
    url: "/public-objects/card-audio/music_sports_hype_loop.mp3",
    durationMs: 20062,
    displayOrder: 0,
  },
  {
    name: "Epic Triumph",
    url: "/public-objects/card-audio/music_epic_triumph_loop.mp3",
    durationMs: 20010,
    displayOrder: 1,
  },
  {
    name: "Chill Groove",
    url: "/public-objects/card-audio/music_chill_groove_loop.mp3",
    durationMs: 20010,
    displayOrder: 2,
  },
];

async function main() {
  let inserted = 0;
  for (const t of CURATED) {
    const existing = await db
      .select({ id: cardAudioTracksTable.id })
      .from(cardAudioTracksTable)
      .where(eq(cardAudioTracksTable.url, t.url))
      .limit(1);
    if (existing.length > 0) {
      console.log(`skip (exists): ${t.name}`);
      continue;
    }
    await db.insert(cardAudioTracksTable).values({
      name: t.name,
      url: t.url,
      durationMs: t.durationMs,
      isCurated: true,
      displayOrder: t.displayOrder,
    });
    inserted++;
    console.log(`seeded: ${t.name}`);
  }
  console.log(`Done. ${inserted} curated track(s) inserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
