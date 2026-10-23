# Honours kiosk redesign: delivery plan (23 Oct 2026)

Inputs: `decisions/architect/honours-kiosk-redesign.md` (design, motion model, six layouts, column
groups), `docs/design-handoffs/honours-kiosk-redesign/prototype.html` (approved behaviour),
`decisions/architect/kiosk-photo-rotation.md` + `decisions/product-manager/kiosk-photo-rotation.md`
(photo slideshows, junior library).

## Delivery model (Ash, 23 Oct 2026)

- **One integration branch, one merge**: `wyborn21/kiosk-redesign` cut from `main`. Slice PRs
  target the integration branch and merge into it on green CI. Nothing reaches `main` (or club
  TVs) until Ash has tested the finished integration branch and approves the single merge.
- Keep the integration branch current with `main` (merge `main` in at each milestone).
- Ash tests at milestones (A, B, C, D), not per slice.
- Production: every migration is idempotent `lib/db/migrations/NNNN_*.sql`; Ash runs them in the
  Production SQL runner before the republish that ships the merge.
- WIP: one writer per file set. The kiosk stream is sequential (A → B → C → D); the junior photo
  library is a separate parallel stream (different files, see below).

## Milestone A: new TV player and look (est. 6–9 days)

| Task | Work                                                                                                                                                                                                                                                                                                                                                                        | Size |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A0   | Local kiosk harness: a dev-only fixture page that renders the kiosk from a checked-in mock bundle (no admin login/token needed), used for browser checks and screenshots throughout                                                                                                                                                                                         | S    |
| A1   | Display settings model: extend `BoardDisplayConfigJson` (move, trans, dur, size, perPage, pageSecs, speed, hold, columnsPerScreen, top) + club defaults `kiosk_look` jsonb on `honour_display_settings` (migration); OpenAPI first, codegen; pure `resolveDisplay(board, look)`; **legacy mapping** (scroll→credits, slide→pages, fit→fit, textSize sm/md/lg→S/M/L) + tests | M    |
| A2   | Player engine (pure + tested where possible): movement (pages with measured rows per page, credits, fit + readability flag), transitions (fade, slides, pop, zoom, flip, wipe, rows reveal, cut, random; reduced-motion fallback), column groups (balanced split), rotation loop; header-fixed layout contract (header layer, clipped/masked body)                          | L    |
| A3   | Classic timber look as a new built-in skin (gold plate, Cinzel/Cormorant type scale, footer, page dots); re-pin legacy skin fingerprint test                                                                                                                                                                                                                                | M    |
| A4   | Season grid layout on the new engine (season once per row; grades/offices/awards as columns; column groups) wired to existing grid boards                                                                                                                                                                                                                                   | M    |

**Milestone A check (Ash):** existing boards play on the TV in the new look and motion via the
harness and a dev deploy; test on the real clubroom TV browser (performance risk).

## Milestone B: settings screen (est. 5–7 days)

| Task | Work                                                                                                                                                                     | Size |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| B1   | Tabs: Rotation · Look · Sponsors & ads · TV link; move existing sections, retire the long page                                                                           | M    |
| B2   | Rotation builder: drag list + keyboard (Alt+arrows) + ↑↓ buttons, typed items (board / sponsor wall / ad), add, duplicate, remove; persists to existing `kiosk_sequence` | M    |
| B3   | Per-board settings panel showing only controls for its layout, "Club default" inheritance + reset; Look tab edits `kiosk_look`                                           | M    |
| B4   | Live preview: the real player fed by unsaved form state; Play rotation / Replay item; Save / Discard / unsaved indicator                                                 | M    |

**Milestone B check (Ash):** set up the Halls Head rotation end to end in the new screen.

## Milestone C: new board layouts and data (est. 10–15 days, highest data risk)

| Task | Work                                                                                                                                                                                                        | Size |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| C1   | Leaderboard layout + endpoint (most games / runs / wickets / catches; top N; senior only, fill-ins excluded; reads via `central-queries.ts`)                                                                | M    |
| C2   | Achievement list layout + endpoints: centuries, five-fors (derived); hat-tricks (new tenant-scoped curated table + admin editor, migration); curated overrides derived                                      | L    |
| C3   | Record panels: grade records per grade (derived + curated override)                                                                                                                                         | M    |
| C4   | Records table: partnerships per wicket from `fall_of_wickets` where present; curated table for older seasons                                                                                                | L    |
| C5   | Plaques: premierships with ground, date, full XI with (C), MOM, result, from the grand final match in `central`; spike first to confirm how premiers link to the GF match (fallback: admin picks the match) | L    |
| C6   | Office bearers on the season grid (role columns, from the committee data)                                                                                                                                   | S    |

**Milestone C check (Ash):** every board type shows real Halls Head data; spot-check figures.

## Milestone D: photo slideshows (est. 4–6 days; after B2)

| Task | Work                                                                                                                                                                               | Size |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| D1   | `kiosk_photo_slideshows` jsonb (migration) + OpenAPI; server-side photo resolution in `GET /honour-display/kiosk` (senior library: folders / tags / recent / hand-picked / random) | M    |
| D2   | Photo slideshow rotation item + settings + player screen (preload, skip on error, captions, crest)                                                                                 | M    |
| D3   | Junior source: kiosk-token path on the gated junior image route, fail-closed consent filter (depends on the junior library stream)                                                 | M    |

## Parallel stream: junior photo library (est. 5–8 days, own branch → `main`)

Independent of the kiosk files, so it runs in its own session in parallel with Milestone A, with
PRs to `main` on green (it is an admin juniors feature, not on the TV). Per
`decisions/architect/kiosk-photo-rotation.md`: senior-parity columns on `junior_photos`,
`junior_photo_participants` join + backfill, `juniorLibraryPhotoAllowed`, Juniors admin library
UI reusing the senior components. D3 waits for it.

## Risks

- **TV browser performance** (transitions, credits on a cheap TV browser): test on the real TV at
  Milestone A before building on the engine.
- **Legacy settings mapping**: clubs' existing board configs must render sensibly on day one;
  covered by A1 tests over real saved configs.
- **Data gaps** for plaques (GF match link) and partnerships (FOW coverage): C5 spike first; curated
  fallbacks planned.
- **Long-lived branch drift**: merge `main` in at each milestone; keep slices small.
- **Production migrations** (`kiosk_look`, hat-tricks/curated records, `kiosk_photo_slideshows`):
  hand Ash the SQL before the republish; check with the drift script.

## Total

~25–37 working days of sessions across the kiosk stream, plus the parallel junior library stream.
