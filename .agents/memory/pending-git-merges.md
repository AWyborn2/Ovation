---
name: Pending Git merges and checkpoints
description: Why a no-commit pull does not reliably preserve a no-Git-commit constraint in this workspace.
---

When Git commits are forbidden, use fast-forward-only pulls. If branches diverge, stop and ask rather than leaving a pending merge with `git pull --no-commit`.

**Why:** A no-commit pull explicitly reported that it stopped before committing, but a subsequent inspection showed a completed merge commit without an agent-issued commit command. Replit documents automatic checkpoints as Git-backed; pending merges are therefore not a reliable no-commit boundary here.

**How to apply:** Require explicit permission for a merge commit or a separately scoped checkout when fast-forwarding is impossible. Do not automatically undo an unexpected commit, especially after authorized database writes.