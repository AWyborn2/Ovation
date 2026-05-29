---
name: Social milestone engine gating
description: Why milestone cards may appear to do nothing after a CSV import, and how milestone events get marked posted/dismissed.
---

The "Auto-milestone" social engine detects honour-board tier crossings after a
PlayCricket CSV import and queues social-card drafts.

**Gating:** detection in the import commit flow is gated on
`socialSettings.engineMilestone`, which **defaults OFF**. After an import, nothing
appears in the social queue until an admin enables the toggle on the Social cards
settings page. This is intentional, not a bug.

**Mark posted/dismissed:** `milestone_events.postedAt` / `dismissedAt` are NOT set
directly. They are stamped as a side effect of the social-draft lifecycle: when a
draft carrying a `milestoneEventId` is marked posted (`/social-drafts/:id/posted`)
or dismissed (`/social-drafts/:id/dismiss`), the handler also updates the linked
milestone event.

**Why:** keeps a single source of truth for "has this moment been shared" — the
draft drives the event, so the queue UI never has to touch milestone_events.

**How to apply:** if a new path needs to mark a milestone shared, route it through
the draft endpoints (or replicate the linked-event update) rather than writing
milestone_events alone.
