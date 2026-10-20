# Architecture — social-photo-tag-selection

**Status:** Design complete 2026-10-20. Requirements: `../product-manager/social-photo-tag-selection.md`.
**Level:** component (picker logic inside api-server; one small data migration; UI filters).

## Decisions with Ash

- Retire `random` and `player` card photo rules for `teamList`, `matchSummary`, `matchDay` (2026-10-19).
- Headshots count, after tagged library photos, before leaving the tile empty (2026-10-20).

## Current landscape (verified)

- `pickDraftPhoto` (`api-server/src/lib/draft-enrich.ts:573`): rule → `playerId` photo → newest grade photo ranked by `preferredPhotoTypes`.
- `teamListPhotoPlayer` (`draft-enrich.ts:347`): random tagged selected player, then any headshot holder. Team List already does most of what's needed.
- `matchSummary`: no `playerId`; `featuredPlayerId` = single `topPerformerPlayerId` (`match-top-performer.ts`), only read by a `player` rule. Callers: queue engines via `draftPickOptions`, `matchCardPhoto` (share dialog), `matchDraftFeaturedPlayer`.
- `matchDay`: `preferredPhotoTypes` returns `[]` → newest grade photo of any type.
- `GET /club-photos` already takes `playerId` and `grade` query params.

## Options considered

1. **Kind-specific policy inside `pickDraftPhoto` (recommended).** One `PHOTO_POLICY` map from card kind to strategy; the three kinds get their own branch; every other kind keeps today's path. Small, local, testable, and the existing callers and draft re-fill keep working.
2. Move the logic into each engine and pass a finished URL. Rejected: duplicates logic across the queue, the share dialog and `fillMissingDraftPhotos`, and they drift.
3. New table-driven "photo policy" per tenant. Rejected: the rules are product-wide; YAGNI.

## Design

### Picker (U1)

```
PHOTO_POLICY = { teamList: "side", matchSummary: "game", matchDay: "gradeTeam" }  // others: "legacy"
```

`PhotoPickOptions` gains `candidatePlayerIds?: number[] | (() => Promise<number[]>)`, an
ordered list. It replaces `featuredPlayerId` for these kinds; `featuredPlayerId` stays for
legacy kinds.

`pickDraftPhoto` for a policy kind:

1. Junior → null (unchanged).
2. A `fixed` rule for (grade, kind) → that photo. `random`/`player` rows are ignored.
3. `side` / `game` → `pickCandidatePhoto(tenantId, candidates, order, seed, types, format)`:
   - Clean candidates: drop null, ≤ 0, fill-ins (≥ 90000), duplicates. Expand to crosswalk ids
     the same way `withLibraryPhotos` does, so a photo tagged on a merged-away id counts.
   - Pass A, tagged library photos: one query for the candidates that have a tagged photo.
     `side` → seeded random pick among them (keep `teamListPhotoPlayer`'s seed, so a fixture
     keeps its player across refreshes). `game` → first in rank order. Then that player's
     best photo via `playerPhoto`'s ordering (types, format, solo, newest).
   - Pass B, headshots: same ordering over candidates with a default `player_images` row.
   - Neither → **null**. There is no grade-folder fallback.
4. `gradeTeam` (matchDay) → newest grade photo with `photo_type IN ('team','celebrating')`
   (team first, then format rank, then newest). None → null.

Photo sources (for the queue's "why this photo" text): `auto:tag-player`,
`auto:tag-headshot`, `auto:grade-team`, `auto:rule-fixed`.

### Candidate lists

- Team List: the published team list's player ids (already passed to `teamListPhotoPlayer`;
  fold that helper into `pickCandidatePhoto`). `draftPickOptions` reads them via
  `teamListDraftPlayer`'s source (the team list), as a list instead of one id.
- Match Summary: new `rankedPerformerPlayerIds(lines)` in `match-top-performer.ts`. Same
  sort as today, but it returns every eligible player who batted or bowled, then appends the
  rest of the club XI (rostered/fielded but no bat/bowl) in id order.
  `topPerformerPlayerId = ranked[0] ?? null`, so existing behaviour and tests hold.
  `matchDraftFeaturedPlayer` → `matchDraftCandidatePlayers` returns the list. `matchCardPhoto`
  passes the same list, so the share dialog and the queue pick the same photo.
- The club side only. Opposition players are never candidates (central lines are already
  filtered to the club).

### Rule retirement (U2)

- API (`card-photo-rules` route): reject `mode in ('random','player')` for the three kinds
  with 400 `rule_mode_retired`. OpenAPI documents this; run codegen.
- Admin → Card photo rules UI: for those kinds, offer only "Automatic" (no rule) or "Fixed
  photo".
- Migration `NNNN_retire_tag_kind_photo_rules.sql` (next free number; 0049 is taken by selection-side-size), idempotent:
  `DELETE FROM card_photo_rules WHERE card_kind IN ('teamList','matchSummary','matchDay') AND mode IN ('random','player');`
  Ash runs it in prod before republishing. The picker ignores such rows anyway, so the order
  is safe either way.

### Admin fallback picker (U3)

- `GET /club-photos` gains an optional `photoType` filter and a repeatable `playerIds`
  (OpenAPI first, then codegen). The existing `playerId` / `grade` params stay.
- Draft and share-card DTO expose `photoCandidatePlayerIds` (the same list the picker used),
  so the UI can default the filter to "players in this side/game".
- `share-card-modal/use-photo-controls.ts` + `photo-controls.tsx`: a filter row (Players in
  this side/game · Any player ▾ · Grade ▾ · Type ▾), newest first, with the whole library
  reachable by clearing filters. An empty-state banner shows when `photoUrl` is null on a
  policy kind: "No tagged photo for anyone in this side — choose one".
- The manual pick persists as today (`photoSource = "manual"`), and KTD6 holds: auto never
  overwrites it.

### Team List rotation (U1b, added 2026-10-20 with Ash: Team List only)

Goal: the same tagged player and photo don't keep appearing on Team List slides.

- **Usage window:** the tenant's `teamList` drafts created in the last 28 days that aren't
  declined or deleted, excluding the draft being picked for (its own `sourceKey`). Both
  auto and manual photos count, since a posted photo has been seen either way.
- **Player usage:** count of those drafts whose `photoUrl` resolves to a `club_photos` row
  tagged with that player, plus headshot URLs matched to `player_images`. One grouped query.
- **Player choice (replaces the plain seeded random in Pass A/B):** candidates with a
  photo → lowest recent-use count → seeded random among ties (same seed as today).
- **Photo choice for that player:** prefer the photo least used in the window, then
  today's ordering (types, format, solo, newest).
- **Stability:** a refresh re-picks auto photos (`draft-upsert.ts:419`). If the draft's
  current auto photo still tags a player in the side, keep it, so refreshes don't make the
  photo jump.
- **Never empties a tile:** rotation only reorders. If the only candidate is over-used, they
  are still picked.
- Results / Summary / Match Day: unchanged (top performer order stays).
- Tests: two fixtures in a week with overlapping sides feature different players when
  possible; a refresh keeps the photo; a single tagged player is still used.
- Optional later (P2): show "used 3× in 4 weeks" in the admin picker.

## Invariants and tests

- Property test: for `side`/`game`, every non-null pick has a tag row (or default headshot)
  for a candidate. It never comes from a non-candidate.
- Fill-ins, juniors and opposition players are never picked; junior drafts stay null.
- `matchDay` never returns another grade's or another type's photo.
- A fixed rule wins; a random/player row is ignored.
- Share dialog = queue pick for the same match (extend `draft-enrich.test.ts`).
- Legacy kinds: snapshot that their picks don't change.

## Failure modes

- Candidate list load fails (team list missing, match detail missing) → treat as empty →
  null photo. The draft is still created; the admin picks one.
- A tagged photo is deleted after the pick → the existing broken-photo handling applies;
  `fillMissingDraftPhotos` re-picks only null photos.
- A sparse library → many null photos. Expected; monitor the manual-pick rate.

## Migration and rollout

Existing drafts keep their photos. New drafts and empty drafts use the new policy right
away. No feature flag: the behaviour change is what was asked for, and the fallback is
manual.

## Delivery units

- **U1** picker policy, candidate lists, `rankedPerformerPlayerIds`, Team List rotation, tests (api-server only).
- **U2** rule retirement: route validation, OpenAPI + codegen, admin rules UI, retire-rules migration (next free number).
- **U3** filtered picker: OpenAPI params + codegen, DTO field, share-modal filters, empty state.

U1 first. U2 and U3 both touch `openapi.yaml`, so run them in sequence or coordinate in one PR.
