/**
 * CI-ONLY fixture for the `central` schema.
 *
 * The real central PCA database is external, read-only and never written by
 * the app. CI has no access to it (and must not: plan.md §3.2), so the API
 * integration job gives its throwaway Postgres an empty `central` schema
 * (`pnpm --filter @workspace/db run push-central`) and then runs this script
 * to fill it with a small, deterministic dataset:
 *
 *   - four clubs: 1 Halls Head, 2 Mandurah, 3 Pinjarra (all active) and 4 a
 *     folded club whose lineage points at Mandurah (`active_to` set) — enough
 *     for the provisioning picker, the folded-club guard and the exclusions
 *     suites;
 *   - six players, one flagged private;
 *   - three A Grade matches across the 2024/25 season with batting, bowling
 *     and roster lines for both sides, so `centralClubParticipants` (the
 *     crosswalk mint) and the leaderboard/summary reads return rows.
 *
 * Writes go through the TENANT `db` handle (same local database in CI) with
 * raw SQL — `centralDb` is read-only by construction and must stay that way.
 * Refuses to run against anything but a local database. Idempotent: it
 * truncates and re-inserts the fixture tables each run.
 *
 * Run:  tsx src/maintenance/seed-ci-central-fixture.ts
 *       (with DATABASE_URL and CENTRAL_DATABASE_URL both set to the CI DB)
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

function assertLocal(name: string): void {
  const url = process.env[name];
  if (!url) throw new Error(`${name} must be set`);
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "postgres"].includes(host)) {
    throw new Error(`Refusing to seed a central fixture into non-local ${name} host "${host}"`);
  }
}

const CLUBS = [
  {
    id: 1,
    name: "Halls Head Cricket Club",
    short: "HHCC",
    colour: "#00305c",
    from: "1991/92",
    to: null,
    parent: null,
    role: null,
  },
  {
    id: 2,
    name: "Mandurah Cricket Club",
    short: "MCC",
    colour: "#1b5e20",
    from: "2002/03",
    to: null,
    parent: null,
    role: null,
  },
  {
    id: 3,
    name: "Pinjarra Cricket Club",
    short: "PCC",
    colour: "#b71c1c",
    from: "2002/03",
    to: null,
    parent: null,
    role: null,
  },
  {
    id: 4,
    name: "Peel Districts (folded)",
    short: "PDCC",
    colour: "#4a148c",
    from: "2002/03",
    to: "2010/11",
    parent: 2,
    role: "folded_into",
  },
];

const PLAYERS = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Alex Fixture", club: 1, priv: 0 },
  { id: "22222222-2222-4222-8222-222222222222", name: "Blake Fixture", club: 1, priv: 0 },
  { id: "33333333-3333-4333-8333-333333333333", name: "Casey Fixture", club: 2, priv: 0 },
  { id: "44444444-4444-4444-8444-444444444444", name: "Private Fixture", club: 2, priv: 1 },
  { id: "55555555-5555-4555-8555-555555555555", name: "Drew Fixture", club: 3, priv: 0 },
  { id: "66666666-6666-4666-8666-666666666666", name: "Eli Fixture", club: 3, priv: 0 },
];

const MATCHES = [
  {
    id: 1001,
    round: "1",
    home: 1,
    away: 2,
    homeScore: "8/180",
    awayScore: "10/150",
    winner: 1,
    date: "2024-10-12",
  },
  {
    id: 1002,
    round: "2",
    home: 2,
    away: 3,
    homeScore: "10/120",
    awayScore: "6/121",
    winner: 3,
    date: "2024-10-19",
  },
  {
    id: 1003,
    round: "3",
    home: 3,
    away: 1,
    homeScore: "9/200",
    awayScore: "10/190",
    winner: 3,
    date: "2024-10-26",
  },
];

async function main(): Promise<void> {
  assertLocal("DATABASE_URL");
  assertLocal("CENTRAL_DATABASE_URL");

  await db.execute(sql`
    truncate central.match_batting, central.match_bowling, central.match_rosters,
             central.matches, central.players, central.clubs
  `);

  for (const c of CLUBS) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${c.id}, ${c.name}, ${c.short}, ${c.colour}, ${c.parent}, ${c.role}, ${c.from}, ${c.to})
    `);
  }

  for (const p of PLAYERS) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${p.id}, ${p.name}, ${p.priv}, ${p.club}, '2024/25', '2024/25', 2)
    `);
  }

  let lineId = 1;
  for (const m of MATCHES) {
    const homeName = CLUBS.find((c) => c.id === m.home)!.name;
    const awayName = CLUBS.find((c) => c.id === m.away)!.name;
    await db.execute(sql`
      insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
        status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
      values (${m.id}, ${`playhq-${m.id}`}, '2024/25', 'A Grade', 'grade-a', 'Two Day', ${m.round}, ${m.date}, 'Fixture Oval',
        'Completed', ${m.home}, ${m.away}, ${homeName}, ${awayName}, ${m.homeScore}, ${m.awayScore}, ${m.home}, ${m.winner},
        ${`${CLUBS.find((c) => c.id === m.winner)!.name} won`})
    `);

    for (const [innings, clubId] of [
      [1, m.home],
      [2, m.away],
    ] as const) {
      const side = PLAYERS.filter((p) => p.club === clubId);
      const teamName = CLUBS.find((c) => c.id === clubId)!.name;
      for (const [i, p] of side.entries()) {
        const runs = 20 + i * 15 + (m.id % 7);
        await db.execute(sql`
          insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
            runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
          values (${lineId++}, ${m.id}, ${innings}, ${clubId}, ${teamName}, ${i + 1}, ${p.id}, ${p.name},
            ${runs}, ${runs * 2}, ${Math.floor(runs / 10)}, 0, 50, ${i === 0 ? "not out" : "b Someone"}, ${i === 0 ? "notout" : "bowled"}, null)
        `);
        await db.execute(sql`
          insert into central.match_bowling (id, match_id, innings, club_id, team_name, participant_id, player_name,
            overs, maidens, runs, wickets, economy, wides, no_balls)
          values (${lineId++}, ${m.id}, ${innings === 1 ? 2 : 1}, ${clubId}, ${teamName}, ${p.id}, ${p.name},
            8, 1, ${30 + i * 5}, ${i + 1}, 4.5, 1, 0)
        `);
        await db.execute(sql`
          insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
          values (${lineId++}, ${m.id}, ${clubId}, ${teamName}, ${p.id}, ${p.name})
        `);
      }
    }
  }

  console.log(
    `[seed-ci-central-fixture] seeded ${CLUBS.length} clubs, ${PLAYERS.length} players, ${MATCHES.length} matches.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
