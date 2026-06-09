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
| `matches` | One row per match (**2002/03–2025/26**, 2,091 matches): season, short `grade` code (A, B, … for grouping), `competition` (full grade descriptor e.g. "A Grade: Wyllie Cup"), round, date, venue, both teams + scores, plus `playhq_match_id` (stable PlayHQ match GUID) and `hh_team_id` (PlayHQ season team GUID). The Halls Head side is labelled **HHCC** in `hh_team`/`team1`/`team2` (and in `batting_team`/`bowling_team`); opponents keep their real name where available |
| `match_batting` | Per-innings batting cards: `match_id`, batting order, `player_id`, name, runs/balls/4s/6s/SR, dismissal, `is_halls_head`, `is_fill_in` |
| `match_bowling` | Per-innings bowling cards: `match_id`, `player_id`, name, overs/maidens/runs/wickets/econ/wd/nb, `is_halls_head`, `is_fill_in` |
| (matches) `hh_result` / `winner` | Every match also carries Halls Head's result (Won/Lost/Tied/No Result) and the winning team. For 2003/04–2012/13 these come from PlayHQ's authoritative match summary; for later seasons they're derived from the scores |
| (matches) `toss_winner` / `batted_first` / `hh_batted_first` | `toss_winner` = club that won the toss (captured for 2003/04–2012/13, where PlayHQ exposed it). `batted_first` = the side that batted first (official club name); `hh_batted_first` = 1/0 whether Halls Head batted first. `batted_first`/`hh_batted_first` are populated for **every** match with a scorecard; `toss_winner` only where the feed recorded it |
| `caps` | A Grade cap register (264 caps, debut order, separate `cap_number` per `category` male/female): name, `player_id`, deceased, `games_a_grade`, `a_grade_stats_tracked`, `stats_note` |
| `clubs` | PlayHQ club/association reference (17): name, `playhq_org_id`, slug, PlayHQ page URL, `logo_url` + `logo_url_128`, and brand colours (`primary_colour`/`secondary_colour`/`tertiary_colour`/`quaternary_colour`) for rendering scorecards & match summaries |
| `playhq_participants` | Maps PlayHQ's **stable, career-long participant GUID** to the club `player_id` (730 participants, 680 linked covering 604 players). PlayHQ keeps one participant ID per person for life — even privacy-masked ("Private Player") juniors keep the same ID across seasons, so their stats stay attributable and can be named retroactively if they go public. `is_private` flags masked participants; `display_name`, `scorecard_lines`, `first_season`/`last_season` describe what was seen. Coverage is 2002/03–2025/26 (the 2023/24–2025/26 seasons were re-scraped with full ID capture) |
| `seasons` | Reference list of all seasons |

### Club logos & colours
- `clubs` holds Halls Head, the Peel Cricket Association, and every opposition club, each with PlayHQ logo URLs (full + 128px), brand colours, and a `short_name` (e.g. Halls Head = `HHCC`).
- `matches.opponent_club_id` links a match to the opposition club so the app can render the right logo/colours. **1,149 matches resolved** (all 2023/24+, plus most legacy matches now that the 2003/04–2012/13 PlayHQ match summaries supply real club names instead of generic grade labels); the rest are legacy matches where the feed only stored a generic grade label, or abandoned/forfeit matches with no opposition named.
- **Branding contract (what the scorecard should consume):** join `matches.opponent_club_id → clubs.id` for the opposition's `logo_url` / `logo_url_128` / `primary_colour` / `secondary_colour`, and use the `short_name = 'HHCC'` club row for the Halls Head side. Every resolved `opponent_club_id` points at a real club that has both colours and a logo (verified, no dangling or self-references), so a successful join always yields renderable branding. When `opponent_club_id IS NULL` (790 legacy generic-label matches), fall back to a neutral/default crest — there is no club to resolve. Resolving and exposing this on the app's `matches` API is the data-load task's responsibility (#161); the scorecard consumes these columns rather than adding its own lookup.

### Official club names everywhere
- All team labels use the **full official club name** — no abbreviations (WKBCC, SHDCC…) or sponsor names (e.g. "Boddington Crane Hire Hornets" → Rockingham Hornets Cricket Club). This applies across `matches.team1/team2/hh_team/winner`, `match_batting.batting_team`, `match_bowling.bowling_team`, and the partnership `opposition` fields.
- Halls Head is **"Halls Head Cricket Club"** throughout (use `clubs.short_name` = `HHCC` if you want the abbreviation in the UI).
- `matches.opponent_name` = the official opposition name (or the raw label where the club is unknown); `matches.opponent_raw_name` keeps the original feed name for traceability.

### A Grade caps & the pre-digital policy
- `caps` records every player capped for the club in A Grade, in debut order. Cap numbers run separately for male and female.
- The club did **not** record A Grade statistics before the MyCricket/PlayHQ digital era unless a player reached **10 A Grade games**. So a capped player can legitimately have **no A Grade stats**: `a_grade_stats_tracked = FALSE` and `stats_note` explains why. These players often still have stats in other grades.
- 39 capped players had no app `player_id`; they were created as player records (IDs from 95001, `is_cap_only = TRUE`) so they still **count as having played for the club**, with the policy noted. Assign real app IDs later if they get registered.

### Scorecards & fill-ins
- `matches`/`match_batting`/`match_bowling` now cover **2002/03–2025/26** (2,091 matches) for every Halls Head team (A–F, U21 Colts, Female A, Female B, PPL, Mid-Year T20). This is the full available play.cricket.com.au / PlayHQ history.

#### 2003/04–2012/13 result rules (how abandoned / no-result matches were handled)
The earliest decade was reconstructed from PlayHQ's stats portal under these rules:
- **Full scorecard present** → match counted as Completed, winner taken from the official match summary (Won/Lost/Tied; first-innings results included).
- **No Halls Head batting or bowling recorded** (washouts, forfeits, "result pending" with no play) → marked **`status = 'Abandoned'`, `hh_result = 'No Result'`, and *not* counted toward games or player stats** (88 matches). These are listed in `Review/2003-2013_flagged_matches.csv`.
- **Phantom duplicate teams** — finals-series artifacts where PlayHQ created a second team with no Halls Head squad (e.g. the 2003/04 "C1" semi-final, duplicate E-grade entries) → **dropped entirely** (20 matches), also listed in the flag file.
- Every dropped or abandoned match is in `Review/2003-2013_flagged_matches.csv` for your review.
- **PlayHQ traceability:** all legacy matches (2013/14–2022/23) store the stable `playhq_match_id` (match GUID) and `hh_team_id` (season team GUID) so any row traces back to PlayHQ. All seasons including 2023/24–2025/26 now carry these GUIDs (the recent seasons were re-scraped in June 2026).
- **PPL before 2019/20** rolls into A Grade (`parent_grade = 'A'`) per club convention (it was A Grade T20 then); from 2019/20 PPL is its own parent grade.
- Both teams' innings are stored. Halls Head lines link to `player_id` (~99.7% linked); opposition lines have `player_id = NULL`.
- **Innings order (which side batted first):** `match_batting.innings` / `match_bowling.innings` are normalised to a consistent **1-based batting sequence** — `innings = 1` is the side that **batted first**, `innings = 2` batted second — regardless of whether Halls Head or the opposition is the home side. The team labels are on each row (`batting_team` / `bowling_team`, plus `is_halls_head`). **To render a scorecard, order the two innings by `innings`** rather than assuming Halls Head bats first: in 562 matches Halls Head bowled first, so `innings = 1` is the opposition. (Earlier data carried two numbering schemes — legacy PlayHQ matches were 0-based, 2023/24+ matches 1-based — which is why a naive load defaulted to Halls-Head-first; this has been reconciled.) A handful of partial legacy matches captured only the second innings' batting card (the side that batted first survives only as the Halls Head bowling card at `innings = 1`); these correctly show `batting innings = [2]`, `bowling innings = [1]`.
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


### "Played (stats not recorded)" and dropped fixtures (club policy, June 2026)
- A fixture with **no scorecard but a named team list** is a real game: `status = 'Played (stats not recorded)'`. The team lists are in **`match_rosters`** (both databases); results like forfeit wins stay attached. No player stats are invented.
- A fixture with **no scorecard AND no team list** is an empty system entry and is **dropped entirely** (98 senior, 363 junior — listed in the Review flag files).
### Junior records — SEPARATE database
- **Match dates & venues:** every junior match now carries `match_date` (recovered from PlayHQ — fixes the earlier field-path miss) and, where PlayHQ holds it (2018/19+), `venue` plus `venue_oval`, `venue_address`, `venue_suburb`, `venue_lat`/`venue_lng`. Senior matches likewise got `match_date` + `venue`/`venue_oval`/`venue_address` populated.
- **Competition/association:** junior `association` column classifies the governing comp — Peel Junior Cricket Association (default), Community Cup, South West Junior (SWMJCC), or Girls League — derived from the grade name (`competition` keeps the full grade descriptor). Carried onto the junior premiership board too.

- **Unified age band:** `matches.age_band` (and `junior_premierships.age_band`) merges the club's old Under-age naming with the new school-year naming into one consistent band, so an age group lines up across the 2022/23 naming change. Mapping (confirmed against the club's 2024/25 team↔grade pairings): U10→Year 4, U11→Year 5, U12→Year 6, U13→Year 7, U14→Year 8, U15→Year 9, and **U16 + U17 → Year 10-11**. The original raw label is kept in `age_group`.

- Juniors live in their own files: **`halls_head_juniors.db`** (SQLite) and **`halls_head_juniors_postgres.sql`** — completely separate from the senior database until the club decides how to handle junior records. 2,191 matches (2003/04–2025/26), 32,589 batting and 30,618 bowling entries, across Under 10–17, Girls League and Community Cup teams.
- Junior players are identified **only** by their career-stable PlayHQ `participant_id` (693 participants, just 6 privacy-masked) — there are **no links to senior player records anywhere**. When the club decides, the shared participant IDs make joining junior and senior careers automatic.
- 560 junior fixtures had no Halls Head scorecard entered (common in junior cricket — washouts/unscored games): marked `Abandoned`, no stats counted, listed in `Review/juniors_flags.csv`.
- The senior database's `matches.is_junior` column stays all-zero; if the club later chooses one combined database, the junior data folds in with that flag set.

### (was: Junior records pending)
- `matches.is_junior` flags junior matches; **all current rows are senior (`is_junior = 0`)**. A full junior history scrape (2,191 matches, 2003/04–2025/26) is held in `JSON Data/hh_scorecards_juniors_2003-2026.json` awaiting the club's decision on junior handling. When ingested, juniors keep their own grade codes (U10–U17 etc.) and never mix with senior career stats; junior players are tracked by PlayHQ participant ID only until the club decides how to link junior/senior careers.

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
