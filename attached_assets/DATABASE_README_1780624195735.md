# Halls Head Cricket Club — SQL Database

`halls_head_cricket.db` is a self-contained **SQLite** database built from the master workbook
(`HallsHead_Historical_Database_latest_honours and awards.xlsx`). It is a single file with no
server or setup required — open it from any language or tool and start querying.

## Why SQLite
- One portable file you can bundle directly inside an app (mobile or web), or load read-only.
- Supported everywhere: Python (`sqlite3`, built in), Node (`better-sqlite3`), Swift/Kotlin,
  PHP, .NET, plus GUI tools like DB Browser for SQLite.
- If you later go multi-user with live editing, the same schema imports straight into
  Postgres/Supabase or MySQL — the table design is standard SQL.

## Tables
| Table | What it holds |
|---|---|
| `players` | Player register: surname, given, full_name, grades played, total games |
| `career_stats` | One row per player **per grade**: games, runs, ave, HS, 50s, 100s, wkts, bowl ave, best, 5w, catches, etc. |
| `centuries` | Every recorded century (grade, batsman, score, season) |
| `five_wicket_hauls` | Every 5-wicket haul (grade, bowler, figures, season) |
| `partnership_records` | Highest partnership per wicket per grade |
| `partnerships_50plus` | All recorded 50+ partnerships |
| `premierships` | One row per premiership won (**54 total**): season, grade, parent_grade, competition, venue, match_date, result, MOTM, captain, plus `match_id`/`playhq_match_id`/`hh_team_id` linking to the Grand Final (2013/14+ only; blank pre-2013/14) |
| `premiership_players` | Winning XI for each premiership: `premiership_id`, `player_id`, name, batting order, `is_captain`, `is_motm` |
| `honour_board` | Office bearers + season honours, long form: (season, role, person) |
| `awards` | Club awards, long form: (season, award, recipient) |
| `grade_honours` | Grade captains & cricketers of the year: (season, role, grade, person) |
| `life_members` | Life members and induction season |
| `team_of_decade` | Team of the Decade XIs by grade |
| `club_records` | On-field playing records (highest score, best bowling, etc.) |
| `honour_board_records` | Administrative records (most seasons as President, etc.) |
| `season_aggregate_winners` | Per grade/season winners: Most Runs, Batting Average, Most Wickets, Bowling Average (with parsed `player`, `player_id`, `figure`, `average`, plus original `raw` text) |
| `matches` | One row per match (**2013/14–2025/26**): season, short `grade` code (A, B, … for grouping), `competition` (full grade descriptor e.g. "A Grade: Wyllie Cup"), round, date, venue, both teams + scores, plus `playhq_match_id` (stable PlayHQ match GUID) and `hh_team_id` (PlayHQ season team GUID). The Halls Head side is labelled **HHCC** in `hh_team`/`team1`/`team2` (and in `batting_team`/`bowling_team`); opponents keep their real name where available |
| `match_batting` | Per-innings batting cards: `match_id`, batting order, `player_id`, name, runs/balls/4s/6s/SR, dismissal, `is_halls_head`, `is_fill_in` |
| `match_bowling` | Per-innings bowling cards: `match_id`, `player_id`, name, overs/maidens/runs/wickets/econ/wd/nb, `is_halls_head`, `is_fill_in` |
| (matches) `hh_result` / `winner` | Every match also carries Halls Head's result (Won/Lost/Tied/No Result) and the winning team — derived from the scores |
| `caps` | A Grade cap register (264 caps, debut order, separate `cap_number` per `category` male/female): name, `player_id`, deceased, `games_a_grade`, `a_grade_stats_tracked`, `stats_note` |
| `clubs` | PlayHQ club/association reference (17): name, `playhq_org_id`, slug, PlayHQ page URL, `logo_url` + `logo_url_128`, and brand colours (`primary_colour`/`secondary_colour`/`tertiary_colour`/`quaternary_colour`) for rendering scorecards & match summaries |
| `seasons` | Reference list of all seasons |

### Club logos & colours
- `clubs` holds Halls Head, the Peel Cricket Association, and every opposition club, each with PlayHQ logo URLs (full + 128px), brand colours, and a `short_name` (e.g. Halls Head = `HHCC`).
- `matches.opponent_club_id` links a match to the opposition club so the app can render the right logo/colours. **528 matches resolved** (all 2023/24+ and any legacy match whose opponent was named); the rest are pre-2023/24 legacy matches where the feed only stored a generic grade label for the opponent, so the club can't be identified.

### Official club names everywhere
- All team labels use the **full official club name** — no abbreviations (WKBCC, SHDCC…) or sponsor names (e.g. "Boddington Crane Hire Hornets" → Rockingham Hornets Cricket Club). This applies across `matches.team1/team2/hh_team/winner`, `match_batting.batting_team`, `match_bowling.bowling_team`, and the partnership `opposition` fields.
- Halls Head is **"Halls Head Cricket Club"** throughout (use `clubs.short_name` = `HHCC` if you want the abbreviation in the UI).
- `matches.opponent_name` = the official opposition name (or the raw label where the club is unknown); `matches.opponent_raw_name` keeps the original feed name for traceability.

### A Grade caps & the pre-digital policy
- `caps` records every player capped for the club in A Grade, in debut order. Cap numbers run separately for male and female.
- The club did **not** record A Grade statistics before the MyCricket/PlayHQ digital era unless a player reached **10 A Grade games**. So a capped player can legitimately have **no A Grade stats**: `a_grade_stats_tracked = FALSE` and `stats_note` explains why. These players often still have stats in other grades.
- 39 capped players had no app `player_id`; they were created as player records (IDs from 95001, `is_cap_only = TRUE`) so they still **count as having played for the club**, with the policy noted. Assign real app IDs later if they get registered.

### Scorecards & fill-ins
- `matches`/`match_batting`/`match_bowling` now cover **2013/14–2025/26** (1,318 matches) for every Halls Head team (A–F, U21 Colts, Female A, Female B, PPL, Mid-Year T20). This is the full PlayHQ-era history.
- **PlayHQ traceability:** all legacy matches (2013/14–2022/23) store the stable `playhq_match_id` (match GUID) and `hh_team_id` (season team GUID) so any row traces back to PlayHQ. The 2023/24–2025/26 matches predate this capture, so those two columns are NULL there (re-scrapable if wanted).
- **PPL before 2019/20** rolls into A Grade (`parent_grade = 'A'`) per club convention (it was A Grade T20 then); from 2019/20 PPL is its own parent grade.
- Both teams' innings are stored. Halls Head lines link to `player_id` (~99.7% linked); opposition lines have `player_id = NULL`.
- **Fill-ins:** each PlayHQ-era "Fill-in" is its own one-match player row (`is_fill_in = TRUE`, IDs from 90001), so a casual never accumulates a career. Legacy privacy-masked lines ("Private player", "********") are left unlinked.
- Ball-by-ball is **not** included (only the 2025/26 Grand Final was captured at that detail); it would require a re-scrape.

### Grade hierarchy (sub-competitions roll up to a parent grade)
Both `matches` and `career_stats` carry a **`parent_grade`** column. Each specific competition is kept
distinct in `grade`/`competition`, but rolls up to its overall grade for totals:

- `B Grade: McIntosh Cup` (one-day) + `B Grade T20` (2022/23 summer) + `Mid-Year T20 B` → **parent_grade `B`**
- same pattern for D, E, F, and Mid-Year T20 Female A → `Female A`

So "overall B Grade" stats include every B sub-competition, while you can still break them out by `competition`.

### Views (ready-made queries)
- `v_career_by_parent_grade` — all-time games/runs/wickets per player **per overall grade** (rolls up the sub-comps)
- `v_player_grade_summary` — match-level games/runs/wickets per player per overall grade (2018/19–2025/26)
- `v_player_competition_stats` — same, broken down by individual `competition` (the sub-comp detail)
- `v_centuries_count` — century count per batsman
- `v_fivefor_count` — five-for count per bowler
- `v_career_games` — total games per player across grades

## Seasons
All seasons are normalised to `YYYY/YY` (e.g. `2024/25`, `1999/00`) so tables join cleanly.

## Example queries
```sql
-- Leading century makers
SELECT * FROM v_centuries_count LIMIT 10;

-- A player's full career, grade by grade
SELECT grade, games, runs, bat_ave, hundreds, wkts
FROM career_stats WHERE full_name = 'Chris Phelps';

-- Club captains for a season
SELECT grade, person FROM grade_honours
WHERE role='Captain' AND season='2024/25';

-- Office bearers for a season
SELECT role, person FROM honour_board WHERE season='2024/25';

-- Highest partnership records for one grade
SELECT wicket, runs, batsmen, opposition, season
FROM partnership_records WHERE grade='A' ORDER BY CAST(wicket AS INT);
```

## Using it in code
Python:
```python
import sqlite3
con = sqlite3.connect("halls_head_cricket.db")
con.row_factory = sqlite3.Row
for row in con.execute("SELECT * FROM v_centuries_count LIMIT 5"):
    print(row["batsman"], row["tons"])
```
Node:
```js
const db = require('better-sqlite3')('halls_head_cricket.db');
const tons = db.prepare('SELECT * FROM v_centuries_count LIMIT 5').all();
```

## Refreshing the data
The database is generated from the workbook by `build_db.py`. When the workbook is updated,
re-run that script to regenerate `halls_head_cricket.db`. (For a live, app-editable database,
move to hosted Postgres/Supabase — the schema in `schema.sql` ports directly.)

## Notes / known limitations
- Stat tables reference players by name (text), since name formats differ slightly between the
  playing stats (Surname/Given) and honours (full names). A future step is to assign every
  record a single `player_id` via a reconciled name map.
- A few finals-tagged seasons in `centuries`/`five_wicket_hauls` keep a suffix (e.g. `2006/07 (SF)`).
