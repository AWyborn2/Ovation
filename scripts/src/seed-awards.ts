/**
 * Seed the awards table with club award definitions (no winner data).
 *
 * Per the seeding memory, run this via the executeSql code_execution callback
 * rather than `pnpm --filter @workspace/scripts run seed-awards` (the scripts
 * package's drizzle-orm dependency is the only thing that lets this run
 * directly). This script is kept as the canonical, reproducible source.
 *
 * Idempotent: awards are upserted by their unique `key`. Winner data is loaded
 * separately (voting / points finalise, or the history loader), so this script
 * only seeds the definitions, their mechanism, and their points grade.
 */
import { db, awardsTable } from "@workspace/db";

type Mechanism = "voted" | "points" | "manual";

interface AwardSeed {
  key: string;
  title: string;
  description: string;
  displayOrder: number;
  mechanism: Mechanism;
  /** For points awards: the single grade whose match stats are tallied. */
  pointsGrade?: string;
}

const AWARDS: AwardSeed[] = [
  // ---- Voted (captain 3-2-1) ----
  {
    key: "peter-wyllie-medal",
    title: "Peter Wyllie Medal",
    description:
      "Halls Head Cricket Club's premier individual award, recognising the club's most outstanding player.",
    displayOrder: 0,
    mechanism: "voted",
  },
  {
    key: "female-player-of-the-year",
    title: "Female Player of the Year",
    description:
      "The club's leading female cricketer for the season, decided by captain 3-2-1 voting across Female A Grade.",
    displayOrder: 1,
    mechanism: "voted",
  },

  // ---- Points-from-stats ----
  {
    key: "burns-family-medal",
    title: "Burns Family Medal",
    description:
      "A Grade Player of the Year, awarded on a points-from-stats tally of the season's A Grade performances.",
    displayOrder: 2,
    mechanism: "points",
    pointsGrade: "A Grade",
  },
  {
    key: "grade-cricketer-b-grade",
    title: "B Grade Cricketer of the Year",
    description: "The leading B Grade cricketer on a points-from-stats tally for the season.",
    displayOrder: 3,
    mechanism: "points",
    pointsGrade: "B Grade",
  },
  {
    key: "grade-cricketer-c-grade",
    title: "C Grade Cricketer of the Year",
    description: "The leading C Grade cricketer on a points-from-stats tally for the season.",
    displayOrder: 4,
    mechanism: "points",
    pointsGrade: "C Grade",
  },
  {
    key: "grade-cricketer-d-grade",
    title: "D Grade Cricketer of the Year",
    description: "The leading D Grade cricketer on a points-from-stats tally for the season.",
    displayOrder: 5,
    mechanism: "points",
    pointsGrade: "D Grade",
  },
  {
    key: "grade-cricketer-e-grade",
    title: "E Grade Cricketer of the Year",
    description: "The leading E Grade cricketer on a points-from-stats tally for the season.",
    displayOrder: 6,
    mechanism: "points",
    pointsGrade: "E Grade",
  },
  {
    key: "grade-cricketer-f-grade",
    title: "F Grade Cricketer of the Year",
    description: "The leading F Grade cricketer on a points-from-stats tally for the season.",
    displayOrder: 7,
    mechanism: "points",
    pointsGrade: "F Grade",
  },
  {
    key: "grade-cricketer-ppl",
    title: "PPL Cricketer of the Year",
    description: "The leading PPL cricketer on a points-from-stats tally for the season.",
    displayOrder: 8,
    mechanism: "points",
    pointsGrade: "PPL",
  },
  {
    key: "grade-cricketer-female-b-grade",
    title: "Female B Grade Cricketer of the Year",
    description:
      "The leading Female B Grade cricketer on a points-from-stats tally for the season.",
    displayOrder: 9,
    mechanism: "points",
    pointsGrade: "Female B Grade",
  },
  {
    key: "grade-cricketer-colts",
    title: "Colts Cricketer of the Year",
    description: "The leading Colts cricketer on a points-from-stats tally for the season.",
    displayOrder: 10,
    mechanism: "points",
    pointsGrade: "Colts",
  },

  // ---- Manual ----
  {
    key: "clubperson-male",
    title: "Clubperson of the Year (Male)",
    description: "Recognising outstanding off-field contribution to the club by a male member.",
    displayOrder: 11,
    mechanism: "manual",
  },
  {
    key: "clubperson-female",
    title: "Clubperson of the Year (Female)",
    description: "Recognising outstanding off-field contribution to the club by a female member.",
    displayOrder: 12,
    mechanism: "manual",
  },
  {
    key: "presidents-award",
    title: "President's Award",
    description: "Awarded at the president's discretion for special service to the club.",
    displayOrder: 13,
    mechanism: "manual",
  },
  {
    key: "chapelhow-award",
    title: "Chapelhow Award",
    description: "A club service honour recognising dedication to Halls Head Cricket Club.",
    displayOrder: 14,
    mechanism: "manual",
  },
  {
    key: "coaches-award-male",
    title: "Coaches Award (Male)",
    description: "The coaches' selection recognising a standout male contributor for the season.",
    displayOrder: 15,
    mechanism: "manual",
  },
  {
    key: "coaches-award-female",
    title: "Coaches Award (Female)",
    description: "The coaches' selection recognising a standout female contributor for the season.",
    displayOrder: 16,
    mechanism: "manual",
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
        mechanism: a.mechanism,
        published: true,
        pointsGrade: a.pointsGrade ?? null,
      })
      .onConflictDoUpdate({
        target: awardsTable.key,
        set: {
          title: a.title,
          description: a.description,
          displayOrder: a.displayOrder,
          mechanism: a.mechanism,
          published: true,
          pointsGrade: a.pointsGrade ?? null,
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
