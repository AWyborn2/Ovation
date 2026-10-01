---
title: Balanced Card Sets (Cover + Detail) - Plan
type: feat
date: 2026-10-01
topic: balanced-card-sets
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: brainstorm (card set options artifact, 29 Sep 2026)
execution: code
---

# Balanced Card Sets (Cover + Detail) - Plan

## Goal Capsule

- **Objective:** When a game day, weekend wrap or team list holds more than one card's worth of rows, export it as one post: a **cover card** followed by **detail cards**. The rows are **spread evenly** across the detail cards (never 6 on one and 1 on the next), and every card in the set looks like part of one professional, consistent post.
- **Product authority:** Ash (owner). Option D ("cover + detail") was chosen for all three card types on 1 Oct 2026, from the options page at https://claude.ai/artifact/C8bDWXfWYnKKNRKQyyuxxi.
- **Open blockers:** none. Decisions D1–D4 below have recommended defaults and can be confirmed during review.
- **Stop conditions:** Stop and ask before any production migration (none planned) and before an auto-draft engine change that would post more often than today.
- **Execution profile:** Five PRs in order (U1 → U5). Each one ships on its own and leaves the app working.

---

## Product Contract

### Problem

Game day (`roundFixtures`), weekend wrap (`weekendWrap`) and team list (`teamList`) cards hold a fixed number of rows: 5 grades, 4 to 5 results, and one team each. A big club's round doesn't fit. Today the extra rows are cut off without warning, and team lists go out as one post per team.

### Requirements

- **R1. Cover + detail.** A round that fits on one card exports as that single card. A round that doesn't fit exports as a cover card plus detail cards, as one post (a carousel).
- **R2. Even distribution (hard rule).** Rows are split across detail cards so card sizes differ by **at most one row**, and the fullest cards come first. No detail card is ever left with one lonely row while another is full.
- **R3. Sections never mix.** Junior grades are never on the same card as senior grades (juniors isolation). Within seniors, a card break falls on a natural group boundary (men / women / other) when that keeps R2.
- **R4. Consistent look.** Every detail card in a set uses the same row size (density tier), header, footer and "2 / 3" page marker position. A card with fewer rows centres them; it never stretches them or leaves a large gap.
- **R5. Cover content.** Each cover carries a headline number and a one-line summary:
  - game day: "11 teams in action", plus the grades;
  - weekend wrap: the win–loss record ("5–2"), with wins and losses listed;
  - team lists: "6 teams named", plus the grades.
- **R6. Team lists as one post.** All of a round's published team lists can go out as one carousel (a cover, then one card per team). Individual team cards can still be posted on their own.
- **R7. Export.**
  - Instagram / Facebook carousel at portrait 1080×1350 (default) or square.
  - Story: the same slides, as a numbered sequence.
  - Landscape (web / email): one summary card. This is the cover with its list, never a carousel.
  - Download as a ZIP of numbered PNGs, with one shared caption.
- **R8. Editable.** Admins can preview every slide, switch the cover off, choose a different grouping, and edit the cover and the detail cards in the Studio editor.
- **R9. Every pack.** Club Kit gets bespoke covers. The other packs get a skeleton cover in their own look, so a set works whichever pack the club uses.

### Decisions (recommended defaults, confirm in review)

- **D1. Rows per detail card.**
  - Game day: 5, on the standard row size.
  - Weekend wrap: 4 (results carry a performer line).
  - Team list: 1 team.
  - These are maximums. The balancing rule decides the actual counts.
- **D2. Cover threshold.**
  - A cover is added only when there is more than one detail card.
  - Team lists get a cover from 2 teams up.
  - Admins can switch the cover on or off per post.
- **D3. Auto-drafts.**
  - Game day: one draft per round (seniors) and one per junior round, offered as a club setting ("Game day posts: one per fixture | one per round"). The default stays "one per fixture", so nobody's posting volume changes without a choice.
  - Team lists: a new "round team lists" draft gathers the round's published lists into one post. The single-team drafts remain, and the club setting chooses between them.
- **D4. Grouping.** Groups (men / women / other / juniors) come from the grade label, using the same classifier rules as `isJuniorGradeLabel` plus a small women's/T20/vets matcher. An admin can override a grade's group in social settings later; that is not in this plan.

### Scope boundaries

- **In:**
  - the balancing engine and set planner;
  - Club Kit covers;
  - skeleton covers for the other packs;
  - a set preview in the queue, create page and editor;
  - multi-slide still export and the post pack;
  - a round team-list kind;
  - the two club settings.
- **Out:**
  - scheduling a carousel straight to Instagram (posting stays manual / post pack);
  - animated carousels;
  - ladder sets (the ladder already has a 10-row layout; revisit later);
  - converting hand-authored `card_sets` into this model.

---

## Planning Contract

### How the even split works (R2, R3)

`planRows(rows, { cap, sectionOf, groupOf })` → `Row[][]` (one array per detail card):

1. **Sections.** Split rows into sections by `sectionOf` (senior / junior) and keep the original order. Sections never share a card.
2. **Card count per section.** `k = ceil(n / cap)`.
3. **Even sizes.** `base = floor(n / k)`, `extra = n % k`. The first `extra` cards get `base + 1` rows and the rest get `base`. Sizes therefore differ by at most one, fullest first.
4. **Group-aware breaks.** For each break between cards, look at the cut points that keep every card within the step-3 sizes (±0). If one of them falls on a group boundary (`groupOf` changes), use it; otherwise keep the default cut. This never breaks R2. It only chooses between equally balanced options.
5. **Tiny sections.** A section with 1 or 2 rows (e.g. a single junior grade) still gets its own card, rendered in the **spotlight** density tier (larger, centred rows). It reads as designed rather than as a leftover.

| Rows                  | Cap | Cards | Sizes            | Not this        |
| --------------------- | --- | ----- | ---------------- | --------------- |
| 6                     | 5   | 2     | 3 + 3            | 5 + 1           |
| 7                     | 5   | 2     | 4 + 3            | 5 + 2           |
| 8 seniors + 3 juniors | 5   | 2 + 1 | 4 + 4, juniors 3 | 5 + 3 + 3 mixed |
| 11                    | 5   | 3     | 4 + 4 + 3        | 5 + 5 + 1       |
| 7 results             | 4   | 2     | 4 + 3            | 4 + 3 (same)    |
| 9 results             | 4   | 3     | 3 + 3 + 3        | 4 + 4 + 1       |

### Density tiers (R4)

Each detail design gets three row sizes, chosen per set rather than per card, so every slide matches:

| Tier      | Used when the fullest card has | Row height (card cqmin)                 |
| --------- | ------------------------------ | --------------------------------------- |
| spotlight | 1–2 rows                       | ~1.6× standard, rows vertically centred |
| standard  | 3–cap rows                     | the current Club Kit rows               |
| compact   | only on the landscape summary  | ~0.7×, up to 8 rows                     |

The page marker ("2 / 3") sits in the kind chip on every slide, e.g. "ROUND 15 · 2/3", in the same place. The cover's chip reads "ROUND 15" with a swipe cue.

### Key technical decisions

- **KTD1. A set is derived, not stored.**
  - A draft stays one row with one `cardInput` (the full list). `planCardSet(input, size, options)` is a pure function in the web app (`lib/card-sets/plan.ts`). It returns the ordered slides `{ role: "cover" | "detail", input, page, of, tier }` and is called the same way by the queue preview, the editor, the share modal and the server still harness.
  - No migration is needed, and editing the source list re-plans the set automatically.
- **KTD2. Set options live in `adjustments`.** `adjustments.set = { cover?: boolean; grouping?: "auto" | "none"; cap?: number }` is opaque jsonb already, so no codegen is needed. Per-slide edits use `adjustments.slides[slideKey]`:
  - the cover's key is `cover`;
  - a detail card's key is `detail:<first row's grade>`, so edits follow the content when the plan changes.
- **KTD3. Covers are designs with a role.**
  - `PackDesignEntry` gains `role?: "cover"`. `resolveTemplate(input, packId, { role })` picks the cover design for the kind.
  - Cover fields are derived in `bindInput` (`count`, `summary`, `record`, `gradesLine`) from the same input, so no new input shape is needed.
  - Club Kit covers reuse the existing parts (top photo frame, two-line headline, big number, tricolour rule), as in the options page.
- **KTD4. Detail slides reuse the existing designs.** A detail slide's input is the source input with its rows sliced (`fixtures` / `matches` / `players`), its chip label set to "ROUND 15 · 2/3", and `density` set. The designs read `{{density}}` as a CSS class hook (`data-density`) that switches row sizes. Pack-lint gains a check that every design with a repeat renders all three tiers.
- **KTD5. A round team-list kind.** `teamListRound`: `{ roundLabel, date, teams: { grade, opponent, venueDateTime, players[] }[] }`. Its detail slides ARE `teamList` inputs (one per team), so the existing team-list designs in every pack render them unchanged. It is junior-aware (junior teams form their own section, R3).
- **KTD6. Export.**
  - The still harness takes `slide=<index>`, and `POST /social-drafts/:id/post-pack` returns `slides[]` (url, page, of) plus one caption.
  - The download menu offers "All slides (ZIP)" and each slide on its own.
  - Landscape asks the planner for the single summary card (cover + compact list), so a set never needs a landscape carousel.
- **KTD7. One engine change, opt-in.**
  - Round-based drafts for game day and team lists are new engines behind the club settings (D3), deduped by `sourceKey` = `round:<season>:<weekend>:<section>`.
  - Existing per-fixture engines are untouched while a club stays on "one per fixture".

### Sequencing

U1 → U2 → U3 → U4 → U5. U1 to U3 are web-only and need no server change.

---

## Implementation Units

### U1. Balancing engine + set planner (pure, web)

- `lib/card-sets/balance.ts`: `planRows` (steps 1–5 above). `lib/card-sets/groups.ts`: `sectionOf` / `groupOf` from grade labels.
- `lib/card-sets/plan.ts`: `planCardSet(input, size, options)` for `roundFixtures`, `weekendWrap` and (in U4) `teamListRound`. It returns slides with role, sliced input, page/of and tier.
- **Tests:** a property test over n = 1…30 and caps 3…6 checks that sizes always differ by ≤ 1, the fullest come first, sections never mix and every row is used exactly once. Plus the table above as fixed cases, and group-boundary preference cases.

### U2. Density tiers + Club Kit covers

- Club Kit detail designs get `data-density` hooks for spotlight, standard and compact rows, with centred vertical rhythm. The chip carries the page marker.
- Three Club Kit cover designs (`role: "cover"`): game day, weekend wrap and team lists, in all four formats. The landscape cover includes the compact list (the R7 summary card).
- `bindInput` gains the cover fields (count, summary, record, grades line).
- Skeleton packs (Gold Foil, Bold Type, Neon Night, Sunset, and Broadcast Dark as the reference) get one shared cover body per kind in `skeleton-designs.ts` (R9), so every pack has covers in its own look.
- **Tests:**
  - every cover renders at every size with nothing unbound;
  - a set's slides share the tier and header;
  - pack-lint checks tiers;
  - a visual contact-sheet script (`scripts/src/render-card-sets.ts`, headless Chromium) renders reference sets for 4, 6, 7, 8+3, 11 and 13 rows into `docs/design-handoffs/card-sets/` for review before merging.

### U3. Set preview + export (web + still harness)

- Queue, create page and share modal show a slide strip ("Slide 2 of 3") with a cover toggle and a grouping toggle (KTD2).
- Editor: a slide switcher. Edits go to `adjustments.slides[slideKey]`.
- Still harness takes `slide`, and the post pack returns `slides[]`. Download offers "All slides (ZIP)". The caption is shared.
- **Tests:**
  - the post pack returns N slides for a long round and 1 for a short one;
  - the harness renders slide k;
  - slide edits survive adding a row;
  - the cover toggle;
  - the landscape summary is a single card.

### U4. Round team lists (`teamListRound`)

- New kind (openapi enum + codegen, types, sample, form, catalogue). The planner splits it into a cover plus one `teamList` slide per team, with junior teams as their own section.
- Create-page prefill: "This round's published team lists".
- **Tests:** published-only, tenant-scoped prefill; junior teams in their own section; each team slide is identical to that team's single card.

### U5. Round engines + club settings (built)

- `social_settings.round_schedules` (nullable jsonb, migration `0023_round_schedules`) holds one schedule per round card: `{ mode, day, hour }`, with day 0 = Sunday and the hour in club (Perth) time. The settings API returns every card's schedule, filling in defaults, and merges saves per card. Null keeps the old behaviour: game day and team lists per match, no weekend wrap.
- Admins set it under **Social → Cards → Round cards**:
  - game day: each match, whole round or off;
  - team lists: each team, whole round or off;
  - weekend wrap: whole round or off.
    A whole-round card asks for a day and time.
- Engines (`lib/engines/round-sets.ts`) run in the hourly sweep. At the chosen time they draft that week's round: one draft per round and section (seniors and juniors kept apart). Each draft refreshes as fixtures or selections change, until the round's first ball. Only the week after the chosen time is drafted, so switching a card on never back-fills past rounds.
  - The weekend wrap reads central results, so it is for central-data clubs only and runs on the scheduled sweep only.
  - A card set to whole round or off turns its per-match engine off.
  - The family switches (Match day, Round-up) still gate everything.
- **Tests:**
  - schedule maths (Perth time, exactly-on-time, a minute early);
  - nothing drafted before the chosen time;
  - one draft per round, run twice;
  - seniors and juniors apart; next week left out;
  - no per-match cards while a card is on a round schedule;
  - team lists: published only, fill-ins excluded;
  - no refresh after the round starts;
  - settings API defaults, merge and validation;
  - the Round cards settings UI.

---

## Verification Contract

- `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, web tests, `test:libs`, and api-server tests on a CI-style local Postgres.
- The U2 contact sheet is reviewed by Ash before merging: every reference set, in every format, in Halls Head colours and a dark-primary club.
- A rendered-PNG check: no slide has text overflowing its row or footer (measured in the harness).

## Definition of Done

- A round of any size exports as one post. The detail cards differ by at most one row, sections never mix, and every slide shares one row size and header.
- Covers exist for game day, weekend wrap and team lists in Club Kit and every skeleton pack, at all four formats.
- Admins can preview, toggle the cover, edit slides and download all slides with one caption.
- Clubs that don't change the new settings see no change to their auto-draft volume.
