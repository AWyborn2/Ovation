---
name: Public honour-boards tab guards
description: Adding a non-leaderboard tab to the public honour-boards page requires updating several scattered guard conditions.
---

The public honour-boards page (`artifacts/cricket-club/src/pages/honour-boards.tsx`) drives all tabs from a single `activeTab` state union (`BoardKey | ExtraTab`). Leaderboard tabs come from `BOARDS`; "extra" tabs (caps, life-members, awards, search) are hand-wired.

**Rule:** When adding a new non-leaderboard tab, you must update EVERY `activeTab !== "..."` guard, not just add a button + content branch. There are 3 separate guards that hide leaderboard-only chrome (season-selector/milestones block, the scope control, and they each list each extra tab explicitly). Miss one and the new tab shows stray "Scope" or "Significant milestones" UI.

**Why:** the guards are negative-list (`!== "search" && !== "caps" && ...`) rather than a positive `isLeaderboardTab` helper, so a new extra tab is treated as a leaderboard tab by any guard you forget.

**How to apply:** grep `activeTab !==` in that file and add the new tab to each; add the tab to the `ExtraTab` union; add a button in the tab bar; add a content branch in the ternary chain. Mobile (`artifacts/cricket-mobile`) has no such tab system — it uses a separate route screen under `app/honours/`.
