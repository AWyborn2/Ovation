---
name: Junior social cards (admin downloads)
description: How junior milestone + match-summary share cards are generated, branded brown, and kept private/isolated.
---

Admin junior social downloads live at `/admin/social/juniors` (page `admin-junior-social.tsx`): tab 1 picks a junior match → junior matchSummary card; tab 2 lists career milestones → junior milestone card. Both reuse the senior `ShareCardModal`.

**Brown branding override (deliberately contradicts replit.md's "juniors web UI now uses gold").** Share cards are the ONE junior surface that uses brown chrome, not gold. `ShareCardInput` `milestone` + `matchSummary` variants carry `junior?: boolean`; when set, `renderShareCard` forces `resolvePalette(JUNIOR_THEME)` (brown `#42342B` bg + gold `#FBAC27` accent) regardless of the admin-selected theme, the matchSummary eyebrow becomes "JUNIOR MATCH", milestone headline "Junior Cricket Milestone", and `cardBaseFilename` gets a `junior-` prefix. The match-summary builder also forces the HH team chrome to brown+gold so innings header bars read junior.
**Why:** junior cards must be visually distinguishable from senior content at a glance; the gold-only web UI rule does not extend to downloadable cards.
**How to apply:** any new junior card kind needs `junior?: boolean` added to its `ShareCardInput` variant + the same three render switches. The modal (`share-card-modal.tsx`) hides the theme + custom-template selectors and forces `selectedTheme=undefined`/`selectedTemplate=null` when `isJunior` (detected via `"junior" in input`), so admins can't override the locked palette.

**Privacy + isolation.** Backend `GET /api/juniors/social-milestones` (route in `juniors.ts`) aggregates career runs/wickets/games per HH participant via the same `is_private=false` inner-join-on-participants pattern as the leaderboard — so opposition (no participant row) AND the 6 private juniors drop out in one move. It emits one row per (participant, stat) for the HIGHEST crossed threshold, sorted most-impressive-first. The match-summary builder (`junior-match-summary.ts`) additionally drops any line whose name is the masked `"Private Player"` from the featured top-performer lists (innings totals still come from the scorecard so they stay correct). No junior query touches a senior table.
