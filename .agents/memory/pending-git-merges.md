---
name: Pending Git merges and checkpoints
description: Why a no-commit pull does not reliably preserve a no-Git-commit constraint in this workspace.
---

When Git commits are forbidden, use fast-forward-only pulls. If branches diverge, stop and ask rather than leaving a pending merge with `git pull --no-commit`.

**Why:** A no-commit pull explicitly reported that it stopped before committing, but a subsequent inspection showed a completed merge commit without an agent-issued commit command. Replit documents automatic checkpoints as Git-backed; pending merges are therefore not a reliable no-commit boundary here.

**How to apply:** Require explicit permission for a merge commit or a separately scoped checkout when fast-forwarding is impossible. Do not automatically undo an unexpected commit, especially after authorized database writes.

When this branch has selectively imported upstream features, prefer a normal merge for an authorized full integration rather than rebasing the entire local history.

**Why:** Replaying earlier local implementations onto upstream's already-integrated versions produced extensive add/add conflicts in generated clients, email features and schema history. A normal merge combined the final branch states without those replay conflicts.

**How to apply:** Inspect the current Git operation before acting, preserve both final branch states, and validate the merged result. Do not pull with rebase by default on this shared branch.