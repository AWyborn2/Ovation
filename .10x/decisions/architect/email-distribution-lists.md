# Architecture: email distribution lists

Status: PROPOSED 2026-10-20 (Principal Architect). Requirements:
`.10x/decisions/product-manager/email-distribution-lists.md` (approved 20 Oct 2026).

## Spike result: server-side team-sheet PDF is already built

No new rendering work is needed. `api-server/src/lib/team-sheet.ts` (`loadTeamSheetPreview`,
`buildTeamSheet`) together with `renderHtmlToPdf` in `lib/card-video-renderer.ts` (puppeteer-core)
already serves `printTeamSheet` (`routes/selection.ts`, around line 182). Emailing a sheet means
calling the same builder without an HTTP request. The overs value comes from the per-grade
remembered value (`normaliseOvers` / preview), never from user input.

**Social card PNGs** (Ash chose "attach PNG", 20 Oct 2026): render them server-side through the same
puppeteer harness (`/__card-render`) that card videos use. The catch is that background jobs have
no request origin, so `harnessUrl()` falls back to `localhost:80`, and in the autoscale deployment
nothing listens there. **`RENDER_HARNESS_URL` (or `RENDER_HARNESS_ORIGIN`) must be set in
production.** If rendering fails, the email is sent anyway, with a link to the queue instead of the
image.

## Options considered

|                            | A. Inline send in the request      | **B. Postgres outbox + drain (recommended)** | C. External queue/worker                        |
| -------------------------- | ---------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| Retries                    | none                               | yes (attempts, backoff on the hourly sweep)  | yes                                             |
| Scheduled mode             | impossible                         | hourly sweep picks up due lists              | yes                                             |
| Idempotency                | hard                               | unique key per send                          | yes                                             |
| New infra                  | none                               | none                                         | Redis/worker: rejected (no distributed problem) |
| Blocks the admin's request | PDF + Chromium in the request path | no (fire-and-forget drain after commit)      | no                                              |

B fits the existing patterns: notifications are written first and email is a best-effort echo
(KTD5), and the hourly `POST /api/internal/playhq/sweep` is already the scheduler.

## Data model (migration `0053_email_lists.sql`, idempotent, tenant-scoped)

- `email_lists`: `id, tenant_id, kind ('team_sheet'|'social'), name, settings jsonb, active, created_at`.
  - team_sheet settings: `{ sendMode: 'on_publish'|'manual'|'scheduled'|'off', schedule?: { dow: 0-6, time: 'HH:MM' } (club local time), resendOnChange: boolean }`
  - social settings: `{ assetReady: boolean, reviewNeeded: boolean, milestone: boolean }`
  - Zod schemas in `lib/api-zod`, validated on write. A CHECK constraint on `kind`.
- `email_list_members`: `id, tenant_id, list_id → email_lists ON DELETE CASCADE, name, email, created_at`;
  unique `(list_id, lower(email))`.
- `email_list_teams` (team_sheet lists only): `list_id, tenant_id, team_key`. This is many-to-many,
  so one contact list can cover several teams. `team_key` = the senior team/grade key the Selection
  Hub resolves a fixture to (Staff Engineer to confirm the exact column). ~~Senior fixtures only~~
  (lifted 20 Oct 2026: junior sides are emailed through separate junior lists; see "As built:
  junior lists" below).
- `email_sends` (outbox and log): `id, tenant_id, list_id, kind ('team_sheet'|'asset_ready'|'review_needed'|'milestone'), subject_type, subject_id, idempotency_key UNIQUE, status ('queued'|'sending'|'sent'|'failed'|'skipped'), attempts, last_error, recipient_count, provider_id, queued_at, sent_at`.
  - Idempotency keys: team sheet `ts:{selectionId}:v{version}`, social `sa:{draftId}:{kind}`.
    Re-publishing an unchanged version does not send a second email.
  - **No email addresses are stored in the log** (PII). The member list is resolved when the
    email is sent. Only `recipient_count` is kept.
- Data migration: each tenant with a `social_settings.notification_email` gets a "Social media"
  list, with that address as its member, `reviewNeeded` on, and the other toggles on. `notifyDraftsReady`
  then emails through the list. The column stays readable for one release, then is retired.

## Components

1. **Transport** (`lib/integrations/email.ts`): `EmailMessage` becomes
   `{ to: string[]; bcc?: string[]; subject; text; html?; attachments?: { filename; content: Buffer; contentType }[] }`.
   Recipients go in **bcc**, so contacts never see each other's addresses, with `to` set to
   `EMAIL_FROM`. The Resend body adds `attachments` (base64). Keep the timeout and the single
   retry. Update the test seam signature. Existing callers wrap `to` in an array.
2. **Enqueue** (`lib/email-outbox.ts`): `enqueueEmail(tx, {...})` does
   `INSERT … ON CONFLICT (idempotency_key) DO NOTHING`. It is called inside the same transaction as
   the state change:
   - Selection finalise/publish (`routes/selection.ts`): for each team_sheet list covering the
     fixture's team with `sendMode = on_publish`. When `resendOnChange` is on, a re-finalise with a
     new version enqueues again, and the subject line gets "UPDATED".
   - Manual: `POST /selections/{id}/email` enqueues for every list covering that team except `off`
     ones. It uses a key with a `:manual:{ts}` suffix, so a repeat click sends again on purpose.
   - Draft → ready (the approve route and the auto-ready path that feeds `notifyDraftsReady`):
     `asset_ready` for social lists with that toggle on.
   - New `awaiting_review` drafts from the sweep: `review_needed`. Milestone/achievement kinds also
     emit `milestone`. Batch these per sweep run so one email lists several drafts.
3. **Dispatcher** (`drainOutbox(tenantId?, limit)`): claims rows with
   `UPDATE … SET status='sending' WHERE status='queued' … FOR UPDATE SKIP LOCKED`, then builds the
   attachment (team sheet → `buildTeamSheet` + `renderHtmlToPdf`; asset → harness PNG), resolves the
   members, sends, and marks the row `sent`/`failed` (with `attempts`). It runs **after commit,
   fire-and-forget** from the enqueuing route, and from the **hourly sweep**. Failed rows with
   `attempts < 3` are retried there. Lists with no members are marked `skipped`.
   - It reuses the one shared Chromium. The concurrency cap per drain is 2 renders.
4. **Scheduled mode**: the hourly sweep finds `scheduled` lists whose `(dow, time)` falls in the
   last hour (in the club's timezone), then enqueues the latest finalised selection per covered
   team for the coming round. The idempotency key stops the same version going twice.
5. **Admin API** (OpenAPI-first, `lib/api-spec/openapi.yaml` → codegen):
   `GET/POST /admin/email-lists`, `PATCH/DELETE /admin/email-lists/{id}`,
   `POST/DELETE /admin/email-lists/{id}/members[/{memberId}]`, `PUT /admin/email-lists/{id}/teams`,
   `GET /admin/email-sends?listId&status` (log), `POST /admin/email-sends/{id}/resend`,
   `POST /selections/{id}/email`. All are admin-auth and tenant-scoped through the tenant-context
   middleware.
6. **Web**: Admin → a "Email lists" page (lists, members, teams, settings, send log). An "Email
   team sheet" button next to `TeamSheetButton`. A status chip on the Selection Hub ("Emailed 3
   contacts 14:02").

## Failure modes

| Failure                                     | Behaviour                                                  | Detection                                     |
| ------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| Resend down / 5xx                           | row `failed`; hourly retry ×3                              | send log shows Failed; Resend button          |
| Email disabled (no key/from)                | rows `skipped` with reason `disabled`                      | log                                           |
| PDF render fails                            | `failed`, retried; never blocks finalise                   | log + logger.warn                             |
| Card PNG render fails (harness unreachable) | send with link fallback, `last_error` noted                | log; smoke-check `RENDER_HARNESS_URL` at boot |
| Double publish / double click               | idempotency key drops duplicates (except manual)           | —                                             |
| Server dies mid-send                        | stale `sending` older than 15 min is requeued by the sweep | —                                             |
| Attachment > 40 MB                          | not realistic (A4 PDF ≈ 100 KB, PNG ≈ 1 MB)                | —                                             |
| Cross-tenant leak                           | every query filters on `tenant_id`; isolation test added   | `email-lists-isolation.test.ts`               |

## Tests (Staff/SDE)

Transport (bcc, attachments, base64); enqueue idempotency; finalise → enqueue only for `on_publish`
lists covering that team; juniors never enqueued; drain marks sent/failed/skipped and retries;
scheduled-window maths in the club timezone; the notificationEmail migration; tenant isolation.

## Rollout

1. Migration SQL goes into the Production SQL runner **before** republishing (see
   `production-migration-drift`).
2. Set `RENDER_HARNESS_URL` in production secrets. Confirm `EMAIL_FROM` is on a verified domain
   (SPF/DKIM).
3. Ship P0 (transport, lists, team-sheet on_publish/manual/off, log), then P1 (social toggles,
   scheduled mode, UPDATED re-send) as a second PR.

## One-way doors

`email_sends` without stored addresses is deliberate. Adding addresses later is easy; removing PII
once it has been logged is not.

## As built: PR1 (20 Oct 2026)

- The tables are as designed, plus `email_sends.payload` (the request origin is captured when the
  row is queued, so the sheet's logo resolves in background sends) and `claimed_at` (to detect stale
  `sending` rows). Migration `0053_email_lists.sql`.
- The admin API replaces a list whole with `PUT /admin/email-lists/{id}` (name, mode, grades,
  members), rather than having separate member endpoints. That is simpler for a list of 50 or
  fewer contacts.
- Enqueue runs inside the finalise transaction (`selection-board.ts`), for senior sides only. The
  drain is kicked after commit and also runs at the end of the hourly `/internal/playhq/sweep`.
- Every re-finalise (new version) re-sends, with "UPDATED:" when that list already received an
  earlier version. The `resendOnChange` toggle is deferred to PR2.
- Without `EMAIL_FROM`, sends are skipped and never sent to a contact in `to`. Contacts are always
  bcc'd.
- The admin page is at Selection Hub → Email lists (`/admin/selection/email-lists`). "Email team
  sheet" sits under "Print team sheet" on finalised senior sides.

## As built: PR2 (20 Oct 2026)

- **Social lists.** `kind: social` lists carry three toggles in `settings`: `assetReady`,
  `reviewNeeded`, `milestone`. They cover no grades (a save drops any). Junior cards are never
  queued or sent (`source_match_is_junior`, or `card_input.junior`).
- **Card ready (`asset_ready`).** This is queued by the approve route
  (`POST /social-drafts/{id}/approve`) and by `notifyDraftsReady` (auto-post promotion), with key
  `sa:{draftId}:asset_ready:l{listId}`, so one card goes to a list once. The drain renders the
  card's PNGs at the club's first enabled size through `renderDraftSlides` (the `/__card-render`
  harness, the same path as layout checks) and attaches them, with the caption in the body. If
  rendering fails (for example, no harness is configured), the email is still sent, with a
  queue link instead, and `last_error` records why while the row stays `sent`.
- **Batches (`review_needed`, `milestone`).** At the end of the hourly
  `/internal/playhq/sweep`, before the drain, `enqueueSocialDigests` queues at most one email of
  each kind per list. It lists the senior drafts made in the last 21 days (and since the list was
  created) that no earlier batch of that kind listed for the list. The draft ids are stored in
  `payload.draftIds`, and a `NOT EXISTS … payload->'draftIds' @> id` check stops a draft being
  listed twice. Milestones means the `milestone` engine or the `achievements` family, while
  awaiting review or ready.
- **Notification address.** Migration `0056_social_email_lists.sql` (data only) gives each club
  with `social_settings.notification_email` a "Social media" list holding that address, with all
  three toggles on. `notifyDraftsReady` now queues `asset_ready` sends instead of emailing the
  address. `notifyClub` (published / failed / reconnect / posts due / cards rolled) bcc's the
  members of the club's active social lists. The column stays readable. The PlayHQ watchdog and
  availability messaging still read it directly (not moved in this PR).
- **Scheduled team sheets.** `sendMode: scheduled` with `schedule: { dow, time }` is in
  Australia/Perth time, a fixed UTC+8 offset. Each hourly sweep runs `enqueueScheduledTeamSheets`.
  A list is due when its latest weekly slot fell within the last hour (`scheduleDueAt`). It then
  gets, for each covered senior grade, the earliest finalised side whose fixture starts between 12
  hours ago and 8 days ahead. The key is the on-publish key `ts:{selectionId}:v{version}:l{listId}`,
  so a version already sent to the list is never repeated. Finalising never sends to a scheduled
  list.
- **`resendOnChange`** (default on): when it is off, a list that has already been sent (or
  queued) any version of a side skips later versions, both on finalise and on a schedule.
  Manual "Email team sheet" sends ignore it.
- The admin page creates both kinds of list. It shows the toggles for social lists, and for
  team-sheet lists a day and time picker (Perth time) and the resend switch. The send log now
  shows `last_error` on sent rows too, which is where the link-fallback note appears.

## As built: junior lists (PR2, decision of 20 Oct 2026)

- `email_lists.section` is `'senior'` or `'junior'` (default `'senior'`, CHECK constraint). It is
  added in `0056_social_email_lists.sql` with `ADD COLUMN IF NOT EXISTS`. It is fixed when a list
  is created, and an update never changes it. Only team-sheet lists can be junior; social lists
  are always `senior` (club-level).
- A junior list keeps junior team labels in `email_list_teams.grade_key`. The label is
  `juniorSideLabel()` (team name, else grade, else age group), the same string as a junior side's
  `SideFixture.grade`.
- Every enqueue path (finalise, manual "Email team sheet", schedule) matches lists on
  `section = sideSection(fixture)` and on `grade_key` equal to that fixture's grade or label. A
  senior list never matches a junior side, even when its key reads the same, and a junior list
  never matches a senior one. The manual route accepts junior sides and still returns 409 when no
  list of the side's section covers it.
- `deliverTeamSheet` checks the list's section against the sheet's section. On a mismatch it
  skips the send and does not email it. This replaces the blanket junior skip.
- Scheduled junior lists pick the earliest finalised junior side in the window whose label matches
  the team.
- Web: the list editor asks Senior or Junior when a list is created (and shows it, locked,
  afterwards). The team picker comes from the club's junior fixtures (`useListJuniorFixtures`
  labels, de-duplicated). Each list row shows its section, and "Email team sheet" shows on junior
  sides too.

## As built: Email all + combined sheets (21 Oct 2026)

Ash asked for an "Email all" button on the Selection Hub, and for anyone due several team sheets to
get them in one email with one attachment.

- **Batch row:** `email_sends.kind = 'team_sheet_batch'`, with `list_id` NULL (migration
  `0057_email_send_batches.sql`). The payload holds `selectionIds`, `listIds` (null = every list
  not switched off), `reason` (`email_all` | `scheduled`), `origin`, and `sentGroups`.
- **Delivery:** for each side, find the lists of its section covering it, then map each address to
  the sides it's due. Addresses due the same set share one bcc'd email whose PDF has one page per
  sheet (`renderTeamSheetsHtml`). Senior and junior sheets never share an email. Each group that is
  sent is recorded in `sentGroups` (its section and sheet ids, never an address), so a retry sends
  only the groups that failed. A resend clears it.
- **Email all:** `POST /selection/email-all` takes the board's finalised sides (drafts are
  ignored). It refuses when none is finalised or no list covers them.
- **Scheduled:** all of a club's lists due in a sweep go out as one batch. Each list's weekly slot
  (`l{id}@{slot}`) is recorded in `payload.slots`, so a slot is batched once even if a later sweep
  batches other lists. The per-version `resendOnChange` check no longer applies to scheduled sends
  (one send per weekly slot).
- **Unchanged:** finalise ("on publish") and the per-side Email team sheet button still send per
  list, one sheet each.
- **Send log:** a batch shows as "Email all team sheets (N sides)" or "Scheduled team sheets (N
  sides)".

## As built: team-sheet sender (22 Oct 2026)

Team-sheet emails (per list and batches) are sent from `TEAM_SHEET_EMAIL_FROM` when it is set, else
`EMAIL_FROM`, with an optional `TEAM_SHEET_EMAIL_REPLY_TO`. The sender's domain must be verified in
Resend. Every other email (social, availability, alerts) keeps `EMAIL_FROM`. The transport gained a
per-message `from` and `replyTo` (`reply_to`).
