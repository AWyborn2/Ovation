---
name: Development host smoke tests
description: Avoid misleading browser failures when platform and club pages select different routing modes by development hostname.
---

The public development hostname and the loopback preview can select different platform/tenant modes. Confirm the mode before browser smoke tests; do not assume they render the same route tree.

**Why:** During development cutover verification, the public development host served the platform while loopback served the Halls Head club. A club leaderboard on the platform host and a platform sign-in on the club host each timed out despite healthy APIs.

**How to apply:** Check the brand mode on the intended development host first. Use the development tenant header for club-specific checks and a platform-mode development host for platform-admin checks. Do not change secrets or routing settings just to make a test find its form.