---
name: Environment-triggered workflow restarts
description: Avoiding port collisions after environment settings change.
---

Environment-setting changes can automatically restart all artifact workflows. Do not immediately race those restarts with additional manual restarts.

**Why:** A development-only mobile setting triggered automatic restarts; overlapping manual restarts left duplicate listeners and failed API/web workflows while Expo waited for a different port.

**How to apply:** Check the workflow state after changing settings. If duplicate listeners remain, stop the affected managed workflows, identify and terminate only their orphaned processes, then start each managed workflow once. Do not fix this by changing artifact ports or creating replacement workflows.
