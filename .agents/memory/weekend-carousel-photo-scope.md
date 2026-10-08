---
name: Weekend carousel photo scope
description: User-required structure, review flow and photo eligibility for weekend match-day carousels.
---

Weekend match-day carousels from Social Studio must have a title page, cards for the teams playing that weekend, and a sponsors page at the end. Team-card photos must come from that grade's photos and only batting, bowling or fielding categories.

**Why:** The user explicitly requested this structure and restricted photo selection, rather than unrestricted grade-library selection.

**How to apply:** Keep this restriction specific to the weekend carousel. Do not use broader photo-rule fallback behaviour to select another category or grade.

The cover/title page has a separate requested photo rule: let the admin choose any photo tagged 2026 from Club-wide. This does not broaden team-card eligibility.

**Why:** The user explicitly requested a selectable cover photo from 2026 Club-wide photos.

**How to apply:** Use the library's existing Season tag and Club-wide folder, allow all photo categories for the cover, and retain tenant isolation and privacy restrictions.

Weekend carousel sponsor placement must follow the user's requested roles: one team sponsor on each team's match card, the designated “Presented by” sponsor on the title card, and all sponsors without a team assignment on the final page.

**Why:** The user repeated this requirement after the cover-photo work; generic match-day sponsor filtering does not express the intended placements.

**How to apply:** Keep these carousel-specific roles separate from standalone card rules. Do not fill a missing team assignment with another team's sponsor. “All unassigned” includes the presenting sponsor if it has no team assignment; retain the active-sponsor and sponsors-enabled controls.

The primary action sends the whole carousel to the Social review queue with a match-day caption, rather than immediately exporting it. Preserve the selected photos, crops, sponsor roles and slide order as one review item.

**Why:** The user requested review with a match-day caption instead of exporting the carousel.

**How to apply:** Save the reviewed composition, not instructions to randomly select photos again later. Do not automatically publish a newly submitted carousel.
