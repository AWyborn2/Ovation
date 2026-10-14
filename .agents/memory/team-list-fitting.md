---
name: Team Selection fitting boundaries
description: Scope and preview/export invariants for full names on built-in Team Selection cards.
---

Keep full-name fitting scoped to built-in Team List designs, not user-authored templates, independent Starting XI designs or inserted Studio elements. Broadcast has a separately requested single-column, initial-and-surname layout; other packs retain their existing name presentation.

**Why:** The user explicitly excluded automatic custom-template changes. Studio reuses the row helper but has independently authored element boxes.

**How to apply:** Preserve the opt-in boundary when extending shared parts. Use only a genuine supplied first-name initial for Broadcast; never guess initials from surname-only saved inputs or change other packs' names.

Broadcast Team List cards, including carousel team slides, must show the actual fixture round in the small gold eyebrow above the grade heading, with grade and venue/date/time at the top and the players in one vertical column.

**Why:** The user explicitly requested this layout instead of the centre-positioned two-column list and repeated grade eyebrow.

**How to apply:** Use each team's fixture, not a shared weekend round counter. Keep registered numbers and captain/keeper markers. Older saved inputs without initials need regeneration from the approved selection; export must not silently refresh frozen sources.

Keep measured card DOM stable across React preview-scale changes, and wait for intended fonts in the export harness.

**Why:** A responsive rerender silently replaced imperative line breaks even though the source HTML had not changed. Native exports alone passed; the carousel preview exposed the mismatch.

**How to apply:** Include a real resized-preview check alongside native exported-pixel comparisons whenever changing post-mount typography.

Restore the row's measuring layout before each repeated fit, not just its text.

**Why:** Preview and export can both prepare the same DOM. Removing a flex declaration instead of restoring it leaves names measured at their content width, causing unnecessary shrinking on the second pass.

**How to apply:** Test repeated preparation with short names and roles, and verify that short lineups retain their original font size.
