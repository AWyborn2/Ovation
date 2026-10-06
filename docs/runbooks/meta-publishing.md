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
