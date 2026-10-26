---
name: Email history retention and isolated migration snapshots
description: Preserve non-identifying send history and avoid snapshot filename collisions after the isolated email import.
---

Keep delivery status/count history independent of contact-list lifetime; deleting contacts must not require keeping recipient addresses or copied contact names in the log.

**Why:** The delivery audit must survive list retirement without extending the lifetime of recipient information.

**How to apply:** Preserve terminal send outcomes when a list disappears; pending work can be skipped but must not reconstruct recipients.

A null list reference is not sufficient to classify a send as deleted: combined team-sheet batches intentionally have no single list.

**Why:** Combined and scheduled team-sheet emails span lists; treating every listless record as deleted disables their resends and failed-delivery retries.

**How to apply:** Use the send kind to distinguish intentional batches from detached historical sends in history labels, retry selection, resend authorization, and UI controls.

New migration snapshot filenames must sort after the isolated import's snapshot, even when the next journal index is lower.

**Why:** Drizzle's generator selects its baseline by snapshot filename, not journal order. A lower-numbered new snapshot causes regeneration of the same change and can overwrite the isolated snapshot.

**How to apply:** Keep the applied isolated migration and snapshot untouched; use a higher filename and increasing journal timestamp for subsequent changes, then confirm schema generation reports no changes.
