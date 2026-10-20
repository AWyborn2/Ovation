# Email distribution lists (team sheets + social assets)

Status: APPROVED by Ash 2026-10-20. P0/P1.

## Problem

Today a club official has to export each team sheet, then print it and hand it out (or forward it)
to every team's contact. Approved social cards have to be downloaded by hand and passed to whoever
runs the club's socials. Both are repetitive weekly chores that the app could do for them.

## Target users

- **Team contacts**: one or more per team (captain, manager, team rep). They get the team sheet as a
  printable PDF.
- **Social media managers**: a separate club-level list. They get approved or ready social assets
  and milestone alerts.
- **Club admin**: sets up the lists and their settings once, then stops exporting by hand.

## What exists (verified in code, 20 Oct 2026)

- Resend transport `api-server/src/lib/integrations/email.ts`: plain text, a single `to`, no
  attachments. It is best-effort and never blocks the state change it reports.
- `draft-notifications.ts`: an in-app notification plus an email to the one
  `social_settings.notificationEmail` address when drafts become Ready.
- Team lists publish (admin- or PlayHQ-sourced), and social drafts go through
  awaiting_review → ready (approve).
- Availability contacts already store email addresses, but they belong to players, not teams.

## Recommendation (scope B)

Named **email lists**, each with a type and its own settings:

1. **Team sheet list** (per team; a contact can belong to several teams)
   - Members: name and email.
   - Send mode setting: `on_publish` (auto) | `manual` (Send button) | `scheduled` (day and time,
     sends whatever is published by then) | `off`.
   - Re-send on change: if a published list is edited, send an "UPDATED" copy (on/off).
   - Contents: a printable PDF of the team sheet attached, plus the key details in the body
     (fixture, venue, time, side).
2. **Social media list** (club-level)
   - Members: name and email.
   - Toggles: `asset_ready` (each time a draft is marked Ready: image attached, caption in the body)
     · `review_needed` (a draft awaits review, with a link to it) · `milestone` (a milestone has
     been achieved and a post was drafted). Each one can be switched on or off.
   - Replaces or absorbs the single `notificationEmail`, which migrates in as the first member.
3. **Send log** per email (list, recipient, kind, sent or failed, when), shown in Admin so an admin
   can see that it went out, plus a manual "Resend" button.

## User stories

- As a club admin, I want to create a team-sheet list per team with its own send mode, so team
  sheets reach the right people without my exporting and printing them.
- As a team contact, I want a printable PDF in my inbox when my side is published, so I can print
  and hand it out.
- As a social media manager, I want each ready card emailed to me with its caption, so I can post it
  without logging in.
- As a social media manager, I want an alert when a milestone post is waiting for review, so it goes
  out while it's still timely.
- As a club admin, I want to switch each email type on or off, so nobody gets mail they don't want.

## Prioritisation

- P0: email transport upgrade (multiple recipients, attachments); team-sheet lists with
  `on_publish`/`manual`/`off`; PDF attachment; send log.
- P1: social list with the asset_ready, review_needed and milestone toggles (migrating
  `notificationEmail`); `scheduled` send mode; the "UPDATED" re-send.
- P2: one-click unsubscribe link per recipient; per-member choice of which teams or kinds they
  get.
- P3 (won't do now): emailing players directly (that's availability messaging's job), SMS or
  WhatsApp delivery, a daily digest.

## Success criteria

- At least 80% of a pilot club's published team sheets are delivered by email over 4 weeks (from the
  send log), with no manual exports for those teams.
- Fewer than 2% of sends fail (from the send log).
- The social list is on for at least one pilot club, and its managers post ready cards with no admin
  download step (ask the club).

## Out of scope

Player-facing email, marketing or bulk newsletters, inbound replies, and a self-serve contact
signup form.

## Risks

- **Deliverability and spam**: `EMAIL_FROM` needs a verified domain (SPF/DKIM). Attachments raise
  spam scores. Check with a pilot before rollout.
- **PII**: contact emails are personal data, so they must be tenant-scoped and visible to admins
  only. Never log addresses in plain text.
- **PDF rendering server-side**: the team sheet is rendered in the browser today. The server needs
  a headless render or a server PDF builder. This is the biggest technical unknown, and the
  Architect should spike it first.
- **Duplicate sends** when a list is re-published several times. Use an idempotency key of team
  list + version.
- **Juniors isolation**: junior team lists, if added later, use their own junior-scoped lists.
- **Data governance**: club-internal email of its own team sheets and cards is not
  commercialisation (consistent with the 6 Oct 2026 Meta decision).
