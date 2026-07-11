#!/usr/bin/env node
/**
 * generate-central.mjs — build a deterministic stand-in for the central PCA DB
 * (Postgres schema `central`) so the Ovation app's central-read paths and the
 * 11-club tester panel can run without the real Supabase dataset.
 *
 * Emits SQL on stdout: DDL for the 10 central tables + INSERTs for a fully
 * internally-consistent mini-league:
 *   - 11 PCA clubs (Halls Head MUST be club_id 1 — the app hard-codes it)
 *   - 3 seasons ("Summer 2023/24".."2025/26") x 2 grades ("A Grade","B Grade")
 *   - full round-robin (11 rounds, 5 games + a bye) + Semi Finals + Grand Final
 *   - per-match: rosters (11/side), batting lines (with DNB/not-out/dismissals),
 *     bowling lines (bowler wickets == credited dismissals), fall of wickets
 *     (cumulative), fielding rows (catch/stumping/run out), scores where
 *     innings total == sum(batting runs) + extras, winner/result text derived
 *     from the scores; a sprinkle of Abandoned fixtures (rosters only).
 *   - ladder (latest season per grade), premiers (GF winners, all seasons),
 *     players register (GUID participant_id, a few is_private=1), name history.
 *
 * Deterministic PRNG (mulberry32) => rerunning yields byte-identical data, so
 * UI-vs-DB comparisons are stable across runs.
 */

const CLUBS = [
  // club_id 1 must be Halls Head (HALLS_HEAD_CENTRAL_CLUB_ID = 1 in the app)
  { id: 1, name: "Halls Head Cricket Club", short: "HHCC", colour: "#1a5632" },
  { id: 2, name: "Mandurah Cricket Club", short: "MCC", colour: "#0b3d91" },
  { id: 3, name: "White Knights Cricket Club", short: "WKCC", colour: "#4b4b4b" },
  { id: 4, name: "Shoalwater Bay Cricket Club", short: "SBCC", colour: "#00707e" },
  { id: 5, name: "Secret Harbour Cricket Club", short: "SHCC", colour: "#b33000" },
  { id: 6, name: "Waroona Cricket Club", short: "WCC", colour: "#5d3a9b" },
  { id: 7, name: "Pinjarra Cricket Club", short: "PCC", colour: "#8b0000" },
  { id: 8, name: "South Mandurah Cricket Club", short: "SMCC", colour: "#006400" },
  { id: 9, name: "Rockingham Hornets Cricket Club", short: "RHCC", colour: "#c8a200" },
  { id: 10, name: "Warnbro Swans Cricket Club", short: "WSCC", colour: "#122c6f" },
  { id: 11, name: "Singleton Irwinians Cricket Club", short: "SICC", colour: "#7a1f3d" },
];

const SEASONS = ["Summer 2023/24", "Summer 2024/25", "Summer 2025/26"];
const GRADES = ["A Grade", "B Grade"];
const VENUES = [
  "Halls Head Oval", "Rushton Park", "Baldivis Oval", "Lark Hill Sportsplex",
  "Waroona Recreation Ground", "Sir Ross McLarty Oval", "Secret Harbour Oval",
  "Warnbro Rec Centre", "Singleton Foreshore", "Anniversary Park",
];

const GIVEN = ["Jack","Liam","Noah","Oliver","Will","Tom","Charlie","Henry","Sam","Max",
  "Josh","Ben","Ethan","Lucas","Cooper","Riley","Lachlan","Hunter","Archie","Flynn",
  "Mitch","Jake","Ryan","Dylan","Kane","Brad","Scott","Dean","Troy","Matt"];
const SURNAMES = ["Smith","Jones","Williams","Brown","Wilson","Taylor","Johnson","White",
  "Martin","Anderson","Thompson","Nguyen","Walker","Harris","Lewis","Robinson","Clarke",
  "Young","Wright","King","Hill","Scott","Green","Baker","Adams","Nelson","Carter",
  "Mitchell","Turner","Parker","Collins","Edwards","Stewart","Morris","Murphy","Cook",
  "Rogers","Reed","Bailey","Bell","Cox","Ward","Gray","James","Watson","Brooks"];

// --- deterministic PRNG ------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260711);
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)); // inclusive
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// --- players -----------------------------------------------------------------
// 15 players per club per grade (30/club). GUIDs are deterministic.
const guid = (club, n) =>
  `${String(club).padStart(8, "0")}-2026-4000-8000-${String(n).padStart(12, "0")}`;

const players = []; // {pid, name, clubId, grade, isPrivate}
const squads = new Map(); // `${clubId}|${grade}` -> player[]
let pseq = 0;
for (const club of CLUBS) {
  for (const grade of GRADES) {
    const squad = [];
    for (let i = 0; i < 15; i++) {
      pseq += 1;
      const name = `${pick(GIVEN)} ${pick(SURNAMES)}`;
      const p = {
        pid: guid(club.id, pseq),
        name,
        clubId: club.id,
        grade,
        // a handful of private players to exercise the privacy path
        isPrivate: pseq % 97 === 0 ? 1 : 0,
      };
      players.push(p);
      squad.push(p);
    }
    squads.set(`${club.id}|${grade}`, squad);
  }
}

// --- fixtures ----------------------------------------------------------------
// circle method round robin for 11 teams (one bye per round)
function roundRobin(ids) {
  const teams = [...ids, null]; // null = bye
  const n = teams.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i], b = teams[n - 1 - i];
      if (a !== null && b !== null) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    teams.splice(1, 0, teams.pop());
  }
  return rounds;
}

// --- SQL emit helpers ----------------------------------------------------------
const out = [];
const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const emit = (s) => out.push(s);

emit(`-- Generated by generate-central.mjs (deterministic seed 20260711).
-- Stand-in for the central PCA database: schema \`central\`, 10 tables, mini-league
-- across 11 PCA clubs. DO NOT use in production — testing dataset only.
DROP SCHEMA IF EXISTS central CASCADE;
CREATE SCHEMA central;
CREATE TABLE central.clubs (
  club_id integer PRIMARY KEY, name text, short_name text, primary_colour text,
  parent_club_id integer, lineage_role text, active_from text, active_to text);
CREATE TABLE central.players (
  participant_id text PRIMARY KEY, display_name text, is_private integer,
  current_club_id integer, first_season text, last_season text, matches integer);
CREATE TABLE central.matches (
  match_id integer PRIMARY KEY, playhq_match_id text, season text, grade text,
  grade_id text, comp_type text, round text, match_date text, venue text,
  venue_oval text, status text, home_club_id integer, away_club_id integer,
  home_team text, away_team text, home_score text, away_score text,
  toss_winner_club_id integer, winner_club_id integer, result_text text);
CREATE TABLE central.match_batting (
  id integer PRIMARY KEY, match_id integer, innings integer, club_id integer,
  team_name text, bat_order integer, participant_id text, player_name text,
  runs integer, balls integer, fours integer, sixes integer,
  strike_rate double precision, dismissal text, dismissal_type text, fielder text);
CREATE TABLE central.match_bowling (
  id integer PRIMARY KEY, match_id integer, innings integer, club_id integer,
  team_name text, participant_id text, player_name text, overs double precision,
  maidens integer, runs integer, wickets integer, economy double precision,
  wides integer, no_balls integer);
CREATE TABLE central.match_rosters (
  id integer PRIMARY KEY, match_id integer, club_id integer, team_name text,
  participant_id text, player_name text);
CREATE TABLE central.fall_of_wickets (
  id integer PRIMARY KEY, match_id integer, innings integer, wicket integer,
  runs integer, participant_id text);
CREATE TABLE central.fielding (
  id integer PRIMARY KEY, match_id integer, club_id integer, participant_id text,
  player_name text, kind text);
CREATE TABLE central.ladder (
  id integer PRIMARY KEY, grade text, club_id integer, club text, played integer,
  won integer, lost integer, tied integer, no_result integer);
CREATE TABLE central.premiers (
  id integer PRIMARY KEY, season text, grade text, format text, club_id integer,
  club text, decider_round text, match_date text, opponent_club_id integer,
  opponent text, venue text, confidence text, note text, match_id integer);
CREATE TABLE central.club_name_history (
  id integer PRIMARY KEY, club_id integer, name text, season_from text,
  season_to text, status text, note text);
CREATE INDEX idx_central_matches_home_club ON central.matches (home_club_id);
CREATE INDEX idx_central_matches_away_club ON central.matches (away_club_id);
CREATE INDEX idx_central_match_batting_club_match ON central.match_batting (club_id, match_id);
CREATE INDEX idx_central_match_bowling_club_match ON central.match_bowling (club_id, match_id);
CREATE INDEX idx_central_match_rosters_club_match ON central.match_rosters (club_id, match_id);
CREATE INDEX idx_central_fielding_club_match ON central.fielding (club_id, match_id);
`);

// clubs + name history
for (const c of CLUBS) {
  emit(`INSERT INTO central.clubs VALUES (${c.id}, ${q(c.name)}, ${q(c.short)}, ${q(c.colour)}, NULL, NULL, ${q("2002/03")}, NULL);`);
  emit(`INSERT INTO central.club_name_history VALUES (${c.id}, ${c.id}, ${q(c.name)}, ${q("2002/03")}, NULL, ${q("current")}, NULL);`);
}

// --- match simulation ----------------------------------------------------------
let matchId = 0, batId = 0, bowlId = 0, rosterId = 0, fowId = 0, fieldId = 0,
    ladderId = 0, premId = 0;
const clubName = Object.fromEntries(CLUBS.map((c) => [c.id, c.name]));
// per-club-grade running tallies for the ladder (latest season only)
const ladder = new Map(); // `${grade}|${clubId}` -> {p,w,l,t,nr}
const playerMatchCount = new Map(); // pid -> n
const premiersRows = [];

/** Simulate one innings for `battingClub` against `bowlingClub`. */
function simInnings(m, innings, battingClubId, bowlingClubId, grade, batXI, bowlXI) {
  const teamName = clubName[battingClubId];
  const wickets = ri(4, 10);
  const batted = wickets === 10 ? 11 : Math.min(11, wickets + 2);
  const lines = [];
  let teamRuns = 0;

  // choose 4-6 bowlers from the fielding XI; run-outs aren't credited to bowlers
  const bowlerCount = ri(4, 6);
  const bowlers = bowlXI.slice(0, bowlerCount).map((p) => ({
    p, wickets: 0, runs: 0, overs: 0, maidens: 0, wides: 0, noBalls: 0,
  }));

  const keeper = bowlXI[10]; // last in XI acts as keeper for stumpings
  const fow = [];
  let cumulative = 0;

  for (let order = 1; order <= 11; order++) {
    const batter = batXI[order - 1];
    playerMatchCount.set(batter.pid, (playerMatchCount.get(batter.pid) ?? 0) + 0); // ensure key
    if (order > batted) {
      lines.push({ batter, order, runs: null, balls: null, fours: 0, sixes: 0,
        dismissal: "did not bat", type: "other", fielder: null });
      continue;
    }
    const isOut = order <= wickets;
    // top order scores more
    const cap = order <= 4 ? 90 : order <= 7 ? 55 : 28;
    const runs = Math.max(0, Math.floor(rnd() * rnd() * cap * 2));
    const balls = Math.max(1, Math.round(runs * (0.9 + rnd() * 1.2)) + ri(0, 8));
    const maxFours = Math.floor(runs / 4);
    const fours = ri(0, Math.min(maxFours, 10));
    const remaining = runs - fours * 4;
    const sixes = ri(0, Math.min(Math.floor(remaining / 6), 3));
    teamRuns += runs;

    let dismissal = "not out", type = "not out", fielder = null;
    if (isOut) {
      const kind = pick(["caught", "caught", "caught", "bowled", "bowled", "lbw", "runout", "stumped"]);
      const bowler = pick(bowlers);
      if (kind === "caught") {
        const catcher = pick(bowlXI);
        dismissal = `c ${catcher.name} b ${bowler.p.name}`;
        type = "Caught"; fielder = catcher.name; bowler.wickets += 1;
        fieldId += 1;
        emit(`INSERT INTO central.fielding VALUES (${fieldId}, ${m}, ${bowlingClubId}, ${q(catcher.pid)}, ${q(catcher.name)}, ${q("catch")});`);
      } else if (kind === "bowled") {
        dismissal = `b ${bowler.p.name}`; type = "Bowled"; bowler.wickets += 1;
      } else if (kind === "lbw") {
        dismissal = `lbw b ${bowler.p.name}`; type = "LBW"; bowler.wickets += 1;
      } else if (kind === "stumped") {
        dismissal = `st ${keeper.name} b ${bowler.p.name}`;
        type = "Stumped"; fielder = keeper.name; bowler.wickets += 1;
        fieldId += 1;
        emit(`INSERT INTO central.fielding VALUES (${fieldId}, ${m}, ${bowlingClubId}, ${q(keeper.pid)}, ${q(keeper.name)}, ${q("stumping")});`);
      } else {
        const thrower = pick(bowlXI);
        dismissal = `run out (${thrower.name})`; type = "Run Out"; fielder = thrower.name;
        fieldId += 1;
        emit(`INSERT INTO central.fielding VALUES (${fieldId}, ${m}, ${bowlingClubId}, ${q(thrower.pid)}, ${q(thrower.name)}, ${q("run out")});`);
      }
      cumulative += runs + ri(0, 12); // partner contribution before the wicket
      fow.push({ wicket: fow.length + 1, runs: cumulative, pid: batter.pid });
    }
    lines.push({ batter, order, runs, balls, fours, sixes, dismissal, type, fielder });
  }

  const extras = ri(4, 26);
  const total = teamRuns + extras;

  // batting rows
  for (const l of lines) {
    batId += 1;
    const sr = l.runs !== null && l.balls ? Math.round((l.runs / l.balls) * 10000) / 100 : null;
    emit(`INSERT INTO central.match_batting VALUES (${batId}, ${m}, ${innings}, ${battingClubId}, ${q(teamName)}, ${l.order}, ${q(l.batter.pid)}, ${q(l.batter.name)}, ${l.runs ?? "NULL"}, ${l.balls ?? "NULL"}, ${l.fours}, ${l.sixes}, ${sr ?? "NULL"}, ${q(l.dismissal)}, ${q(l.type)}, ${q(l.fielder)});`);
  }
  // FoW rows (cap cumulative at total for consistency)
  for (const f of fow) {
    fowId += 1;
    emit(`INSERT INTO central.fall_of_wickets VALUES (${fowId}, ${m}, ${innings}, ${f.wicket}, ${Math.min(f.runs, total)}, ${q(f.pid)});`);
  }
  // bowling rows — distribute conceded runs (total minus a few byes) over bowlers
  const creditedRuns = total - ri(0, Math.min(8, extras));
  let left = creditedRuns;
  bowlers.forEach((b, i) => {
    const share = i === bowlers.length - 1 ? left : Math.min(left, ri(10, Math.max(11, Math.floor(creditedRuns / bowlers.length) + 15)));
    b.runs = Math.max(0, share); left -= b.runs;
    b.overs = ri(4, 10);
    b.maidens = ri(0, 2);
    b.wides = ri(0, 5);
    b.noBalls = ri(0, 2);
    bowlId += 1;
    const econ = b.overs ? Math.round((b.runs / b.overs) * 100) / 100 : null;
    emit(`INSERT INTO central.match_bowling VALUES (${bowlId}, ${m}, ${innings}, ${bowlingClubId}, ${q(clubName[bowlingClubId])}, ${q(b.p.pid)}, ${q(b.p.name)}, ${b.overs}, ${b.maidens}, ${b.runs}, ${b.wickets}, ${econ ?? "NULL"}, ${b.wides}, ${b.noBalls});`);
  });

  return { total, wickets, scoreText: wickets === 10 ? String(total) : `${wickets}/${total}` };
}

function xiFor(clubId, grade, round) {
  const squad = squads.get(`${clubId}|${grade}`);
  // rotate the 15-man squad by round so careers differ
  const xi = [];
  for (let i = 0; i < 11; i++) xi.push(squad[(round + i) % 15]);
  return xi;
}

function playMatch(season, seasonIdx, grade, roundLabel, roundNo, homeId, awayId, abandoned) {
  matchId += 1;
  const m = matchId;
  const venue = VENUES[(m + seasonIdx) % VENUES.length];
  const day = String(1 + ((roundNo * 7 + seasonIdx) % 27)).padStart(2, "0");
  const month = roundNo <= 6 ? "11" : "02";
  const year = 2023 + seasonIdx + (month === "02" ? 1 : 0);
  const date = `${year}-${month}-${day}`;
  const homeXI = xiFor(homeId, grade, roundNo + seasonIdx);
  const awayXI = xiFor(awayId, grade, roundNo + 3 + seasonIdx);

  // rosters always (even abandoned: "Played (stats not recorded)" path)
  for (const [cid, xi] of [[homeId, homeXI], [awayId, awayXI]]) {
    for (const p of xi) {
      rosterId += 1;
      emit(`INSERT INTO central.match_rosters VALUES (${rosterId}, ${m}, ${cid}, ${q(clubName[cid])}, ${q(p.pid)}, ${q(p.name)});`);
      playerMatchCount.set(p.pid, (playerMatchCount.get(p.pid) ?? 0) + 1);
    }
  }

  if (abandoned) {
    emit(`INSERT INTO central.matches VALUES (${m}, ${q(`phq-${m}`)}, ${q(season)}, ${q(grade)}, ${q(`g-${grade[0]}${seasonIdx}`)}, ${q("One Day")}, ${q(roundLabel)}, ${q(date)}, ${q(venue)}, NULL, ${q("Abandoned")}, ${homeId}, ${awayId}, ${q(clubName[homeId])}, ${q(clubName[awayId])}, NULL, NULL, NULL, NULL, ${q("Match abandoned due to weather")});`);
    return { winner: null, m };
  }

  const tossWinner = rnd() < 0.5 ? homeId : awayId;
  const battingFirst = tossWinner;
  const battingSecond = battingFirst === homeId ? awayId : homeId;
  const i1 = simInnings(m, 1, battingFirst, battingSecond, grade,
    battingFirst === homeId ? homeXI : awayXI, battingFirst === homeId ? awayXI : homeXI);
  const i2 = simInnings(m, 2, battingSecond, battingFirst, grade,
    battingSecond === homeId ? homeXI : awayXI, battingSecond === homeId ? awayXI : homeXI);

  let winner = null, resultText;
  if (i1.total > i2.total) {
    winner = battingFirst;
    resultText = `${clubName[winner]} won by ${i1.total - i2.total} runs`;
  } else if (i2.total > i1.total) {
    winner = battingSecond;
    resultText = `${clubName[winner]} won by ${10 - i2.wickets} wickets`;
  } else {
    resultText = "Match tied";
  }
  const homeScore = homeId === battingFirst ? i1.scoreText : i2.scoreText;
  const awayScore = awayId === battingFirst ? i1.scoreText : i2.scoreText;
  emit(`INSERT INTO central.matches VALUES (${m}, ${q(`phq-${m}`)}, ${q(season)}, ${q(grade)}, ${q(`g-${grade[0]}${seasonIdx}`)}, ${q("One Day")}, ${q(roundLabel)}, ${q(date)}, ${q(venue)}, NULL, ${q("Completed")}, ${homeId}, ${awayId}, ${q(clubName[homeId])}, ${q(clubName[awayId])}, ${q(homeScore)}, ${q(awayScore)}, ${tossWinner}, ${winner ?? "NULL"}, ${q(resultText)});`);
  return { winner, m, date, venue, homeId, awayId };
}

for (let s = 0; s < SEASONS.length; s++) {
  const season = SEASONS[s];
  for (const grade of GRADES) {
    const wins = new Map(CLUBS.map((c) => [c.id, 0]));
    const tally = new Map(CLUBS.map((c) => [c.id, { p: 0, w: 0, l: 0, t: 0, nr: 0 }]));
    const rounds = roundRobin(CLUBS.map((c) => c.id));
    rounds.forEach((pairs, r) => {
      pairs.forEach(([home, away], gi) => {
        // ~4% of home-and-away fixtures abandoned
        const abandoned = rnd() < 0.04;
        const res = playMatch(season, s, grade, `Round ${r + 1}`, r + 1, home, away, abandoned);
        const th = tally.get(home), ta = tally.get(away);
        th.p += 1; ta.p += 1;
        if (abandoned) { th.nr += 1; ta.nr += 1; }
        else if (res.winner === home) { th.w += 1; ta.l += 1; wins.set(home, wins.get(home) + 1); }
        else if (res.winner === away) { ta.w += 1; th.l += 1; wins.set(away, wins.get(away) + 1); }
        else { th.t += 1; ta.t += 1; }
      });
    });
    // finals: top 4 by wins -> two semis -> grand final
    const top4 = [...wins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
    const sf1 = playMatch(season, s, grade, "Semi Final", 12, top4[0], top4[3], false);
    const sf2 = playMatch(season, s, grade, "Semi Final", 12, top4[1], top4[2], false);
    const gfHome = sf1.winner ?? top4[0];
    const gfAway = sf2.winner ?? top4[1];
    const gf = playMatch(season, s, grade, "Grand Final", 13, gfHome, gfAway, false);
    const champ = gf.winner ?? gfHome;
    const runnerUp = champ === gfHome ? gfAway : gfHome;
    premId += 1;
    premiersRows.push(`INSERT INTO central.premiers VALUES (${premId}, ${q(season)}, ${q(grade)}, ${q("One Day")}, ${champ}, ${q(clubName[champ])}, ${q("Grand Final")}, ${q(gf.date)}, ${runnerUp}, ${q(clubName[runnerUp])}, ${q(gf.venue)}, ${q("high")}, NULL, ${gf.m});`);
    // ladder snapshot = latest season only
    if (s === SEASONS.length - 1) {
      for (const c of CLUBS) {
        const t = tally.get(c.id);
        ladderId += 1;
        emit(`INSERT INTO central.ladder VALUES (${ladderId}, ${q(grade)}, ${c.id}, ${q(c.name)}, ${t.p}, ${t.w}, ${t.l}, ${t.t}, ${t.nr});`);
      }
    }
  }
}
premiersRows.forEach(emit);

// players register (after sim so match counts are real)
for (const p of players) {
  emit(`INSERT INTO central.players VALUES (${q(p.pid)}, ${q(p.name)}, ${p.isPrivate}, ${p.clubId}, ${q("2023/24")}, ${q("2025/26")}, ${playerMatchCount.get(p.pid) ?? 0});`);
}

emit("ANALYZE;");
process.stdout.write(out.join("\n") + "\n");
