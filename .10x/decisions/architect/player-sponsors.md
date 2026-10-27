# Player sponsors: design

**Status:** Accepted by Ash 27 Oct 2026. **Scope:** `.10x/decisions/product-manager/player-sponsors.md`.

## Data (migration 0074)

| Change                                | Meaning                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `sponsor_players` (new)               | `id, tenant_id, sponsor_id → sponsors (cascade), player_id, player_name`   |
| unique `(sponsor_id, player_id)`      | a player is tagged once per sponsor                                        |
| index `(tenant_id, player_id)`        | "this player's sponsors"                                                   |
| `social_drafts.subject_player_id` int | the one player a player-centred draft is about; null for every other draft |

- **A join table, not an array column.** It follows `club_photo_players`, cascades on sponsor
  delete, and indexes by player. `player_id` has no foreign key, like photo tags: a central-data
  club's ids are crosswalk ids, a native club's are `players.id`.
- **`player_name` is a snapshot** taken by the server when the tag is saved
  (`linkedPlayerNames`, which knows both kinds of club; "Player #id" if it can't name one). The
  sponsor list then needs no central read, and a central outage never blanks the admin screen.
  It is a label only; nothing on a card reads it.
- **The draft stores the player, not the sponsors.** The club strip is resolved when a card is
  drawn (`loadActiveSponsors`), so player sponsors are too: one behaviour for every strip, dates
  honoured at post time, and tagging a player reaches their open drafts. Posted images are
  already fixed, so nothing posted changes. Photo focus stored a snapshot because a crop must not
  move under an admin; a sponsor list has no such edit to protect.

## API (OpenAPI first)

- `Sponsor` gains `players: [{ id, name }]` (required, `[]` when none). The admin list, the
  social settings bundle and the kiosk all return it (one `withSponsorPlayers` helper in
  `active-sponsors.ts`).
- `SponsorInput` / `SponsorUpdate` gain `playerIds: integer[]`. A PATCH with `playerIds` replaces
  the set. The route rejects ids that `nonSeniorPlayerIds` returns (400, "Only senior players can
  be tagged"), deduplicates, and writes the set in the sponsor's transaction.
- `SocialDraft` gains `subjectPlayerId: integer | null`; `CreateSocialDraftBody` gains an optional
  `subjectPlayerId` (Create a card, P1), checked with `nonSeniorPlayerIds`.

## One rule: `@workspace/scorecard/card-sponsors`

`sponsorsForCard` moves from `artifacts/cricket-club/src/lib/share-card/sponsor-limit.ts` to
`lib/scorecard/src/card-sponsors.ts` (the web module re-exports it), with `sponsorAppliesToKind`
and `maxSponsorLogos`, and gains the player rule:

```
cardSponsors(sponsors, { kind, grade, playerId }) → { sponsors, presentingName }
```

1. `PLAYER_SPONSOR_KINDS` = milestone, century, fiveFor, debut, player, newSigning (the scope's
   list; results, team lists, records, grade leaders and the rest keep the club strip).
2. **Player card with a player:** the sponsors tagged with that player, in the given order
   (card types ignored: the tag is the choice). If any: they are the strip and `presentingName`
   is the first one's name.
3. Otherwise **club-wide** sponsors: a sponsor with no players applies by its card types as
   today; a sponsor with players applies only where its card types are set and include the kind.
   On a player card, sponsors with players are left out entirely. The presenting sponsor leads;
   `presentingName` is the club's presenting sponsor.
4. **Team list:** unchanged (its team's sponsor, else club-wide without other teams' sponsors).

Fill-in ids (`>= 90000`) never match: the route never stores them and `playerId` from a card is
ignored when it is a fill-in.

## Who passes the player

| Surface                                | Player                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Sweep drafts (`enrichDraft`)           | `input.playerId ?? playerIdFromAppPath(appPath)`, stored as `subject_player_id` for player-centred kinds |
| Server post render (`draft-render.ts`) | `draft.subjectPlayerId`; also uses `cardGrade` now                                                       |
| Studio editor / draft panels           | `draft.subjectPlayerId`                                                                                  |
| Share card modal                       | its `playerId` prop                                                                                      |
| Template previews, sets, carousels     | none (sample data / not player cards)                                                                    |

Server and web call the same `cardSponsors`; a test in `lib/scorecard` pins the rule and the
server test checks the render payload for a tagged player.

## Juniors

Junior cards never get a subject player (`enrichDraft` skips it for junior drafts), and junior
participants can't be tagged. Juniors isolation holds: no junior table is read.

## Slices (each a PR to `main`)

1. **Docs** — this note and the scope.
2. **Foundation** — migration 0074, Drizzle schema, OpenAPI + codegen, sponsor routes with
   `playerIds`, `players` on every sponsor read, `cardSponsors` in `lib/scorecard` with tests.
   The web app's `sponsorsForCard` re-exports it. No card changes yet.
3. **Cards** — `subject_player_id` written by `enrichDraft` (inserts and refreshes), the server
   render and every web surface call `cardSponsors` with the player; tests both sides.
4. **Admin UI** — player tags on the sponsor form and rows (search, chips, senior-only hint, the
   "personal sponsor" note).
   4b. **Create a card player pick (P1)** — `CreateSocialDraftRequest.subjectPlayerId` (checked
   with `draftSubjectPlayerId` and `nonSeniorPlayerIds`, 400 otherwise). Create a card offers an
   optional Player on senior player cards (filled by the career milestone prefill); the preview,
   the share modal, Open in editor and the editor starters carry it, so the hand-made draft shows
   the player's sponsors.
5. **Templates (P1)** — the Sponsors player pack (announcement, season thank-you, a
   sponsor-featured version of each player kind) with its own fields `{{playerSponsorLogo}}`,
   `{{playerSponsorName}}`, `{{playerSponsor2Logo}}`, `{{playerSponsor2Name}}`, filled from the
   same `cardSponsors` result; after template library release 2.

Ash runs migration 0074 in Production SQL before the republish that carries slice 2.
