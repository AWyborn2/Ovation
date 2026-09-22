---
name: playcricket-stats-scraper
description: "Collect fixtures, results, ladders, ball-by-ball, scorecards, fielding stats and full player names for any club or association on play.cricket.com.au (Cricket Australia's PlayHQ site) and load them into Ovation's `playhq.*` landing schema. Use whenever the user wants to scrape the stats site, pull the upcoming season fixtures or schedule, check fixtures for changes, get the weekend's results, add ball-by-ball / fielding / ladder data, get full names for players, or refresh PlayHQ data for a club — for Halls Head, any Peel CA club, WA Premier Cricket, or a club never scraped before. Runs in a browser tab (built-in browser pane or Claude in Chrome) via `harness.js`; loads with `scripts/src/playhq-load.ts`."
---

# PlayHQ stats scraper (play.cricket.com.au → `playhq.*`)

Paths are relative to the Ovation repo root. Three parts, all verified live on 22 Sep 2026:

- `harness.js` — in-page collector. Discovers seasons → grades → matches for an organisation,
  fetches whatever the plan asks for, persists to IndexedDB (survives reloads, resumable),
  exports as gzip+base64 chunks or a download.
- `unwrap.mjs` — turns the exported chunks back into one dump JSON.
- `scripts/src/playhq-load.ts` — upserts a dump into schema `playhq` on `CENTRAL_DATABASE_URL`
  (DDL in `scripts/sql/playhq-schema.sql`), records fixture changes, prints a report.

Endpoint shapes: `references/endpoints.md`. Tables and how they join to `central.*`:
`references/data-model.md`. Governance: scraped public-site data, pilot-only and non-commercial
(CLAUDE.md "Data governance") — keep it behind this adapter, never commercialise on it.

## Prerequisites

- A browser tab on `play.cricket.com.au`. Either browser works; the harness is the same JS:

  | Step         | Built-in browser pane (default in the desktop app)              | Claude in Chrome                         |
  | ------------ | --------------------------------------------------------------- | ---------------------------------------- |
  | open tab     | `mcp__Claude_Browser__preview_start` `{url}`                    | `mcp__claude-in-chrome__navigate`        |
  | run JS       | `mcp__Claude_Browser__javascript_tool`                          | `mcp__claude-in-chrome__javascript_tool` |
  | get data out | `__ov.exportInfo()` + `__ov.export(i)` (results spill to files) | `__ov.download()` → `~/Downloads`        |

  Server-side `fetch`/`curl` to the API is refused; page → `localhost` is blocked too (tested).

- Repo tooling: Node 24, pnpm 11. Loading needs `CENTRAL_DATABASE_URL` (the ovation-central
  Supabase project — password held by Ash) or any Postgres you point it at.
- The organisation GUID: the last path segment of the club/association page URL, e.g. Halls Head
  `https://play.cricket.com.au/club/halls-head-cricket-club/4559f1b9-86d8-eb11-a7ad-2818780da0cc`.
  Peel Cricket Association is `c65c0bb8-87d8-eb11-a7ad-2818780da0cc`. For a new club, search on
  the site and read the URL.

## Run (agent path)

### 1. Open the tab and install the harness

Open the club page in the browser pane, then paste the **entire** contents of
`.claude/skills/playcricket-stats-scraper/harness.js` into the JavaScript tool (Read the file,
paste it verbatim). It returns `__ov 2.0.0 installed on https://play.cricket.com.au`.

### 2. Start a plan (returns immediately; poll `__ov.status()`)

Full-season fixtures + ladders for the current season (the weekly schedule check; ~30 calls, 10 s):

```js
await __ov.clear();
__ov.start({
  orgId: "4559f1b9-86d8-eb11-a7ad-2818780da0cc",
  seasons: "current",
  kinds: ["matches", "ladder", "gradeTeams", "rounds"],
  balls: "none",
  scorecards: "none",
});
```

Results after a match day — scorecards + ball-by-ball for every completed match on/after a date,
plus refreshed ladders and season stats (24 matches ≈ 58 calls, 10 MB, 8 s):

```js
await __ov.clear();
__ov.start({
  orgId: "4559f1b9-86d8-eb11-a7ad-2818780da0cc",
  seasons: ["Summer 2025/26"],
  kinds: ["matches", "ladder", "batting", "bowling", "fielding", "rounds", "gradeTeams"],
  balls: "since",
  scorecards: "since",
  since: "2026-02-01",
  resume: true,
});
```

Plan keys: `orgId` (required) · `seasons`: `'current' | 'all' | ['Summer 2025/26', …]` ·
`kinds`: any of `matches ladder batting bowling fielding rounds gradeTeams` ·
`balls` / `scorecards`: `'none' | 'completed' | 'since' | 'all'` (with `since: 'YYYY-MM-DD'`) ·
`gradeFilter: /regex/` · `includeJuniors: false` (default; juniors stay isolated) ·
`resume: true` skips match-level records already in the store. Skip `__ov.clear()` to add to
an existing store. Poll:

```js
__ov.status();
```

`phase` goes `discover → grades → matches → done`; `errorCount` should stay 0 (the API retries
3× with backoff and throttles to one call per 120 ms).

### 3. Export

Built-in browser pane:

```js
await __ov.exportInfo();
```

then one call per chunk (`chunks` from the info; each returns ≤ 800k chars of base64):

```js
__ov.export(0);
```

Each call comes back as "result exceeds maximum allowed tokens … saved to
`…\tool-results\mcp-Claude_Browser-javascript_tool-<n>.txt`" — that is the expected path,
note each file name in order. (A final small chunk may arrive inline; save it with Write.) Then:

```bash
node .claude/skills/playcricket-stats-scraper/unwrap.mjs <out>.json <spill-file-0> <spill-file-1> …
```

which validates the JSON and prints the record counts per kind. Claude in Chrome instead:
`await __ov.download('hallshead_2026-27_fixtures.json')` and read it from `~/Downloads`.

Keep dumps outside the repo (they are participant data; `scripts/README.md` says dumps live in
object storage, never git).

### 4. Load

```bash
cd scripts && ./node_modules/.bin/tsx ./src/playhq-load.ts --file=<dump>.json --dry-run
```

prints row counts per table without connecting. First time against a database:

```bash
cd scripts && ./node_modules/.bin/tsx ./src/playhq-load.ts --init --file=<dump>.json --report=8
```

(`--init` applies `scripts/sql/playhq-schema.sql`, idempotent.) Subsequent loads drop `--init`.
`--report=<days>` prints fixture changes recorded in the last N days, upcoming matches in the
next 14 days, and completed matches touched. Against the shared Supabase host add `--yes`
(the script refuses a non-local host without it). `--dir=<folder>` loads every `*.json` in it.

The repo loads no `.env` itself. Ash keeps `CENTRAL_DATABASE_URL` in the gitignored repo-root
`.env`; export it for the command without ever printing the value (this handles a UTF-8 BOM,
CRLF and quotes — plain `. ./.env` did not work):

```bash
export CENTRAL_DATABASE_URL="$(sed '1s/^\xEF\xBB\xBF//' .env | tr -d '\r' | grep '^CENTRAL_DATABASE_URL=' | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')"
```

A password containing `@` must be written `%40` inside the URL.
The published form is `pnpm --filter @workspace/scripts run playhq-load -- …` — on this Windows
machine call the local `tsx` instead (a `pnpm --filter` run wipes the hand-installed win32
binaries, see memory).

### 5. Report to the user

Say what was collected (grades, matches by status, scorecards, balls), what changed
(`fixture_changes`), what failed (`__ov.status().errors`), and where the dump is.

## Recurring cadence

Nothing schedules itself — the harness needs a browser, so a cloud routine cannot run it. Run
on request, or ask in the desktop app:

- **Weekly fixture check:** plan 1 above → load → `--report=8`. New rows are new fixtures;
  `fixture_changes` lists moved starts, venue swaps and status flips.
- **After each match day:** plan 2 with `since` = that Saturday. Same-day scorecards can be
  `PENDING` until entered; a `resume:true` re-run a day later fills the gaps.
- **Full-history enrichment for a club:** `seasons:'all'` with `balls:'completed'` is one call
  per match (Halls Head: 27 seasons; a grade-season of balls is ~40 MB raw, ~3 MB exported).
  Confirm the scope with the user first and run it season by season.

## Gotchas (all hit this session)

- **Club organisations return `{"grades":[]}`** from `/organisations/{id}/grades` and 204 from
  `competition-seasons`; grades come from `/teams?seasonId=` (each team names its grade and the
  association that owns it). Associations answer `/grades` directly. `discover()` does both.
- **`jsconfig=eccn:true` changes key casing.** With it: `id`, `grades`, `ladderData`. The July
  2026 notes (`Id`, `Grades`, `LadderData`) were captured without it. Always pass it.
- **`status` is `COMPLETED` (3)**, not `COMPLETE`; fixtures are `UPCOMING` (0) or `PENDING` (5).
  `isCurrentSeason` already points at 2026/27 in September, with 90 A Grade matches scheduled.
- **Page → `http://127.0.0.1:*` fetch fails** (`Failed to fetch`, even `no-cors`), so there is
  no localhost hand-off; and **blob downloads from the built-in browser pane vanish** (nothing
  in Downloads). Hence chunked export there, download only in Claude in Chrome.
- **Big JS results spill to a file**, not truncate: a 1,000,000-char return was saved intact.
  The `unwrap.mjs` script knows the spill format (`[{type,text}]` with a "captured at origin"
  suffix).
- **IndexedDB survives reloads, `window` does not.** Everything collected is in db `ov-playhq`;
  re-paste the harness after a reload and the store is still there (`__ov.count()`).
- **Junior grades** ("Year 6 Boys", "Year 10-11 Boys South West", owner MJCC) sit beside senior
  ones in a club's team list; the default `JUNIOR_RE` drops them. Their names are never published.
- **`fallOfWickets` is incomplete at the source** (present on 40 of 48 innings; 311 rows vs 372
  ball-level wickets), while the ball-level wicket count matched the scorecard's wickets in
  every innings. Trust `balls.is_wicket` for wicket analysis. Run-outs dismiss the non-striker
  about half the time (8 of 17), so join on `dismissed_id`, never on the striker.
- `.claude/skills/` is gitignored in this repo; this skill is re-included by name in
  `.gitignore`. A copy also lives in the personal skills folder — edit here, copy there.

## Troubleshooting

| Symptom                                                    | Fix                                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Unexpected end of JSON input` from a raw `fetch().json()` | the endpoint answered 204 (club `competition-seasons`); the harness returns `null` for 204           |
| `__ov is not defined`                                      | tab reloaded — paste `harness.js` again; the store is intact                                         |
| `call exportInfo() first`                                  | `export(i)` needs the gzip built by `exportInfo()` in the same page lifetime                         |
| `Nothing to do` from the loader                            | pass `--file`, `--dir`, `--init`, `--report` or `--ddl`                                              |
| `CENTRAL_DATABASE_URL points at a non-local host`          | add `--yes` (you are writing `playhq.*` on the shared database)                                      |
| `Cannot find module 'pg'` locally                          | `scripts/node_modules/pg` is a junction into the pnpm store on this machine; CI installs it normally |

## Verification done for this version (22 Sep 2026)

Halls Head, A Grade Wyllie Cup 2025/26: 94 matches, ladder, 253-player stats, 24 scorecards
and 11,662 deliveries collected in 8 s with 0 errors; loaded twice into a local Postgres 18
(second load a no-op); a dump with one altered fixture produced 3 `fixture_changes` rows.
Current season (2026/27) fixtures plan: 8 senior grades, 525 matches (124 involving Halls
Head, all `UPCOMING`/`PENDING`, first ball 10 Oct 2026), 65 teams, 81 ladder rows, 5 s.
Then loaded for real into the ovation-central Supabase project with `--init --yes` (schema
`playhq` created, 17 tables): 619 matches across both seasons, 91 ladder rows, 250 players,
24 scorecards, 11,662 balls — confirmed from the Supabase side afterwards. Note Supabase's
advisor flags RLS disabled on `playhq.*`, exactly as on `central.*` and `wa.*`; the anon key
can read these tables until a policy decision is made.
