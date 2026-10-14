---
name: Availability testing requirement
description: Why manual availability requests must remain repeatable.
---

The user requires repeatable manual availability request sends: “I need to be able to test that it works so I need unlimited send requests.”

**Why:** The user needs to test delivery repeatedly rather than being blocked after the first manual send.

**How to apply:** Do not reintroduce a once-per-round restriction on manual request sends. Distinguish intentional manual repeats from automated duplicate sends, and warn that repeated manual sends can notify the same recipients again.
