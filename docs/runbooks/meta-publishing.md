# Meta publishing — runbook

How to switch on, operate and troubleshoot publishing Social Studio drafts to a club's Facebook Page and Instagram account. Design and decisions: `docs/plans/2026-10-06-001-feat-meta-scheduled-publishing-plan.md`.

Everything is dormant until `META_PUBLISHING_ENABLED=1`. With it off, the connect button doesn't show, the publish worker does nothing and no Meta call is made.

---

## 1. One-time setup

### 1.1 The Meta app (Ash)

1. In Meta for Developers, create a **Business** app ("Ovation").
2. Add **Facebook Login for Business**. Create a configuration with these permissions, and note its **configuration id**:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `instagram_basic`
   - `instagram_content_publish`
3. Valid OAuth redirect URI: `https://<SOCIAL_PUBLIC_ORIGIN>/api/meta/oauth/callback`. This is the one platform host every club's connect flow returns to.
4. App settings → Basic:
   - **Deauthorize callback URL**: `https://<SOCIAL_PUBLIC_ORIGIN>/api/meta/deauthorize`
   - **Data deletion request URL**: `https://<SOCIAL_PUBLIC_ORIGIN>/api/meta/data-deletion`
   - **Privacy policy URL**: Ovation's privacy policy. This is a business document Ash supplies; the app doesn't generate one.
5. Business Verification for the Ovation business portfolio. Expect about 1–5 business days, sometimes longer.
6. App Review: request **Advanced Access** for the five permissions above (see §5). Until it is granted, only people with a role on the app can connect, which is enough for the Halls Head pilot.

### 1.2 Environment (Replit Secrets)

| Variable                   | Value                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `META_PUBLISHING_ENABLED`  | `1` to switch on; anything else is off. Boot fails if `1` without the rows below.                        |
| `META_APP_ID`              | The app id                                                                                               |
| `META_APP_SECRET`          | The app secret                                                                                           |
| `META_LOGIN_CONFIG_ID`     | The Facebook Login for Business configuration id                                                         |
| `META_GRAPH_VERSION`       | Optional; defaults to `v26.0`                                                                            |
| `SOCIAL_TOKEN_KEY`         | 32 random bytes, base64 (see below). Replit Secrets only — never in a file, CI or dev fixtures.          |
| `SOCIAL_TOKEN_KEY_VERSION` | Optional; defaults to `1`                                                                                |
| `SOCIAL_PUBLIC_ORIGIN`     | `https://ovationcc.app` (or whichever host serves `/api` for every tenant). Meta fetches images from it. |
| `SOCIAL_PUBLISH_SECRET`    | A long random string, **different from** `SOCIAL_SWEEP_SECRET`                                           |
| `RENDER_HARNESS_ORIGIN`    | Must be set: the publish worker renders cards with no request to borrow a host from                      |

Generate the token key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 1.3 Database

Migration `lib/db/migrations/0030_social_publishing.sql` adds `social_connections`, `social_connection_pending`, `social_publications` and two `social_settings` columns.

Production schema changes are applied by hand in Replit's **Production SQL runner** before republishing. Do it in this order:

1. Run the contents of `0030_social_publishing.sql` against production.
2. Republish.
3. Confirm read-only that the three tables and the two columns (`auto_publish_enabled`, `auto_publish_freshness_hours`) exist.

Check the actual schema, not the migration ledger.

### 1.4 The five-minute publish job

Add a cron-job.org job, the same service that triggers the PlayHQ sync:

- `POST https://<app>/api/internal/publish-sweep`
- Header: `x-publish-secret: <SOCIAL_PUBLISH_SECRET>`
- Every 5 minutes

The hourly scheduled draft sweep also runs the worker for each club it sweeps, so posts still go out if the five-minute job stops. They are just later: up to an hour instead of five minutes. A response of `{"skipped": true}` means publishing is off, or another run was already going.

---

## 2. Turning the pilot on

1. Complete §1.1–§1.4 and set `META_PUBLISHING_ENABLED=1`.
2. The club's plan must include the `socialPublishing` feature. While billing is dormant, every plan has it.
3. In the club's admin: **Social Media Studio → Cards → Facebook and Instagram → Connect**. Log in as someone with a role on the Meta app who manages the club's Page.
4. Smoke test from a ready draft: **Publish now** a single image, then a carousel (a round set), then a Story. Check each lands once on the Page and on Instagram.
5. Only then switch on **Publish automatically** in the Auto-post card.

---

## 3. Operating it

**Where to look**

- Each draft's drawer shows every post's state (scheduled, waiting for reconnect, publishing, published, failed, cancelled) and Meta's reason for a failure.
- The admin hub shows "Reconnect Facebook and Instagram" and "N cards couldn't be published".

**Retries**

- Transient Meta errors retry at 5, 15 and 45 minutes, then fail.
- **Retry** in the drawer starts again. It first checks whether an earlier attempt actually went live, so it never double-posts.

**Revoked access**

- The connection flips to "reconnect needed". Ovation finds out when a post hits a token error, or at the daily check.
- Scheduled posts are **held**, not failed.
- After **Reconnect**, held posts within the freshness cut-off go out on the next run. Older ones are cancelled and the draft stays Ready.

**Disconnect** cancels scheduled and held posts and deletes the stored token.

**Meta deauthorize or data-deletion callbacks** disconnect every club that Meta user connected and delete the token.

### Common failure reasons

| Reason shown                                                            | Meaning / fix                                                                                      |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "No Instagram account is linked to this Page."                          | Link the Instagram professional account to the Page in Meta Business Suite, then reconnect.        |
| "This card splits into N images; Meta allows at most 10."               | Trim the set in the editor, or post by hand.                                                       |
| "Instagram took too long to process the image."                         | Instagram didn't finish processing within five minutes. It retries automatically with fresh media. |
| "Instagram could not process the image."                                | Usually a bad render. Open the card, re-save it, then Retry.                                       |
| "RENDER_HARNESS_ORIGIN is not set…" / "SOCIAL_PUBLIC_ORIGIN is not set" | Configuration; see §1.2.                                                                           |

---

## 3a. Posting calendar

A club can plan its posts on a weekly calendar (plan `docs/plans/2026-10-07-003-feat-social-posting-calendar-plan.md`). It is off for every club until an admin turns it on in **Social Media Studio → Queue → Set up posting calendar**.

**Deploy order (once)**

1. Paste `lib/db/migrations/0041_social_posting_calendar.sql` into Replit's **Production** SQL runner. It is idempotent.
2. Check the columns exist (read-only):

   ```sql
   select column_name from information_schema.columns
   where table_name = 'social_drafts'
     and column_name in ('planned_at','planned_by','roll_count','dispatched_at',
                         'overdue_notified_at','expired_at')
   union all
   select column_name from information_schema.columns
   where table_name = 'social_settings' and column_name = 'posting_schedule';
   ```

   Expect 7 rows.

3. Republish.
4. Turn the calendar on for Halls Head only and watch a weekend before offering it to other clubs.

**How it behaves**

- Every new card gets the next free slot for its kind, within the daily cap and the minimum gap. Admin moves always win; over the cap only warns.
- Slots run on the hourly scheduled sweep, and the PlayHQ runner calls `/api/internal/playhq/posting-slots` before its scrapes, so a card goes out within the hour after its slot.
- At its slot an approved card publishes when auto-publish is on and Facebook/Instagram is connected; otherwise the club is told to share it by hand. Junior and hand-made cards never publish on their own.
- A card still awaiting review rolls to the next free slot (the club is reminded); one an admin placed is flagged overdue once instead. Cards older than the age limit expire to the Unscheduled tray.
- Turning the calendar on places the open queue; cards already scheduled to publish keep their time.

**Turning it off** hands cards back to auto-post's review window, measured from each card's import. Cards whose window has already passed can become ready, or publish, on the next sweep. The admin is warned before confirming.

## 3b. Auto-queue criteria (Posting Plan version 2)

The Posting Plan version 2 (plan `docs/plans/2026-10-15-001-feat-social-auto-queue-criteria-plan.md`) retires the grade leader, trading card and countdown cards, folds centuries, five-fors, hat-tricks and five catches into the Big Moment card, lets each row list junior age groups, and makes a junior team's "auto" setting mean publishing to Facebook and Instagram. No app migration: the one new table lives in `central` and comes from the projector SQL.

**Deploy order (once)** — run for production on 16 Oct 2026. The Production SQL runner executes one statement at a time: paste multi-statement scripts statement by statement and run each check on its own.

1. **Before republishing:** paste `scripts/sql/central-projector.sql` into the Production SQL runner for the database `CENTRAL_PROJECTOR_DATABASE_URL` points at (it is idempotent). Check (read-only):

   ```sql
   select to_regclass('central.match_feats');
   ```

   Expect `central.match_feats`, not null.

2. **Read-only, before republishing:** list the junior teams currently on `auto`, so those clubs can be told the setting now means publishing and they must opt in again:

   ```sql
   select t.slug, s.team_publishing
   from junior_match_display_settings s join tenants t on t.id = s.tenant_id
   where s.team_publishing::text like '%"auto"%';
   ```

3. Republish. Every club's Posting Plan comes back as the default table (round carousels for a central club, every match on its own otherwise) with the junior runs bar at 100; a club's saved version 1 plan is not read.
4. **After republishing:** paste `scripts/sql/auto-queue-release.sql` into the Production SQL runner (idempotent). It dismisses open drafts of the retired kinds, cancels their waiting publications and puts every junior team back on `approval`. Checks (read-only), both expect 0:

   ```sql
   select count(*) from social_drafts
   where status in ('awaiting_review', 'ready')
     and card_input->>'kind' in ('gradeLeader', 'tradingCard', 'countdown');
   select count(*) from junior_match_display_settings where team_publishing::text like '%"auto"%';
   ```

5. Backfill feats (hat-tricks and five catches need ball-by-ball and fielding rows; only matches the sync has fetched balls for can have a hat-trick). The script takes `--org=<playhq org guid>`, `--season="<PlayHQ season name>"` or `--match=<guid>`, plus `--yes` to write to a non-local database (`--dry-run` first); it is idempotent. Halls Head's org is `4559f1b9-86d8-eb11-a7ad-2818780da0cc`.

   ```bash
   pnpm --filter @workspace/scripts run playhq-project-central -- --org=<playhq org guid> --dry-run
   pnpm --filter @workspace/scripts run playhq-project-central -- --org=<playhq org guid> --yes
   ```

   Check (read-only): `select kind, count(*) from central.match_feats group by kind;`

6. After the next match-day or day-after sync run, confirm it fetched balls for a played match (read-only):

   ```sql
   select match_id, count(*) from playhq.balls group by match_id order by max(ingested_at) desc limit 5;
   ```

**How it behaves**

- Only match-day, day-after and catch-up syncs fetch ball-by-ball; weekly and pre-weekend syncs don't (Ash approved the extra scrape volume on 15 Oct 2026).
- A junior-marked card publishes on its own only when every team it names is `auto`; a card that names no team, or any team on `approval`, waits for an admin even when the calendar or auto-post would otherwise send it.

## 4. Maintenance

### Rotating the token key

1. Move the current key to `SOCIAL_TOKEN_KEY_PREVIOUS` as `<version>:<base64>`.
2. Set a new `SOCIAL_TOKEN_KEY` and bump `SOCIAL_TOKEN_KEY_VERSION`.
3. Redeploy.

Old tokens still decrypt with the previous key. New connections and reconnections seal with the new one. Remove `SOCIAL_TOKEN_KEY_PREVIOUS` once every connection has been resealed; ask clubs to reconnect if needed.

### Graph API version

Meta supports each version for about two years. Bump `META_GRAPH_VERSION` before the pinned one is retired; the version list is in Meta's changelog. Run the smoke test in §2 after any bump.

### Leftover images

Rendered JPEGs are deleted when a post finishes. A crash can leave one behind. They are unguessable, harmless and safe to ignore.

---

## 5. App Review checklist

For each permission, a screencast plus a short use-case note:

- `pages_show_list`: the club picks which Page to connect.
- `pages_read_engagement` and `pages_manage_posts`: a ready card is published to the Page as a photo post, an album and a Story.
- `instagram_basic` and `instagram_content_publish`: the same card published to Instagram as a post, a carousel and a Story.
- Show the connect flow, a scheduled post going out, and Disconnect.
- Provide a test user who has a role on a test Page with a linked Instagram professional account.
- Confirm the privacy policy URL and that the data-deletion callback answers.

---

## Data governance

Clubs publishing their own results to their own accounts is not treated as commercialising scraped data (decision of 2026-10-06; see `CLAUDE.md`). Licensed data is still required for association-level or resale uses.
