---
name: Digital Cricket Scorecard
description: How the branded two-innings match scorecard is built and the fill-in/inner-join gotcha that looks like a bug but isn't.
---

# Digital Cricket Scorecard (web + mobile)

The match page renders a branded two-innings scorecard from one shared pure-TS view-model lib, `@workspace/scorecard` (`buildScorecard(matchDetail)`). Web (`artifacts/cricket-club/src/components/scorecard/*`) and mobile (`artifacts/cricket-mobile/components/scorecard.tsx`) both consume it so they stay in lockstep — change the mapping in one place.

## Innings ordering depends on the API returning `hhccBattedFirst`
- Ordering rule: `match.hhccBattedFirst !== false` → Halls Head bats first; `false` → opposition first. `null`/`undefined` both fall to HH-first, and `orderKnown = hhccBattedFirst != null`.
- **Why this matters:** the field is selected AND mapped in `loadMatchDetail` (matches.ts), but if the running dev server predates that route edit, `res.json` silently omits the `undefined` field and *every* match renders HH-first (wrong for chases). The symptom is "ordering looks broken" with correct-looking code.
- **How to apply:** after any matches.ts response-shape change, restart the API workflow and `curl /api/matches/<id>` to confirm the new key is present before debugging the client.

## Fill-ins are NOT dropped by the inner join (architect false-positive)
- replit.md says "fill-ins have no real player record", which suggests the HH-lines `innerJoin(players...)` in `loadMatchDetail` would drop fill-in lines (playerId ≥ 90000). It does **not**.
- **Why:** `match_player_lines.player_id` has an FK to `players(id)`, and fill-ins exist as real rows (ids 90001+, given/surname both literally "Fill-in"). A line can never exist without a player row, so inner join == left join here.
- **How to apply:** don't "fix" the inner join to a left join for fill-ins — it's a no-op. The mapping already renders playerId ≥ 90000 as plain "Fill-in" with `playerId: null` so there's no popup/link. The "exclude fill-ins from derivations" rule is about stats/records/milestones, not about scorecard display.

## Display conventions worth keeping consistent
- Halls Head colours (navy `#00305c` / gold `#f5a623`) are fixed; opposition colours derive from `clubs.primaryColour/secondaryColour` via `deriveOppositionColors`, degrading to a neutral dark scheme. Missing logo → initials chip.
- Extras are derived (`innings total − sum(batter runs)`), attributing wides/no-balls from bowling lines and lumping the remainder as `other` (byes/leg-byes/penalties). There is no separate stored extras column.
- Hat-tricks: flame badge on the bowler row; admin management panel is web-only (mobile is read-only). The branded card intentionally has no hat-trick column.
