# DBA — match-day-carousel-content (T5.0)

Status: investigation complete 2026-10-20. Read-only; no code or schema changes.
Context: ADR-010 (`.10x/decisions/architect/match-day-carousel-content.md`), task T5.0 in
`.10x/decisions/engineering-manager/match-day-carousel-content.md`. Gates T5.1 (ladder
positions) and T5.2 (last meeting).

## Verdict

- **Do not build T5.1 on `central.ladder`.** It exists in the schema the app was built against, but
  it is an all-time table with no season and no position, and nothing keeps it current. A
  "position this season" read from it would be wrong for every club.
- **Build T5.1 on `playhq.ladders`** through the helper that already exists
  (`playhqGradeLadderUncached`). It is season-scoped, carries `rank` and competition points, flags
  the club's own team, and is refreshed by the PlayHQ sync. The Posting Plan's ladder carousel
  already reads it that way (plan 2026-10-07-001 KTD7).
- **T5.2 (last meeting) is feasible from `central.matches`** with one new exported helper. The
  query already exists privately (`matchesBetween` in `lib/db/src/central/vs-club.ts`). It needs
  three guards (grade comparison by app grade, final status only, tenant-perspective result) and
  has two known holes (club lineage, unmapped opposition). Both holes make the field hide, never
  show something wrong.

## What I could not check

I could not query the Replit Postgres from this session, so questions 1 and 2 are answered from the
code and docs, not from live rows.

- The only `CENTRAL_DATABASE_URL` on this machine (the repo-root `.env`, git-ignored) points at the
  **retired Supabase project** `ovation-central` and fails password authentication. CLAUDE.md says
  not to point work at that project, so I stopped there and did not look for other credentials.
- Production is out of reach for any assistant session.
- Everything marked "from code" below needs confirming with the SQL at the end. Run it in the
  Replit **dev** SQL runner first (that answers the "dev" half of T5.0), then production.

## 1. Does `central.ladder` exist, and what is it?

**Exists (from code, not confirmed live).** It is declared in `lib/db/src/central-schema/ladder.ts`,
built by the product-review fixture generator (`docs/product-review/evidence/generate-central.mjs:158`),
and `centralLadder()` in `lib/db/src/central/summaries.ts` documents it as "verified against the
live central schema" when Pack A shipped (July 2026). That check predates the move to
Replit-managed Postgres. Whether the move carried the table is unconfirmed until the SQL below runs.

**Columns (all nullable except the key):**

| Column                                       | Type                                                |
| -------------------------------------------- | --------------------------------------------------- |
| `id`                                         | integer, primary key                                |
| `grade`                                      | text (free text, same space as `matches.grade`)     |
| `club_id`                                    | integer (→ `central.clubs.club_id`, no FK declared) |
| `club`                                       | text (label as published)                           |
| `played`, `won`, `lost`, `tied`, `no_result` | integer                                             |

**Keys and indexes.** Only the primary key on `id`. There is no unique constraint on
`(grade, club_id)`, and no index on `grade` or `club_id`. The app code already de-duplicates by
club because several central grade labels fold into one app grade.

**What it does not have:** no `season`, no `points`, no `rank`/position, no net run rate, no
bonus points, no `updated_at`. `centralLadder()` therefore derives `points` with a guessed 6/3/3/0
scale and `pos` by sorting (`summaries.ts:173-178`). The Pack A follow-up
(`docs/follow-ups/2026-07-23-pack-a-social-templates-follow-ups.md:562`) already records this as a
data limitation.

**How it is populated: the PCA dump only; nothing refreshes it.**

- It comes from the PCA builder dump (`pca_full_postgres.sql`, seasons 2002/03–2025/26), so it holds
  an all-time cumulative record per (grade, club), frozen at the dump.
- The PlayHQ projector cannot write it: `scripts/sql/central-projector.sql:203` explicitly revokes
  insert/update/delete on `central.ladder` from `central_projector`.
- The PlayHQ projection plan states `ladder` / `premiers` refresh "stays curated or builder-owned"
  (`docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md:113`).
- The WA builder notes list matches, innings, batting, bowling, players and clubs; nothing in the
  repo or notes says WA ladders were loaded. Treat WA clubs (101–116) as having **no rows**
  until the SQL says otherwise.
- The live season table is `playhq.ladders` (one row per ladder table × team, with `rank`,
  `competition_points`, `bonus_points`, `net_run_rate`, W/L/T/NR, `fetched_at`). The sync loads it
  (`lib/db/src/playhq-ingest/load.ts`).

## 2. Completeness for the current season

`central.ladder` has no season, so "complete for the current season by grade" has no meaning for
it. For Halls Head (club 1) it would hold every grade the club ever played, at all-time totals as at
the PCA dump, and the 2026/27 season is not in it at all. For a WA club it is expected to be empty.

The question that matters is whether `playhq.ladders` is complete for the current season. The
SQL below (queries 4 and 5) answers that per grade for Halls Head and for one WA tenant. What the
code tells us now:

- Coverage depends on the club having a PlayHQ org and a sync run (`tenants.playhq_org_id`). A
  tenant without one has no ladder, and the field must hide.
- Freshness depends on the sync cadence (weekly, pre-weekend, match-morn, match-day, day-after).
  A ladder fetched before PlayHQ recalculates after the last round is out of date by one round.
- A grade can publish several ladders (One Day / Two Day); the helper returns each by name.
- `playhqGradeLadder` returns null for junior grades (juniors isolation holds).

## 3. Last meeting between two clubs from `central.matches`

**Yes, with guards.** `central.matches` is symmetric (home/away club ids), indexed on both
(`idx_central_matches_home_club`, `idx_central_matches_away_club`), and `vs-club.ts` already
queries the pair both ways. Things to handle:

1. **Home/away is meaningless.** The PlayHQ projector sets home to the _lower central club id_, not
   PlayHQ's home side (`central-transform.ts:439`). Query both orientations and compute the result
   from the tenant's side using `winner_club_id` (null winner = tie / no result / abandoned; use
   `result_text` for the wording).
2. **Grade labels.** Labels are free text and vary by era and association ("A Grade",
   "A Grade: Wyllie Cup", "T20: B Grade", WA "1st Grade", "Men's First Grade"). Never compare raw
   labels. Map both the fixture's grade and each candidate match through `appGradeFromCentral`
   (`lib/db/src/central/grades.ts:202`) and compare app grades. Null (junior, charity, unmapped)
   is excluded, which also keeps juniors out. Known side effect: T20 and mid-year sub-competitions
   fold into the base grade, so a T20 meeting can count as the last "A Grade" meeting. Decide with
   product whether that is acceptable; if not, filter on `comp_type`.
3. **Only finished matches.** Use final statuses only. Projected matches can be `IN_PROGRESS`
   (`centralStatus()`), `ABANDONED`, `CANCELLED`, `FORFEIT`. Exclude `IN_PROGRESS` and decide whether
   an abandoned/forfeit meeting counts. Recommend it does not.
4. **Ordering.** `match_date` is text. PlayHQ rows are written as Perth dates by `perthDate()`;
   existing reads compare it as a string (`>= sinceDay`). That is safe only if every row is ISO
   `YYYY-MM-DD`. The SQL checks the format. Order by `match_date desc, match_id desc`, and pass a
   `before` bound (the fixture date) so a re-run on match day does not return that day's own match.
5. **Duplicates.** The projector skips ambiguous matches (two rows with one `playhq_match_id`), so
   duplicates should not occur. The SQL checks.
6. **Club lineage — a hole.** Renamed or merged clubs get a new `club_id` with `parent_club_id` /
   `lineage_role` set on `central.clubs` (`active_from/to`). No central read in the app follows
   lineage today (only the schema files mention it). So a meeting under an old id is invisible when
   asked by the new id. Result: the field shows the last meeting _under current ids_, which may be
   older than the true last meeting, never a wrong one. For v1 accept and document; the SQL (query 8) sizes the problem for the pilot clubs. If it matters, expand each side to its lineage family
   in the helper later.
7. **Unmapped opposition — a hole.** The projector resolves PlayHQ orgs to central clubs through
   `central.club_playhq_orgs`, the tenant's own org, then an unambiguous name match. An opponent that
   resolves to nothing has `club_id` null, so the pair query cannot find the match. The fixture side
   must carry the opponent's central club id; if it does not, hide the field.
8. **Cross-association.** PCA and WA clubs never meet; the pair query returns nothing. Fine.

## 4. Existing helpers (`lib/db/src/central-queries.ts` is a barrel over `central/`)

| Helper                                                            | Where                                | Use for this feature                                                                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `centralLadder(clubId, season, grade)`                            | `central/summaries.ts:216`           | **No.** All-time, derived points and position. Its only consumer is the Pack A Ladder card prefill (`routes/social-prefill.ts`); it ignores `season`. See follow-up. |
| `centralLadderTable`                                              | `central-schema/ladder.ts`           | Drizzle mirror exists, contrary to the ADR's "no Drizzle helper" note, but unused for the new work.                                                                  |
| `playhqGradeLadder` / `playhqGradeLadderUncached(gradeId, orgId)` | `central/playhq-fixtures.ts:292,306` | **Yes (T5.1).** Season ladder per grade, club team flagged (`isClub`), `rank`, `points`, `played`. The uncached variant sees a ladder the sync loaded minutes ago.   |
| `playhqGradeIdsForCentralMatches(matchIds)`                       | `central/playhq-fixtures.ts:420`     | Maps central matches to PlayHQ grade ids when the fixture does not carry one.                                                                                        |
| `centralClubIdForPlayhqOrg(orgId)`                                | `central/vs-club.ts:372`             | Resolves an opponent org to a central club id.                                                                                                                       |
| `matchesBetween(clubId, opponentId)`                              | `central/vs-club.ts:224`             | **Private.** The core of T5.2. Export or generalise it.                                                                                                              |
| `vsClubSeniorMatchIds`                                            | `central/vs-club.ts:97`              | Senior / season-parse filter; reuse the same rule.                                                                                                                   |
| `appGradeFromCentral`, `parseSeasonStartYear`                     | `central/grades.ts`                  | Grade and season comparison.                                                                                                                                         |
| `clubInvolvedWhere`, `inList`                                     | `central/where.ts`                   | Club scoping predicates.                                                                                                                                             |
| `centralClubById`                                                 | `central/vs-club.ts:349`             | Name for the opponent.                                                                                                                                               |

No last-meeting helper exists today.

## Recommendation for P5

**T5.1 — ladder positions (change the approach, same effort).**

- Add `seasonLadderPosition({ orgId, playhqGradeId, now })` in `central/playhq-fixtures.ts`, built
  on `playhqGradeLadderUncached`. Return `{ rank, of, points, asOf, tableName } | null` for the club's
  own team, and the opponent's rank when the fixture's opponent is in the same table.
- Take the PlayHQ grade id from the fixture (`playhq.matches.grade_id` / the synced `public.fixtures`
  source), not from a label match. Use `playhqGradeIdsForCentralMatches` only as a fallback.
- Reuse the KTD7 freshness gate from `round-sets.ts`: use the ladder only when the club team's
  `played` is at least the club's finished matches in that grade this season. Also hide when
  `playhq.ladders.fetched_at` is older than the previous round (suggest 8 days, tunable).
- Hide the field when: tenant has no `playhq_org_id`, no ladder row, the club team is absent, the
  grade is junior, or the read throws. When a grade publishes several tables, use the one that holds
  both teams, else hide.
- Consistency test (the ADR asks for one): seed `playhq.ladders` for two grades and assert rank,
  gate and hide behaviour. Do **not** write a test that treats `central.ladder` as the source.
- Do not derive standings from `central.matches`. The points system is unknown per association (the
  6/3/3/0 constant is a guess; bonus points and net run rate decide ties), so a derived position can
  be confidently wrong.

**T5.2 — last meeting (as planned).**

- Export a `centralLastMeeting({ clubId, opponentClubId, appGrade, before })` from `central/vs-club.ts`
  (or a new `central/last-meeting.ts` re-exported by the barrel), reusing `matchesBetween`'s predicate
  with `match_date`, `winner_club_id`, `result_text`, `status`, `home_score`, `away_score` selected.
  Return a tenant-perspective result: `{ date, season, round, result: 'won'|'lost'|'tied'|'noResult',
margin/resultText, matchId }`.
- Apply guards 1–5 above. Hide on null opponent id, no match, or a thrown read.
- Test in `central-queries.test.ts` style: both orientations, folded T20 label, junior excluded,
  `IN_PROGRESS` excluded, abandoned excluded, `before` bound, null winner.
- Cache with `withCentralCache` keyed on (club, opponent, grade, before-day); safe because it only
  reads finished matches.

**Production prerequisites.** None for the code. No migration and no new tables. T5.1 depends on the
PlayHQ sync having run for the tenant; that is already live.

## Follow-ups (not in this task)

1. **The Pack A Ladder card (Create a Card) shows all-time standings labelled as a ladder.**
   `social-prefill.ts` calls `centralLadder`, which ignores `season` and returns the PCA dump's
   cumulative totals with guessed points. For a club in 2026/27 that is wrong. Re-point it to
   `playhqGradeLadder` (or hide it) once T5.1's helper exists. Flag to the product manager.
2. **Lineage-aware club ids** for head-to-head reads, if the SQL shows pilot clubs are affected.
3. **Confirm `central.ladder` in prod and dev; drop it from the "central tables" mental model** if the
   SQL shows it is stale or empty.

## SQL for Ash — read-only

Run in the Replit **dev** SQL runner first, then **Production**. Each block is a plain `select`.
Paste results back, or just say what was surprising. `1` is Halls Head. For the WA club, run query
0 to pick a tenant that has a `playhq_org_id` and replace `101` where it appears.

```sql
-- 0. Which tenants can use the PlayHQ ladder? (club ids, org ids)
select id, slug, central_club_id, playhq_org_id is not null as has_playhq_org
from public.tenants
order by id;

-- 1. Does central.ladder exist, and what does it look like?
select to_regclass('central.ladder') as central_ladder,
       to_regclass('playhq.ladders')  as playhq_ladders,
       to_regclass('central.club_playhq_orgs') as club_orgs;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'central' and table_name = 'ladder'
order by ordinal_position;

-- 2. Keys and indexes on central.ladder
select conname, contype, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid = 'central.ladder'::regclass;
select indexname, indexdef from pg_indexes
where schemaname = 'central' and tablename = 'ladder';

-- 3. Population: size, clubs covered, duplicates, and any trace of a season or refresh
select count(*) as rows, count(distinct grade) as grades, count(distinct club_id) as clubs,
       count(*) filter (where club_id is null) as null_club_rows
from central.ladder;

select (club_id between 101 and 116) as is_wa, count(*) as rows, count(distinct club_id) as clubs
from central.ladder group by 1 order by 1;

select grade, club_id, count(*) as dup_rows
from central.ladder group by grade, club_id having count(*) > 1
order by dup_rows desc limit 20;

select grade, played, won, lost, tied, no_result
from central.ladder where club_id = 1 order by grade;       -- Halls Head by grade
select grade, played, won, lost, tied, no_result
from central.ladder where club_id = 101 order by grade;      -- WA club (replace 101)

-- 4. The real source: playhq.ladders for Halls Head's org, by grade, current season
select g.name as grade, g.season_name, l.ladder_name,
       count(*) as teams, max(l.fetched_at) as last_fetched,
       max(l.played) as max_played,
       count(*) filter (where l.rank is null) as null_rank
from playhq.ladders l
join playhq.grades g on g.id = l.grade_id
join public.tenants t on t.playhq_org_id = l.org_id
where t.central_club_id = 1 and coalesce(g.is_junior, false) = false
group by g.name, g.season_name, l.ladder_name
order by g.season_name desc, g.name;

-- 5. Same for the WA tenant (replace 101 with the tenant's central_club_id)
select g.name as grade, g.season_name, l.ladder_name,
       count(*) as teams, max(l.fetched_at) as last_fetched, max(l.played) as max_played
from playhq.ladders l
join playhq.grades g on g.id = l.grade_id
join public.tenants t on t.playhq_org_id = l.org_id
where t.central_club_id = 101 and coalesce(g.is_junior, false) = false
group by g.name, g.season_name, l.ladder_name
order by g.season_name desc, g.name;

-- 6. central.matches: is match_date always ISO, and which statuses exist?
select status, count(*) as n,
       count(*) filter (where match_date !~ '^\d{4}-\d{2}-\d{2}$') as bad_date_format,
       count(*) filter (where match_date is null) as null_date,
       count(*) filter (where home_club_id is null or away_club_id is null) as unresolved_side
from central.matches group by status order by n desc;

select playhq_match_id, count(*) from central.matches
where playhq_match_id is not null group by 1 having count(*) > 1 limit 20;   -- expect no rows

-- 7. Sample last meeting: Halls Head against club 2 (replace 2), newest first
select m.match_id, m.season, m.grade, m.round, m.match_date, m.status,
       m.home_club_id, m.away_club_id, m.winner_club_id, m.result_text
from central.matches m
where (m.home_club_id = 1 and m.away_club_id = 2) or (m.home_club_id = 2 and m.away_club_id = 1)
order by m.match_date desc, m.match_id desc
limit 10;

-- 8. Lineage: clubs that were renamed or merged (head-to-head history can split across ids)
select club_id, name, parent_club_id, lineage_role, active_from, active_to
from central.clubs
where parent_club_id is not null or active_to is not null
order by club_id;
select to_regclass('central.v_club_combined') as club_combined_view;
```
