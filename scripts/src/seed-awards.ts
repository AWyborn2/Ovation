/**
 * Seed the awards table with club award definitions (no winner data).
 *
 * Per the seeding memory, run this via the executeSql code_execution callback
 * rather than `pnpm --filter @workspace/scripts run seed-awards` (the scripts
 * package's drizzle-orm dependency is the only thing that lets this run
 * directly). This script is kept as the canonical, reproducible source.
 *
 * Idempotent: awards are upserted by their unique `key`. Winner data is managed
 * manually through the admin UI, so this script only seeds the definition.
 */
import { db, awardsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

interface AwardSeed {
  key: string;
  title: string;
  description: string;
  displayOrder: number;
}

const AWARDS: AwardSeed[] = [
  {
    key: "peter-wyllie-medal",
    title: "Peter Wyllie Medal",
    description:
      "Halls Head Cricket Club's premier individual award, recognising the club's most outstanding player.",
    displayOrder: 0,
  },
];

async function main() {
  for (const a of AWARDS) {
    await db
      .insert(awardsTable)
      .values({
        key: a.key,
        title: a.title,
        description: a.description,
        displayOrder: a.displayOrder,
      })
      .onConflictDoUpdate({
        target: awardsTable.key,
        set: {
          title: a.title,
          description: a.description,
          displayOrder: a.displayOrder,
        },
      });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${AWARDS.length} award definition(s).`);
}

main().then(
  () => process.exit(0),
  (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  },
);
