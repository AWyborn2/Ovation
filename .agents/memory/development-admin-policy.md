---
name: Development admin access
description: User-selected admin access policy for development, separate from production.
---

Development should allow platform admins only to administer all clubs; club-admin credentials are not the development entry point.

**Why:** The user selected “Platform admin only” after reporting that production credentials were not working in development.

**How to apply:** Keep this policy development-only. Production retains separate platform and tenant-admin access. In development, the configured platform credentials should be usable even when an older saved account password differs; never apply that credential reconciliation to production.
