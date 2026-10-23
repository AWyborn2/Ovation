---
name: SQL Console transaction safety
description: Preserving rollback-only previews when the Replit SQL Console rejects explicit transaction commands.
---

The user's SQL Console rejects explicit transaction control and asks for multiple
statements to be selected and run as an automatically wrapped batch.

**Why:** This was observed directly, despite a documentation search returning
guidance suggesting explicit BEGIN/COMMIT was supported. The console's actual
behavior takes precedence.

**How to apply:** Do not tell the user to remove BEGIN/ROLLBACK alone from a
preview: a successful batch could then commit. A rollback-only PL/pgSQL rehearsal
can validate the result and deliberately raise a clearly labelled exception
inside the same repair block, rolling back its writes even when run independently.
Explain that the intentional success-labelled error means nothing was saved.
Permanent application is a separate, deliberate step.

A console error is not proof that other selected statements did not commit.
After transaction-control or standalone-lock errors, inspect the target records
before recommending a retry; the repair block may already have succeeded.
For future paste-ready repairs, put settings, locks, guards and writes inside
one DO statement rather than depending on console batch wrapping.
