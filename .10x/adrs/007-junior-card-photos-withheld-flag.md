# ADR-007: Junior card photos behind a per-player "photo withheld" flag

**Status:** Accepted
**Date:** 2026-10-16
**Feature:** junior-card-photos
**Author:** 10x-Team (Architect + Staff Engineer), decision owner Ash
**Supersedes:** rule R21 of plan `docs/plans/2026-10-14-001-feat-junior-playhq-sync-plan.md` ("junior cards carry no player photos")

## Context

Junior social cards were shipped with no photo of any kind (R21), the conservative reading for children's data at the time. Clubs now want junior cards to look like senior ones. The club's registration form already asks families for photo consent, and the few non-consents are known to the club. Junior players are keyed by PlayHQ participant GUID; the senior photo library (`club_photos`) is hard-wired senior-only and keyed by integer player ids; the senior per-player headshots (`player_images`) are integer-keyed too; and `GET /storage/objects/*` currently serves any object URL without a session.

## Decision

1. A per-player **`photo_withheld`** flag on `junior_participants`, set only by an admin (with who/when), **off by default**: the registration form is the consent record, and the admin marks the exceptions. Ash made this call on 2026-10-16.
2. A separate **`junior_photos`** table keyed by participant GUID, filled only by admin uploads; the senior library and its senior-only guard are untouched.
3. A junior photo may appear only for a player who is **not withheld, not private, and named on the card**; the server writes a positive marker (`cardInput.juniorPhotoAllowed = true`) and every renderer shows a junior photo only behind that marker. The senior photo pipeline keeps "junior ⇒ no photo".
4. Changing withheld/private **removes the photo from unposted cards in the same request** and marks posted ones stale; the hourly sweep is the backstop.
5. Junior photos live under a private prefix that the storage route serves only to admins.

## Alternatives Considered

| Alternative                                                  | Pros               | Cons                                                                                                                  | Why not                                                        |
| ------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Consent default **off** (opt-in per player)                  | Strictest          | Every club would have to flag almost every player; the registration form already records consent                      | Ash's decision: the form is the record; the exceptions are few |
| Attach the signed consent form per player                    | Audit trail in-app | Heavy admin burden; the club already holds the forms                                                                  | Not needed for the pilot; can be added later                   |
| Per-team consent                                             | Simple             | Treats a whole team as consented                                                                                      | Too weak for children's data                                   |
| Reuse `club_photos` with a participant column                | One library UI     | Breaks its senior-only invariant and int-id tagging; junior photos would flow through senior rules/background removal | Separate table keeps the guard intact                          |
| Reuse the senior `player_images` via `senior_player_id` link | Zero new tables    | Covers only juniors who are also senior players                                                                       | Most juniors would have no photo                               |

## Consequences

### Positive

- Junior cards can carry photos with a clear, auditable rule; the default reflects how clubs actually collect consent.
- No change to the senior pipeline or its invariants.

### Negative

- A new table, three columns, a migration, and a parallel (small) photo library UI.
- A club that has **not** collected consent through registration must flag players proactively; the runbook and admin copy say so.

### Risks

- A photo shown for a player whose consent was withdrawn after the card was drafted → mitigated by the in-request withdraw (R6/KTD6) and the sweep backstop; posted cards are marked stale for the admin.
- Private photo URLs leaking → mitigated by the admin-only storage prefix (KTD7); only rendered cards the club posts become public.

## Dependencies

- Junior markers (`junior`, `juniorTeams`) from plan 2026-10-15-001 on every junior card.
- Migration 0045 applied by hand before republishing.
