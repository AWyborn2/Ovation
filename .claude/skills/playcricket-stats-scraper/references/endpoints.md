# play.cricket.com.au API — verified endpoint catalogue

Every shape below was fetched live on 22 Sep 2026 from a `play.cricket.com.au` tab with
`jsconfig=eccn:true` on the query string. **Always pass that parameter** — the harness does — it
selects camelCase keys (`id`, `name`, `ladderData`). The July 2026 version of this skill
documented PascalCase keys (`Id`, `Grades`, `LadderData`); those come back when the parameter is
omitted, so mixed casing in old notes is a jsconfig artefact, not API drift.

Base: `https://grassrootsapiproxy.cricket.com.au`. Reachable only from JavaScript running in a
`play.cricket.com.au` tab (server-side `curl`/`fetch` is refused). `playhq.com` itself has a bot
gate — stay on `play.cricket.com.au`.

Two kinds of organisation GUID exist and they behave differently:

| Org kind                                                          | `/organisations/{id}/grades` | `/organisations/{id}/teams`                              | `competition-seasons`          |
| ----------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------- | ------------------------------ |
| Association (e.g. Peel CA `c65c0bb8-87d8-eb11-a7ad-2818780da0cc`) | lists its grades             | its teams                                                | 200 with competitions + grades |
| Club (e.g. Halls Head `4559f1b9-86d8-eb11-a7ad-2818780da0cc`)     | **`{"grades":[]}`**          | teams, each carrying `grade{id,name,owningOrganisation}` | **204 No Content**             |

So for a club, grades are discovered through its teams; `harness.discover()` does both and merges.

## Finding an organisation GUID without the URL

### `GET /orgsproducts/organisation/{orgId}` — name, short name, crest for a known GUID

### `GET /orgsproducts/organisation/search?searchString=…`

What the site's search box calls. Returned `{"organisations":[]}` for "Rockingham Mandurah" even
though the club exists as "Rockingham-Mandurah Cricket Club" (`2dd0a9a1-86d8-eb11-a7ad-2818780da0cc`),
so do not treat an empty result as proof of absence. The reliable way to enumerate every club in a
competition is `/fixturesladders/grades/{gradeId}/teams` for each of the association's grades and
collecting `teams[].owningOrganisation` — that is how the WA-side clubs were found. A club can sit
in a different association from the one you expect (Rockingham-Mandurah plays WA Premier Cricket
and only occasionally enters a Peel CA cup).

## Organisation-scoped

### `GET /fixturesladders/organisations/{orgId}/seasons`

```json
{"seasons":[{"id":"69609582-…","name":"Summer 2026/27","startDate":"2026-07-01T00:00:00.0000000+00:00",
             "classification":[{"id":1,"name":"Participating"}],"isCurrentSeason":true}, …]}
```

Halls Head: 27 seasons back to 2001/02. `isCurrentSeason` is set on the season whose fixtures are
being published (2026/27 in September 2026, before a ball is bowled).

### `GET /fixturesladders/organisations/{orgId}/teams?seasonId=…`

```json
{"teams":[{"id":"<team guid, season-specific>","name":"A Grade",
           "grade":{"id":"23f816be-…","name":"A Grade Wyllie Cup",
                    "owningOrganisation":{"id":"c65c0bb8-…","name":"Peel Cricket Association Inc.","shortName":"PCAI","logoUrl":"…"}},
           "grades":[{"id":"…","name":"…","isCurrent":false,"owningOrganisation":{…}}]}, …]}
```

Junior teams appear here too (`Year 6 Boys`, `Year 10-11 Boys South West`, owner MJCC). The
harness drops them unless `includeJuniors:true` — juniors isolation is a project invariant.

### `GET /fixturesladders/organisations/{orgId}/grades?seasonId=…` (association only)

```json
{"grades":[{"id":"…","name":"Mid-Year T20 B Grade"}, …]}   // Peel CA 2025/26: 16 grades
```

### `GET /fixturesladders/organisations/{orgId}/competition-seasons?seasonId=…&responseModifier=includeGrades` (association only)

```json
{"competitionSeasons":[{"id":"…","competition":{"id":"…","name":"Mid-Year T20 Competition","competitionFormat":"Senior","competitionType":"Tournament"},
                        "season":{"id":"…","name":"Summer 2025/26","startDate":"…","endDate":"…"},
                        "grades":[{"id":"…","name":"Mid-Year T20 B Grade"}, …]}, …]}
```

## Grade-scoped (one grade = one season)

### `GET /scores/grades/{gradeId}/matches` — fixtures **and** results

```json
{"matches":[{"id":"<match guid>","status":"UPCOMING","statusId":0,"matchType":"One Day","matchTypeId":2,
  "resultText":"Sat 10 Oct 2026 at 11:45AM (local time)",
  "round":{"id":"…","name":"Round 1","shortName":"R1"},
  "matchSchedule":[{"matchDay":1,"startDateTime":"2026-10-10T11:45:00.0000000+08:00"}],
  "venue":{"name":"Stan Twight Reserve","line1":"45 HENNESSY WAY","suburb":"ROCKINGHAM","postCode":"6168","stateName":"WA","country":"AU",
           "playingSurface":{"name":"Stan Twight Reserve - Oval #1 (West)","latitude":-32.29,"longitude":115.72}},
  "teams":[{"id":"<team guid>","displayName":"SBCC A Grade","isHome":true,"isWinner":false,"isBatting":false,"oversBowled":0,"scoreText":null,
            "owningOrganisation":{"id":"…","name":"Shoalwater Bay Cricket Club","shortName":"SBCC","logoUrl":"…"}}, {…}],
  "isLiveStreaming":false}, …]}
```

Status values seen: `UPCOMING/0`, `PENDING/5` (fixture without a confirmed date/venue),
`COMPLETED/3`, `ABANDONED/4`. (`COMPLETED`, not the `COMPLETE` the July notes claimed.) A whole
grade-season is one call: A Grade 2025/26 = 94 matches / 145 KB; 2026/27 = 90 matches already
scheduled in September. `resultText` on an upcoming match is the kick-off time. `matchSchedule`
has one entry per day for two-day matches. No points field anywhere — derive from the ladder.

### `GET /fixturesladders/grades/{gradeId}/ladders`

```json
{"grade":{"id":"…","name":"A Grade Wyllie Cup","organisation":{…}},
 "ladders":[{"name":"One Day","columns":[{"id":"played","heading":"P","description":"Played"}, … 19 columns],
   "pools":[{"teams":[{"id":"<team guid>","displayName":"White Knights Baldivis A Grade","rank":1,"includesAdjustments":false,"includesUnofficial":false,
      "owningOrganisation":{…},
      "ladderData":[{"id":"played","val":18},{"id":"competitionPoints","val":96},{"id":"bonusPoints","val":15},{"id":"quotient","val":1.673},
                    {"id":"netRunRate","val":1.518},{"id":"won","val":13},{"id":"lost","val":4},{"id":"ties","val":0},{"id":"noResults","val":1},
                    {"id":"byes","val":0},{"id":"forfeits","val":0},{"id":"disqualifications","val":0},{"id":"adjustments","val":0},
                    {"id":"runsFor","val":3385},{"id":"oversFaced","val":703},{"id":"wicketsLost","val":113},{"id":"runsAgainst","val":2577},
                    {"id":"oversBowled","val":781.5},{"id":"wicketsTaken","val":144}]}, …]}]}]}
```

A grade can publish more than one ladder (`ladders[].name`), so the loader keys on
`(grade_id, ladder_name, team_id)`. `ladderData` is a list of `{id,val}` — pivot it.

### `GET /participants/grades/{gradeId}/batting-statistics` / `bowling-statistics` / `fielding-statistics`

All three return a **flat array** (253 entries for A Grade 2025/26 — every player in the grade,
all clubs):

```json
[{"id":"<participant guid>","name":"Manuel, Jack","shortName":"J Manuel","organisation":{"id":"…","name":"Halls Head Cricket Club"},
  "statistics":{"matches":20,"battingInnings":18,"battingAggregate":790,"battingNotOuts":3,"battingBallsFaced":843,"battingHighScore":108,
                "isBattingHSNotOut":true,"battingAverage":52.67,"battingStrikeRate":93.71,"battingFours":94,"battingSixes":33,
                "batting50s":5,"batting100s":2,"batting0s":1,"battingMinutes":0}}, …]
```

bowling `statistics`: `matches, bowlingBalls, bowlingMaidens, bowlingRuns, bowlingWickets, bowlingAverage, bowlingEconomyRate,
bowlingStrikeRate, bowlingBestInnings ("5-23"), bowling5WIs, bowling10WMs, bowlingWides, bowlingNoBalls`.
fielding `statistics`: `matches, fieldingCatchesNonWK, fieldingCatchesWK, fieldingTotalCatches, fieldingStumpings,
fieldingAssistedRunOuts, fieldingUnassistedRunOuts, fieldingRunOuts`.
`id` is the same participant GUID as scorecard `participantId` — exact join, never name-match.
Union the three reports per grade: a player who only bowled is missing from batting.

### `GET /fixturesladders/grades/{gradeId}` — grade metadata

`{"id","name","isPublicStream","owningOrganisation":{…}}`

### `GET /fixturesladders/grades/{gradeId}/teams`

`{"grade":{"id","name","organisation":{…},"teams":[{"id","name":"A","displayName":"Boddington Crane Hire Hornets","owningOrganisation":{…}}, …]}}`
— the definitive team → club mapping for a grade (10 teams in A Grade).

### `GET /scores/grades/{gradeId}/rounds`

`{"grade":{"id","name","currentRoundId"},"rounds":[{"id","name":"Round 1","shortName":"R1","isFinalsRound":false}, … 21]}`

## Match-scoped

### `GET /scores/matches/{matchId}?responseModifier=IncludeScorecard&organisationId={orgId}`

25 KB for a completed one-day match. Top level: `id, status, statusId, matchType, matchTypeId,
isBallByBall, matchSummary, matchStreams, round, grade, matchSchedule, venue, teams, officials,
innings`. Without the modifier the same call returns everything except `innings` (5 KB).

```json
"matchSummary":{"resultText":"MCC Senior Men A Grade won by 6 wickets",
  "teams":[{"id":"…","displayName":"Halls Head A Grade","wonToss":false,"battedFirst":true,"isWinner":false,"resultType":"LOST","resultTypeId":14,
            "scoreText":"189","isHome":true,"isBatting":false}, {…}]},
"innings":[{"id":"<innings guid>","name":"1st Innings - Halls Head A Grade","inningsNumber":1,"inningsOrder":1,"battingTeamId":"…",
  "inningsCloseType":"All Out","isDeclared":false,"isFollowOn":false,"runsScored":189,"numberOfWicketsFallen":10,"oversBowled":43.3,
  "byesRuns":0,"legByesRuns":3,"wideBalls":15,"noBalls":1,"penalties":0,"totalExtras":19,
  "batting":[{"participantId":"…","playerShortName":"J Rudge","batInstance":1,"batOrder":1,"runsScored":24,"ballsFaced":32,"foursScored":2,"sixesScored":1,
              "strikeRate":"75.00","battingMinutes":0,"dismissalText":"b: M Rawson","dismissalType":"Bowled","dismissalTypeId":4,
              "isOnStrike":false,"isOnNonStrike":false,"highlight":{"highLightType":"WICKET","highlightURL":"https://highlights.frogbox.tv/…m3u8"}}],
  "bowling":[{"participantId":"…","playerShortName":"J Donald","bowlOrder":2,"oversBowled":7,"maidensBowled":1,"runsConceded":34,"wicketsTaken":0,
              "economy":"4.85","wideBalls":5,"noBalls":1,"isBowling":false}],
  "fielding":[{"participantId":"…","playerShortName":"C Smith","catches":1,"wicketKeeperCatches":0,"totalCatches":1,"stumpings":0,
               "runOuts":0,"assistedRunOuts":0,"unassistedRunOuts":0}],
  "fallOfWickets":[{"order":1,"participantId":"…","playerShortName":"J Manuel","runs":72}]}]
```

`oversBowled` is cricket notation (43.3 = 43 overs 3 balls). `strikeRate`/`economy` are strings.
Toss / batted-first / winner live only in `matchSummary.teams[]`.

### `GET /scores/matches/{matchId}/balls` — ball-by-ball

436 KB / 546 deliveries for a completed one-day match (gzips ~12:1, so an export of many matches
is fine). Only populated when the scorecard's `isBallByBall` is true (reliable from ~2016/17).

```json
{"teams":[{"id","displayName","owningOrganisation":{…}}],
 "innings":[{"id":"<innings guid — same as the scorecard's>","inningsNumber":1,"inningsOrder":1,"inningsName":"1st Innings - Halls Head A Grade","battingTeamId":"…",
   "balls":[{"id":"<ball guid>","overNumber":0,"ballNumber":1,"ballDisplayNumber":1,"ballTime":"2025-10-11T03:59:41Z","bowlerStartTime":"…",
     "strikerParticipantId":"…","strikerShortName":"J Rudge","strikerRunsScored":0,"strikerBallsFaced":1,
     "nonStrikerParticipantId":"…","nonStrikerShortName":"J Manuel","nonStrikerRunsScored":0,"nonStrikerBallsFaced":0,
     "bowlerParticipantId":"…","bowlerShortName":"J Donald",
     "runsBat":0,"wides":0,"noBalls":0,"byes":0,"legByes":0,"penaltyRuns":0,
     "progressRuns":0,"progressWickets":0,"progressScore":"0-0","shortDescription":".","description":"J Donald to J Rudge : No Run"}, …]}]}
```

Wicket deliveries add: `dismissedParticipantId, dismissalType ("Caught"), dismissalTypeId, fielderParticipantId, fielderShortName,
dismissedParticipantFoursScored/SixesScored/StrikeRate, highlight{highlightUrl,…}`; `shortDescription` is `"W"`.
`overNumber` is 0-based; `ballNumber` restarts each over and extras share numbers, so order by
array position (`seq` in the loader).

## Not usable from injected JS

`/participants/players/{pid}/teams` and `/participants/players/{pid}/seasons/{s}/matches` are
CORS-blocked (from the sibling season-scraper skill's notes). Don't guess new paths by analogy —
watch the UI's own requests (`performance.getEntriesByType('resource')` filtered on
`grassroots`, or `read_network_requests`) and copy the real URL.
