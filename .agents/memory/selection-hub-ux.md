---
name: Selection Hub usability requirements
description: User-required grade ordering, full-height pool, collapsible navigation and comparison access.
---

Selection Hub teams must always follow the Grade order menu. The player-pool container should match the height of all listed teams. Provide a side-menu collapse button to expand selection space, and let captains or selectors access player statistics and performance comparison.

**Why:** The user explicitly requested these four Selection Hub UI/UX behaviours.

**How to apply:** Use the club's configured order rather than a separate selection-specific order. Preserve selection work and existing role permissions when expanding the workspace or opening comparisons.

Keep comparison separate from the live selection board rather than navigating that board away.

**Why:** Selection can be mid-save and staff may have an open player dialog or a chosen junior section. Reusing the existing comparison in another tab preserves that context without duplicating the comparison engine or widening permissions.

**How to apply:** Future comparison shortcuts must preserve the original board and use linked statistics identities, not squad identities. Junior comparison needs its own privacy-aware implementation; do not silently substitute senior profiles.
