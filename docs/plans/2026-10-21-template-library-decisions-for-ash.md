# Social template library: decisions made while Ash was away

Started 21 Oct 2026. Ash asked the orchestrator session to finish the template library on the
integration branch (`wyborn21/social-template-library-pm`) until it's ready to test on the local
dev server. Where a decision came up, the session went with its own recommendation or the
engineering team's, and logged it here. Nothing was merged to `main` and #411 is untouched.

Each entry says what was decided, why, and how to reverse it. Go through them together with
Ash before #411 merges.

## How the work was run

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                         | Why                                                                                                                                                                                  | To reverse                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| O1  | The four streams from the EM plan each run in one long-lived session that works through its slices in order. Stream 1 is the L1-A session, Stream 2 the spike session, Stream 3 a new platform session, and Stream 4 the converter session                                                                                                                                                                       | The app only lets the orchestrator start sessions on Ash's own messages, so each stream carries itself on                                                                            | n/a                                                             |
| O2  | The orchestrator owns every main→integration sync. Stream sessions only merge the integration branch into their own branches                                                                                                                                                                                                                                                                                     | One place resolves conflicts in shared state files, so no two sessions fight over them                                                                                               | n/a                                                             |
| O3  | The library's migration is **0059**, not 0058 as the EM plan says. #415 (crest overrides and junior names) took 0058 on `main`                                                                                                                                                                                                                                                                                   | Next free number. L9 confirms the final number at release                                                                                                                            | Renumber at the next `main` sync if needed                      |
| O4  | Ash's milestone checks M1–M5 are deferred to his return. Slices keep merging into the integration branch on green CI, as the plan already allowed                                                                                                                                                                                                                                                                | Ash is away. The plan only needed Ash to test at milestones, not to gate each merge                                                                                                  | Ash runs M1–M5 on the dev stack before #411                     |
| O5  | Look polish: past 8 hd, a stream carries on up to 12 hd and ships its best version instead of stopping to ask. Each look's `report.md` says "pending Ash sign-off"                                                                                                                                                                                                                                               | The plan said to stop and ask Ash at 8 hd. Waiting would stall the critical path                                                                                                     | Ash reviews each look; hand-design any he rejects               |
| O6  | `main` was synced into the integration branch (9d7af341). A `status.md` conflict was resolved by keeping both sides                                                                                                                                                                                                                                                                                              | It brought in #416 (Studio editor) and #415 (crests). The plan syncs `main` before work starts                                                                                       | n/a                                                             |
| O7  | Figma import (L8) maps colour **styles** named `ovation/accent`, `ovation/panel`, `ovation/ink` and `ovation/gold`, not Figma variables. A clear "token expired" message is shown, and the runbook notes the token's renewal date                                                                                                                                                                                | Ash's token has `file_content:read` only. Variables need the Enterprise-only `file_variables:read`. Personal tokens expire after at most 90 days                                     | If Ovation is on Figma Enterprise, switch L8-A to variables     |
| O8  | `sponsor1..3` become implicit image tokens on every kind and page, and Match Day's title page gains `weekendSponsor0..2` (in L1-B, #420)                                                                                                                                                                                                                                                                         | Every pack prints a sponsor strip on every card, but the catalogues listed those tokens on only 3 kinds. The converter was dropping the strip on 14 kinds                            | Remove the implicit tokens, and the strip goes from those kinds |
| O9  | Streams rebalanced: Stream 3 (platform) finished early, so it takes L4-B and L4-D from Stream 1 after L6. Stream 1 keeps L1-C → L2-B and the three active looks' polish                                                                                                                                                                                                                                          | Stream 1 lost time when its session was archived automatically after #417 merged. It's now the critical path                                                                         | n/a                                                             |
| O10 | Each look's raw conversion (T4.12) is the first commit of that look's polish PR, made by the stream polishing it. There's no separate seven-look conversion PR. Stream 3 keeps L4-D only. This replaces part of O9                                                                                                                                                                                               | Polish starts straight from its own conversion, so no stream waits on another                                                                                                        | n/a                                                             |
| O11 | Stream 1 takes L1-D (style, motion, vectors), building it on top of L1-B's branch (#420). Stream 2 goes on to L5-B, L7 and L8-B                                                                                                                                                                                                                                                                                  | Every look's polish is blocked on L1-D, and Stream 2 has been waiting on an approval from Ash for hours. #420's conflicts are left to Stream 2, so nobody gets around Ash's approval | n/a                                                             |
| O12 | New additive format features beyond ADR-011: `style.clip` (a polygon, in percent of the layer's box) and a brightness filter preset. The converter maps clip-path, layered backgrounds (as stacked shapes) and `brightness()`. The O8 sponsor tokens move from #420 into Stream 1's converter-fidelity PR                                                                                                        | Club Kit's raw conversion matched the pack at only 60% after L1-D. 396 clip-paths, 160 layered backgrounds and 112 brightness filters were being lost on every look                  | Drop the features and hand-design those shapes instead          |
| O13 | Stream 2's session got stuck on a permission prompt that Ash couldn't grant, and the app wouldn't stop it. The orchestrator resolved #420's conflict itself, keeping both new exports in `kind-templates/index.ts`, and Stream 3 took L5-B, L7-A, L7-B and L8-B                                                                                                                                                  | Unblocks L1-B, L1-D and every look's polish. Ash said he couldn't grant the permission                                                                                               | n/a                                                             |
| O14 | Stream 2's session came back after the takeover and built the L7-B backend (#438, merged). Stream 3 cut its own L7-B PR (#441) down to the console UI on top of it, and owns L7-A and L8-B                                                                                                                                                                                                                       | Avoids two backends                                                                                                                                                                  | n/a                                                             |
| O15 | v2 shapes with a border or shadow but no `fill` paint nothing behind them. v1 keeps its default accent. Until Stream 1's renderer fix lands, the converter writes `fill: "#00000000"` (#434)                                                                                                                                                                                                                     | Gold Foil's frame lines rendered as solid pink panels                                                                                                                                | n/a                                                             |
| O16 | Club Kit (#440) is listed for 17 of 24 kinds. The 7 list kinds (Club Leaderboard, Ladder, Results Summary, Round Fixtures, Team List, Team of the Week, Weekend Wrap) stay unlisted until a new slice adds a v2 row-cell ellipsis at minimum size (Stream 4). After that, every look re-runs the fit check                                                                                                       | Worst-case names overflow row cells, which can't end in "…". Listing a kind that fails fit would ship cut-off names                                                                  | Accept the overflow and list them now (not recommended)         |
| O17 | The fit check lets faint watermarks (opacity ≤30%) bleed off the card (#440)                                                                                                                                                                                                                                                                                                                                     | Pack designs use oversized faint crests on purpose                                                                                                                                   | Make the rule strict and resize the watermarks                  |
| O18 | Editable elements work added to this release (#411): every element editable, a data-driven element library from all ten looks, and club-saved elements that are public to all clubs, with placeholders for club images, brand-token colours, attribution, and unlist and report. The plan is `docs/plans/2026-10-22-editable-elements-plan.md`, with migration 0061                                              | Ash asked for it on 22 Oct 2026, chose the same release, and chose public club elements. The safeguards are the orchestrator's recommendation                                        | Ship the elements as their own release                          |
| O19 | Per-size copies of one decoration are joined by a `link` id, and the editor updates their style and content together, each keeping its own geometry. Each layer also gets a `sig` design signature for the element library. Paste gives new link ids, and delete asks whether to remove the layer on every size                                                                                                  | Per-size style overrides would need renderer and editor rewrites. Links fix "edit one size, others stale" with additive fields (Stream C, C2)                                        | Merge the copies into one layer with per-size style later       |
| O20 | A bundle file whose content changes must have its version raised. The converter now does this automatically; hand edits do it by hand. #454's Weekend Wraps were raised to version 2 in #462                                                                                                                                                                                                                     | The server ignores a changed bundle at the same version, so the edits never reached the library                                                                                      | n/a                                                             |
| O21 | Closed: the reported Broadcast Dark drop (91% against 96%) didn't reproduce. On fresh capture builds at the integration head, all seven looks re-check at their committed numbers (Club Kit 93, Broadcast Dark 96, Duotone 90, Gold Foil 89, Bold Type 87, Neon Night 91, Sunset 94). The 91% came from a stale or mixed capture build                                                                           | Stream B's bisect ruled out #448, #450, #451, #461, #462, #463 and #466                                                                                                              | n/a                                                             |
| O22 | Faint elements (translucent panels, watermarks, subtle glows, hairline rules) stay in the element library, previewed on a ground that shows translucency and tagged "subtle". Only pieces that draw nothing, or are exact duplicates by `sig`, are dropped. This reverses #482's cut-off at paint strength 0.2, which removed 506 pieces and left Sunset with 7 elements                                         | Ash's brief: every element on every card is usable in the editor                                                                                                                     | Keep the 0.2 cut-off                                            |
| O23 | The library's migrations are now **0060** (template library), **0061** (card templates tenant cascade) and **0062** (library elements). `main` took 0059 for the Selection Hub PlayHQ sync (#484). Their journal timestamps follow main's 0059, so drizzle applies them on databases that already have it. The SQL is idempotent, so the dev stack re-runs them safely. This supersedes the numbers in O3 and E3 | Merge of `main` on 23 Oct 2026                                                                                                                                                       | n/a                                                             |
| O24 | `main`'s new **Email lists** tab (#492) sits in the Studio after Junior cards and before Photo library, where the merge put it. **Ash confirmed on 23 Oct 2026 that Email lists belongs in Social Media Studio**                                                                                                                                                                                                 | Merge of `main` on 23 Oct 2026                                                                                                                                                       | n/a                                                             |

## Decisions from the streams

Each stream lists its decisions in its PR bodies under "Decisions for Ash". They're copied here as
the PRs merge.

| #   | Stream | PR   | Decision                                                                                                                              | Why                                                                                                                                                                                                         | To reverse                                     |
| --- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| S1  | 2      | #418 | The AI designer uses shape (c): no structured-output schema. The format rules go in the prompt, and `validate.ts` drives the retries  | Opus 5.5 rejected all 104 schema variants ("compiled grammar is too large"). Shape (c) was valid 9/10 first try and 10/10 within two retries, at about US$0.50 a generation. Spend was US$6.83 of the US$20 | Revisit if a later model takes larger grammars |
| A1  | 1      | #417 | Format v2's empty-token drop rule applies to v2 documents only. v1 layers keep their old rule                                         | Keeps the pilot's stored documents byte-identical                                                                                                                                                           | Opt v1 in later, after a visual check          |
| A2  | 1      | #417 | `palettes` is an array, so one document can use several derived palettes                                                              | Club Kit and Duotone palettes together                                                                                                                                                                      | n/a                                            |
| A3  | 1      | #417 | `showWhen.field` names a page token (e.g. `roundLabel`), not an ADR-010 content key                                                   | Matches `data-drop-if-field`, which the converter maps from                                                                                                                                                 | Add content-key support later; it's additive   |
| A4  | 1      | #417 | Release 1 motion loops are `pulse` and `shine` only. Glow stays a static `textShadow`                                                 | Architect §7. More presets can be added later                                                                                                                                                               | n/a                                            |
| A5  | 1      | #417 | Child layers keep artboard-percent geometry inside groups                                                                             | Grouping and ungrouping never moves a layer                                                                                                                                                                 | n/a                                            |
| A6  | 1      | #417 | `fill` wins over v1's `background` when a style sets both                                                                             | One clear precedence                                                                                                                                                                                        | n/a                                            |
| A7  | 1      | #417 | 8 pinned v1 render hashes were re-pinned once, after the main sync                                                                    | #416 added stand-in photos to the preview samples. The L1-A renderer matches all 318                                                                                                                        | n/a                                            |
| S3a | 3      | #458 | `placeholderDocument` is kept, moved to `placeholder.ts`, when the starter TypeScript is deleted                                      | The console's "New template" uses it                                                                                                                                                                        | n/a                                            |
| S3b | 3      | #458 | The proofs route stays and shows only the format proofs. The old starter contact sheet is removed                                     | The starters now live as bundles in the library                                                                                                                                                             | Remove the route if it's no longer wanted      |
| S3c | 3      | #458 | The bundles import guard matches the package specifier `@workspace/template-bundles`, so test helpers can read bundle files from disk | Tests that pinned the starters now read the bundles. v1 render hashes are unchanged                                                                                                                         | n/a                                            |
| F1  | orch.  | #459 | `@opentelemetry/api` is now a direct dependency of the API server                                                                     | The Anthropic SDK imports it, and the build keeps it external, so the bundled API failed to start (found on the dev stack; production would have failed the same way)                                       | n/a                                            |

## Editable elements: decisions from each PR (22 Oct 2026)

Copied from the "Decisions for Ash" section of each merged stream PR (#461–#481), grouped by PR. The plan is `docs/plans/2026-10-22-editable-elements-plan.md`.

#### #461 Element library: table and API (Stream D1)

1. **Reports get their own table** (`library_element_reports`). The plan named reports but no storage for them. It's one row per club and element, with `resolved_at` for the console (D5).
2. **"Insert" is a read** (`GET /elements/{id}`). Inserting copies layers into the card (E2), so the server records no usage. A usage count can come later if the panel wants a "popular" sort.
3. **Club saves are listed at once**, as E1 says. The server refuses anything that isn't a token, slot or library image. D4 adds the client-side stripping: images to placeholders, text to sample text, colours to brand tokens.
4. **Element layers may use any card kind's tokens.** An element can go into any card, and a token the target card lacks is caught when that template is saved.
5. **Extra columns** beyond the plan's list: `signature` (D2's de-duplication), `bundle_hash` (boot sync, as for templates), `created_by_admin_id` and `updated_at`.

#### #462 feat(pack-convert): simple SVGs as native shapes (C1)

| #    | Decision                                                                                   | Why                                                                                                                                             | To reverse                                          |
| ---- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| C1-1 | Existing bundles are changed in place by `nativise-vectors.ts`, not re-converted           | A re-conversion would undo Stream 1's hand polish on Broadcast Dark. C4 re-converts every look later                                            | Re-convert instead (C4 does)                        |
| C1-2 | A circle is a fully rounded box (`radius` 10000). An ellipse is a 32-point clip polygon    | The format has no ellipse. A rounded box is a true circle only in a square box, so an ellipse needs the outline                                 | Add an ellipse shape to the format                  |
| C1-3 | Gold Foil's stripes stay a vector                                                          | The stripes are one path of many separate lines, not one shape. A native version needs a repeating-gradient fill, which the format doesn't have | Add repeating gradients (B1) and redraw the stripes |
| C1-4 | Bundle files that change take the next version, including #454's Weekend Wraps (version 2) | The server ignores a changed file at the same version                                                                                           | n/a                                                 |

🤖 Generated with [Claude Code](https://claude.com/claude-code)

#### #463 Template format: v2 styles the converter dropped (Stream B, B4)

1. **B4 first, out of B1–B4 order.** Stream C's re-run of all seven looks waits on these fields, so B4 shipped first. B1 to B3 (the gradient, clip and shadow editors) follow.
2. **Drop shadows are a style list, not a filter preset.** `filter` is documented for photos and images, but the glows sit on shapes, vectors and text. So `dropShadow` is its own list, like `boxShadow` and `textShadow`, and works on any layer.
3. **Skew is a style, not geometry.** Per-size geometry is Stream C's. Skew is the same on every size, so it sits with the style and composes after the layer's rotation.
4. **Side borders extend `border`.** An optional `sides` list on the existing border, absent meaning all four. The alternative was a separate field per side; that was rejected, so one border keeps one width, colour and style.
5. **A glow on a clipped layer that also blurs its backdrop** isn't supported well. The wrapper's filter would blur an empty backdrop. No pack does this; I left it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

#### #464 Editable elements A1: Layers drawer supports vector and group layers

- Vectors are labelled **"Graphic"** in Layers, not "Vector", since that's the word a club admin would use. Groups are "Group".

#### #465 feat(templates): link per-size copies, sign every layer's design (C2)

| #    | Decision                                                                                                    | Why                                                                                                                                      | To reverse                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| C2-1 | Per-size copies are linked, not merged into one layer with per-size styles                                  | 98% of copies differ in style. Per-size styles would need renderer and editor changes from Streams A and B, while links change no render | Add per-size style to the format and renderer, then merge linked copies |
| C2-2 | `sig` is a design hash (`layerSignature`), not the converter's internal signature                           | The converter's shape signatures are colour-only, so they would merge different decorations of the same colour                           | n/a                                                                     |
| C2-3 | Every v2 bundle is signed now (each file takes the next version). Links come with the converter re-run (C4) | Stream D can start on today's bundles. Recovering copies from finished documents would be guesswork                                      | n/a                                                                     |

🤖 Generated with [Claude Code](https://claude.com/claude-code)

#### #466 Studio editor: gradient editor for fills and text fills (Stream B, B1)

1. **No gradient preview strip in the panel.** The panel sits outside the card, so the club's colour tokens don't resolve there. The canvas shows every edit live instead.
2. **Stops keep the order they're in.** A stop moved past its neighbour is drawn where CSS puts it (no further than the stop before it); the editor doesn't re-sort. Re-sorting would make the stop being typed into jump.
3. **Quick angles are down, across and the two diagonals.** Any other angle is typed, 0–360.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

#### #467 Element library: extract every look's decorations (Stream D2)

1. **De-duplication ignores colour within a look.** A gold, chalk and panel copy of the same slash is one element, since every club recolours it. Across looks, colour still separates two looks' versions.
2. **The extractor keeps its own signature, not C2's `sig`.** `sig` is exact per size and per colour: de-duplicating by it gives 506 distinct decorations against 134, so nearly every per-size copy would be its own element. `sig` and `link` are left out of element layers, and insertion (D3) gives fresh ids. The output is re-extracted from the bundles after C1 and C2 (Broadcast Dark's slashes are native shapes now).
3. **At most 16 elements per look and category** keeps the panel browsable. Club Kit's 11 fades are under the cap; the cap only bites on looks with many near-identical badges.
4. **Bundle elements that leave the files are deleted** (with any reports of them), not unlisted. Nothing references them, unlike library templates, which club copies point at.
5. **Re-running after Stream C4 is a manual step:** run the script, Prettier and the index generator. There's no drift test, so Stream C's PRs aren't blocked on it.

#### #468 Editable elements A2: edit inside groups and stacks, nested Layers tree

- **Adding an element while inside a group puts it on the page**, not in the group, and leaves the group. Paste while inside a group pastes into that group (like Canva).
- **Stack children can't be dragged** (only resized). Dragging one would change a position the stack ignores.
- **Clicking empty canvas leaves the group** as well as clearing the selection.
- The Layers tree selects, opens, hides and locks; it has no drag-to-reorder yet (stack order is set in the Layer panel).

#### #469 feat(templates): the starters' Club Kit elements as native layers (C3)

| #    | Decision                                                                                                                              | Why                                                                                                                                                | To reverse                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| C3-1 | Elements are captured in the browser and mapped by the converter, not rewritten by hand                                               | It reproduces the parts as drawn (99.9% pixel match). The same tool can make native versions of all 29 `ck.*` elements for the Elements panel (D3) | n/a                                                                                                              |
| C3-2 | Every starter template becomes format v2, and the original v1 documents are frozen as test fixtures                                   | Native layers need v2. The v1 render hashes still pin how stored v1 documents draw                                                                 | n/a                                                                                                              |
| C3-3 | The background glow uses v2's radial gradient, which has no size, so it spreads a little further than `ellipse 80% 60%`               | The format has no radial size                                                                                                                      | Add a size to radial gradients (Stream B) and re-split                                                           |
| C3-4 | **A club with no crest loses the monogram stand-in on these starters**: the crest and watermark are now the `{{clubLogo}}` image only | v2 has no "show when a field is empty", so the monogram can't sit behind the crest safely. A transparent crest would show it through               | Add an empty-field condition (e.g. `showWhen: { missing: "clubLogo" }`) and re-split. I suggest Stream B adds it |
| C3-5 | Sponsor's art panel shows the sponsor's art                                                                                           | It's what the white panel is for. The v1 renderer left `{{sponsorArt}}` empty                                                                      | n/a                                                                                                              |

🤖 Generated with [Claude Code](https://claude.com/claude-code)

#### #470 Element library: data-driven Elements panel, native inserts (Stream D3)

1. **Inserting copies the element's layers in place:** a band lands where the look had it. Moving it is a drag, and a group's children follow once A2 lands.
2. **The template editor keeps its rule** that added layers go on the size being edited, with the "add to other sizes" prompt. The element's other designed sizes aren't applied automatically there; in the Studio editor (one size) they ride along unused.
3. **Tiles are drawn live** (no stored thumbnails), so they always show the club's own colours. `thumbnail_url` stays unused for now.
4. **The Club Kit pieces stay until C3**, so nothing is lost while their native versions don't exist yet.

#### #471 Studio editor: clip editor with presets and draggable points (Stream B, B2)

1. **The points are dragged on a pad in the panel, not on the canvas.** Canvas handles are Stream A's area (`canvas.tsx`). The pad shows the box with a 10 % margin, so points just outside can be reached. Typing covers −100–200 %.
2. **Four presets**, from what the looks use: slash (Broadcast), chevron, angled band (Club Kit's bands) and cut corner.
   - Each leans one way; Flip gives the other.
   - Amount 0 is the box itself, so it reads as Custom.
3. **A preset edited point by point becomes Custom**, keeping its points. Picking the preset again resets them to the preset's amount.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

#### #472 Studio editor: shadow lists and effect controls (Stream B, B3)

1. **B4's fields get their controls here.** B3 was shadows and glows, but border sides, the text outline, slant and blur behind had no control. "Every element editable" needs them, so they're in this PR rather than a fifth slice.
2. **"Shape shadow" is the name for drop shadows.** It says what it follows. "Drop shadow" reads like the box shadow every editor has.
3. **New shadows start as a soft drop shadow or a glow in the club's colour**, not empty, so adding one shows something straight away.
4. **Slant has no handle on the canvas.** Like the clip pad, canvas handles are Stream A's area. Slant is typed in degrees.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

#### #473 Editable elements A3: a list's row cells and backdrops are selectable layers

- **The row template is edited on the first row**, wherever you double-click. The selection jumps to row one rather than staying on the row you clicked.
- **A cell's place is a share of the row and is the same on every size.** Deleting a cell deletes it from the row on every size (in a template, deleting an ordinary layer only takes it off the current size).
- **Cells have no eye or lock** in the Layers tree: they show and lock with their list.
- **Row variants** (the club's own ladder row) keep their per-field overrides. Recolouring a cell changes the base style, and a variant's override still wins on its rows.
- Pasting a copied page layer into a list is skipped by the existing field check; to add a cell, duplicate one (Ctrl+D) and change its field in the rows panel.

#### #474 Element library: Save as element, published to every club (Stream D4)

1. **Text with no live field becomes "Text"**, not kept. A club's slogans and sponsor names shouldn't travel. Text with a field keeps its words, with the club's name swapped for `{{clubName}}`.
2. **A non-crest picture becomes the photo slot**, not a removed layer, so the element keeps its shape (say, a framed photo).
3. **Only the club's accent, panel and ink are mapped** to brand tokens: exact colour matches only. Other colours stay as they are.
4. **Saving isn't offered in the platform console** for now. Ovation's own elements come from the bundles; a console "save as element" can come with D5 if wanted.
5. **Taking an element out of the library is one click**, with no confirm. Cards it was added to keep their copies. Re-listing would need Ovation, through D5's console.

#### #475 Editable elements A4: copy, paste, resize and linked copies for nested layers

- **What linked copies share**: everything except the box, sizes, font size, corner radius, clip, photo framing, list rows, hidden, locked and grouping. So a colour or text change goes to every size; a font-size change stays on the size it was made on, since each size sets its own.
- **Hide and lock stay per copy**, so a piece can be hidden on one size only.
- Deleting a linked copy asks after the delete (like "Add to other sizes?"), rather than before.

#### #476 Element library: console moderation, unlist and reports (Stream D5)

1. **Unlisting resolves the element's open reports.** Dismissing resolves them without unlisting. A club that reports again opens a new one (D1 keeps one report per club and element, reopened).
2. **"List again" undoes either unlisting**, the author club's or Ovation's. That's the console's way to restore something a club took out by mistake.
3. **The console shows no previews.** It has no club identity to draw them in; the Elements panel draws each element in the viewing club's colours. A preview with sample colours can follow if wanted.
4. **No email to the author club** when Ovation unlists its element. The panel's "Your club's elements" view shows it as unlisted.

#### #477 Fix: day pages crash the library previews (Gold Foil Match Summary)

#### #478 feat(templates): B4 styles, seven looks re-converted or transplanted, links (C4)

| #    | Decision                                                                                                     | Why                                                                                                       | To reverse                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| C4-1 | The hand-polished looks aren't re-converted. Their links, skews and sigs are transplanted by matching layers | A re-conversion would lose Stream 1's hand polish                                                         | Re-convert them and redo the polish                          |
| C4-2 | A transplanted link joins only copies on different sizes. Unmatched layers (40, 50 and 24) keep no link      | An edit must never spread to a layer that isn't a copy                                                    | n/a                                                          |
| C4-3 | Text the worst case wraps keeps the pack's size, wraps to two lines, then ends in "…"                        | It passes the fit check and still matches the pack's wrapping. A shrinking fit draws fewer, smaller lines | Return to no fit (worst-case titles then fail the fit check) |
| C4-4 | Broadcast Dark's slashes are native skews (C1 had made them clip polygons)                                   | Editable as an angle; same render (96% before and after)                                                  | Keep the clips                                               |

🤖 Generated with [Claude Code](https://claude.com/claude-code)

#### #479 Studio editor: name the shadow lists, box each shadow and stop (Stream B browser check)

1. **The clip pad stays square**, whatever the layer's shape. A 9:1 band would make a 9:1 pad too thin to drag points on, so the pad shows the box stretched to a square. The points' numbers are in percent of the layer's box either way.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

#### #480 fix(template-library): retry fit checks that couldn't run at boot (Bold Type listed nothing)

| #   | Decision                                                                                 | Why                                                                                      | To reverse                 |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------- |
| F-1 | Retry in the fit runner (30 s, 60 s, 120 s), not a change to the dev stack's start order | Covers any harness hiccup, in production too, where the next sweep could be an hour away | Set `FIT_RUN_RETRIES` to 0 |

🤖 Generated with [Claude Code](https://claude.com/claude-code)

#### #481 Element library: the 29 Club Kit pieces native; re-extracted after C4

1. **The registry stays as a read-only fallback**, not deleted. Existing drafts and templates with `kind: "element"` layers keep drawing exactly as before. No migration rewrites stored cards.
2. **The pieces' text is the panel's sample text**, drawn on a Century card, so a piece's fields come through as tokens where the card has them (club name, hashtag, sponsor line) and as editable sample text otherwise (score bars, leader rows).
3. **The trading card's 96.2% match** is the lowest. The difference is its photo's edge treatment, and it's an editable starting point, not a fixed render.
4. **The 4 duplicates go uncredited to Club Kit**: they stay in Club Kit Classic, where the extraction found them first.

## Waiting on Ash

- Sign-off on each of the seven looks (Club Kit, Broadcast Dark, Duotone, Gold Foil, Bold Type, Neon Night, Sunset). Each one's `report.md` says "pending Ash sign-off"
- Milestones M1–M5 on the local dev stack, then the final pass and the merge of #411
- Production steps at release (EM plan, "Migration 0058 and the release"): main's 0058 and 0059 run with their own releases, and the library's 0060, 0061 and 0062 run by hand right before the library republish
