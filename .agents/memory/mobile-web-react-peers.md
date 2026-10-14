---
name: Mobile and web React peer contexts
description: Why native SDK upgrades must not silently change the website's React or shared query context.
---

Keep mobile and web React peer contexts independent rather than forcing the whole workspace onto Expo's React version. Within each app, its QueryClientProvider and shared API hooks must use the same React Query instance.

**Why:** The native SDK upgrade required a newer React while the existing website stayed on its previous version. pnpm rebound the shared API client's peers to the newer React, creating different query instances for the website's provider and hooks even though their React Query versions matched.

**How to apply:** Preserve consumer-specific peer resolution for the shared mobile client and web bundler deduplication of React Query. Do not remove either just because package versions appear identical. Re-sync injected workspace dependencies after regenerating shared client source, and verify both consumers when changing shared dependency resolution.
