# Ovation Mobile: privacy and data-safety preparation

## Status and boundaries

Prepared 9 October 2026 from the mobile source, shared API client and relevant
API handlers. The owner selected an Ovation app with club selection. The source
audited here still uses one club API per build; club discovery and selection
have not yet been implemented. Re-audit their flows before submission.

This document is a worksheet for the owner, not legal advice, a public privacy
policy or a final declaration. It does not certify hosting/provider practices,
signed native binaries or physical-device session persistence. Do not select
“no data collected” for the entire app: captain ballots persist with account
identifiers and the app sends credentials and search requests off-device.

## Evidence and actual flows

Paths below are relative to the workspace root. API paths include `/api`.

| Flow | Evidence | Device → service / service → device | Storage and limits observed |
| --- | --- | --- | --- |
| Club brand and public browsing | `artifacts/cricket-mobile/app/_layout.tsx`, `lib/tenant-brand.tsx`; `lib/api-client-react/src/custom-fetch.ts` | HTTPS API base from `EXPO_PUBLIC_DOMAIN`; `/api/tenant-brand` returns club name, colours and logo URLs. Generated queries retrieve players, matches, honours, grades and juniors. | QueryClient holds responses in memory. No persistent query-cache integration found. Currently one host, not a selected-club directory. |
| Player searches and filters | `app/(tabs)/players.tsx`, `app/juniors/players.tsx` under the mobile artifact | Search text, sort and season/age-group filters are sent as API query parameters, even without sign-in. Search text may itself contain a person's name. | Input is component state. API request logger removes query strings; infrastructure logs and retention have not been verified. Normal search processing is transient in handlers, not a saved search-history feature. |
| Captain login | Mobile `app/(tabs)/captain.tsx`; API `src/routes/captain-auth.ts`, `src/lib/auth.ts`; DB `lib/db/src/schema/captains.ts` | POST `/api/captain-auth/login` sends username and password. Response returns captain ID, display name, username and grade permissions plus a session cookie. | Mobile credentials are React state, with a secure-entry password field; no password persistence in AsyncStorage or SecureStore found. Club-provisioned accounts store a bcrypt password hash (cost 10), username, display name, permissions and session epoch in the database. Login verifies against that existing hash; it does not save the submitted plaintext password. |
| Captain session | API `src/lib/auth.ts`, `src/middlewares/require-captain.ts`; shared `custom-fetch.ts`; mobile `lib/captain-auth.ts` | Cookie `ovation_captain_session` accompanies requests; shared fetch uses `credentials: include`. `/api/captain-auth/me` resolves the account. No bearer-token getter is configured by the mobile root. | HMAC-signed, base64-encoded (not encrypted) payload contains captain ID, issued-at and epoch. Cookie is HttpOnly, SameSite Lax, Secure in production, host-scoped, with 30-day lifetime and server age/epoch checks. Native cookie persistence is a physical-device verification item, not established by this source audit. No app-managed secure token store found. |
| Logout and revocation | API `src/routes/captain-auth.ts`, `src/middlewares/require-captain.ts` | POST `/api/captain-auth/logout` clears the cookie; invalid or wrong-tenant cookies cannot authenticate. | Ordinary logout clears the client cookie, not the account or ballot records, and does not itself revoke every issued session. Epoch checks support invalidating old sessions when the account epoch changes. |
| Captain ballots | Mobile Captain screen; API `src/routes/award-voting.ts`; DB `lib/db/src/schema/award_voting.ts` | GET `/api/captain/voting` retrieves eligible rounds and existing votes; POST `/api/captain/ballots` sends config ID, grade, round and three chosen player IDs. | Database retains captain ID, choices and update time. Resubmission updates the ballot. Authorised club admins can view/edit ballots; tally/winner publication is a separate club setting/process. Not anonymous or guaranteed secret voting. No automatic ballot/account retention expiry was established. |
| Public senior records | Mobile player/match/honours screens; API `src/routes/players.ts` and related public handlers | Existing club records, names, player IDs, cricket statistics and honours are downloaded. API models can expose image URLs; this does not mean the app uploads a viewer's photos. | Primarily admin/import-originated database content, not viewer-supplied profile creation. Viewing another player's data is not the same as collecting the viewer's name or fitness data. Requests for player IDs can still reveal viewing activity in server paths/logs. |
| Junior records | Mobile `lib/juniors.ts`, `app/juniors/*`; API `src/routes/juniors*.ts`, `src/lib/junior-helpers.ts` | Separate `/api/juniors/*` data. Public player directories and aggregates exclude private participants. Private player profile requests return 404. Linked private names on match batting/bowling/roster rows and premiership lists are masked, and participant IDs removed. | Private records remain in the database. Masked match lines retain cricket figures so scores add up. Masking is based on linked participant IDs; unlinked/free-text historical names, including dismissal text, require content review. This is not a claim of complete anonymisation, deletion or parental consent. |
| Local onboarding | Mobile `lib/onboarding.ts`, `components/onboarding-provider.tsx` | A tenant/build-scoped “welcome seen” flag is written only on-device. | AsyncStorage stores `1`; no upload of this flag found. Do not describe it as a remotely collected identifier or saved captain credential. A future saved club preference needs its own audit. |
| Remote images and external links | Mobile `components/scorecard.tsx`, `app/(tabs)/juniors.tsx`, `lib/use-nav.ts` | Team crest URLs can cause network requests to their image host. Club-configured external junior quick links open with `Linking.openURL` in the device browser. | Image/CDN hosts receive network metadata. Actual hosts, HTTP redirects and provider retention must be inventoried on the final participating clubs. Browser destinations have their own practices; opening a link is not an in-app message or contact upload. |
| API operational records | API `src/app.ts`, `src/lib/logger.ts`, `src/middlewares/rate-limit.ts` | Requests expose IP/network metadata to the server/proxy. App request logging records request ID, method, path, response status and response timing. Paths can contain player/match IDs. | Query strings are stripped; configured logger redacts auth/cookie headers. Custom request serializer does not include login bodies. Failed logins use IP-based rate limiting over a 15-minute window (10 failures). Default in-memory counters are not a durable tracking profile, but are longer-lived than the individual request. Log/backup/proxy retention and provider behavior remain owner questions. |

### What the audited mobile source does not implement

No mobile self-registration, account deletion screen, user profile editing,
photo/file uploads, chat, payments, push notifications, location collection,
contacts access, advertising-ID access or dedicated analytics/crash-upload SDK
was found in the mobile app paths examined. Fonts are bundled through
`@expo-google-fonts`; that package name alone is not evidence of Google tracking.
The root ErrorBoundary has no remote error-reporting callback configured.
There are no application permission requests for camera, microphone or location
in these paths.

These are source findings, **not** a guarantee about generated Android
permissions, iOS privacy manifests, bundled/transitive SDK behavior, store crash
reporting, remote asset hosts or hosting logs. Inspect the final native artifacts
and third-party disclosures before approving “No” answers. Other features of
the web platform (SMS/email availability, social publishing, admin imports) are
not automatically mobile collection flows just because they share an API.

## Apple App Privacy worksheet

Apple defines collection as off-device transmission accessible beyond servicing
the request in real time. On-device-only state and genuinely transient handling
may fall outside that definition. Ongoing captain voting is primary
functionality: do not use the optional-disclosure exception just because public
browsing is available without login.

| Apple field/type | Draft answer / purpose | Linked / tracking | Evidence and completion condition |
| --- | --- | --- | --- |
| Does this app collect data? | **Yes** | — | Retained ballots linked to captain identity; do not choose “Data Not Collected”. |
| Identifiers → User ID | **Declare**, App Functionality | Linked: **Yes**; tracking: no tracking use found | Captain ID linked to saved votes; username identifies the club-issued account. Confirm final collector/processor practices. |
| User Content → Other User Content | **Declare**, App Functionality | Linked: **Yes**; tracking: no tracking use found | Captain's three selected player IDs, round and grade constitute submitted ballot content. Not Gameplay Content merely because cricket is a sport. |
| Contact Info → Name | **Conditional**, App Functionality if collected | Linked if collected | Captain display name is returned from an already provisioned account; viewers do not enter their own name. Names in search text or future forms may change this answer if retained. Do not treat downloading public player names as uploading each viewer's name. |
| Other Data Types (credential material) | **Confirm categorisation/retention** | Linked if retained | Password is submitted for verification, not saved in plaintext by this handler. Apple has no dedicated password type. A genuinely transient password/token can be excluded under Apple's definition; stored hashes/account metadata and any provider logging require separate assessment. Never describe all authentication data as anonymous. |
| Search History | **Conditional** | Depends on retained logs/account linkage | App sends searches; application logger strips query strings and no saved history found. Exclude only after confirming no proxy/CDN/processor retains searches beyond servicing the request. |
| Usage Data → Product Interaction / Diagnostics | **Assess and declare retained request diagnostics as applicable**, App Functionality | Confirm linkage; no tracking use found | Retained paths/status/timings are operational data. Determine whether retained page paths are Product Interaction and timings/status are diagnostics; do not claim no diagnostics simply because there is no analytics SDK. |
| Device ID / IP-derived data | **Owner confirmation required** | Depends on processing | Failed-login IP counters and provider logs exist or may exist. Classify IP by actual use (security identifier/diagnostics; location only if inferred), not automatically GPS. |
| Tracking | **Provisional No** | — | No cross-company targeted-advertising, ad-measurement or data-broker flow found in mobile source. Confirm all providers/SDKs and participating club asset hosts. Authentication and cricket leaderboards are not tracking by themselves. |
| Email, phone, address, contacts, financial data, health, viewer photos/audio, purchases, browsing history, precise location | No collection flow found in audited mobile features | — | Reconfirm against final binaries/providers. Cricket performance records and downloaded venue addresses do not demonstrate collection of a viewer's Health/Fitness/Location data. |

Treat data retained by integrated third-party partners as part of the
declaration. “Linked” cannot be changed to No merely because the app sends
numeric IDs rather than names. Add types/purposes if discovery or selected-club
personalisation introduces retained preferences.

## Google Play Data safety worksheet

Google's collection definition includes off-device transmission even when
processing is ephemeral. Ephemeral data must be included in the form and
marked accordingly if it meets the in-memory, real-time-only criteria; it may
not appear in the public Data safety summary. Do not copy Apple's exclusions.

| Play item | Draft answer | Purpose / optionality / ephemeral |
| --- | --- | --- |
| Collects user data | **Yes** | Credentials/search leave device; captain votes are retained. |
| Personal info → User IDs | **Collected** | App functionality and Account management. Optional at whole-app level because anonymous browsing is available; required to vote. Captain identity linked to saved ballots is **not ephemeral**. |
| App activity → Other user-generated content | **Collected** | App functionality. Captain ballot content is optional to submit, **not ephemeral**. Review final console taxonomy; do not double-count as gameplay. |
| Personal info → Other info (password/credential material) | **Include credential processing in assessment; confirm current console mapping** | App functionality and Account management. Optional outside captain login. Submitted plaintext is a candidate for ephemeral handling only after confirming no retained request/body logs; stored hashes and identity-linked ballots must not be marked ephemeral. There is no dedicated password category in the cited type list. |
| App activity → In-app search history | **Collected** | App functionality; optional manual search. Candidate for **ephemeral** only if all handlers/proxies/processors meet Google's criteria. Names in queries may require Personal info → Name assessment. |
| Device or other IDs / security metadata | **Assess IP-based limiting and provider records** | Fraud prevention, security, and compliance; automatic for relevant requests. Failed-login counters outlive a real-time request, so do not call that processing ephemeral. Declare the applicable type based on actual identifying use. |
| App info and performance → Diagnostics; App activity → App interactions | **Assess retained operational logs and paths** | App functionality (and Analytics only if actually used for analytics). Confirm storage duration and scope. Stored logs are **not ephemeral**. |
| Personal info → Name; Photos | **No viewer-upload flow found; conditional if final flows collect these** | Public roster/image downloads and server-provisioned captain display names are not proof that a viewer submits their own name/photo. Do not omit actual future collection or retained identifiable search data. |
| Shared with third parties | **Unresolved until ownership/processor review** | Determine whether selected clubs are the first party, service providers acting on its behalf, or independent recipients. Admin ballot access is real; a multi-club operator cannot assume all clubs qualify for Google's service-provider sharing exception. Remote image/hosting vendors also need review. |
| Encrypted in transit | **HTTPS intended; final Yes not yet certified** | API setup is HTTPS. Verify every final API/discovery/image endpoint and redirect; do not assert encryption at rest or end-to-end encryption. |
| Deletion requests | **Not established; do not claim Yes yet** | No mobile deletion/request UI or verified public request URL found. Owner must provide a workable process, scope, retention exceptions and contact route before claiming availability. |
| Independent security review / Families commitment | **Not established** | Do not claim a security-review badge or Families compliance without the required evidence. |

No accounts are created in the current mobile app. Captains are club-provisioned;
sign-out is not account deletion. Determine the applicability of Apple's
account-deletion guideline and Google's account-deletion policy to the final
release (especially if onboarding later adds account creation). Even where a
store-specific account-creation trigger does not apply, a truthful privacy policy
and supported data-rights process are still needed.

## Owner inputs required before final answers or a policy

Do not replace missing inputs with invented URLs or retention periods.

- Legal publisher/controller name, contact details and relationship to each club.
  Who receives ballots and who answers public-player/junior correction requests?
- **Privacy policy URL: OWNER TO SUPPLY.** Public, accessible without login,
  naming Ovation/the publisher and covering club records, credentials, sessions,
  votes, network logs, processors, children, rights and international processing.
  Make it reachable inside the app. Google requires a public, non-geofenced,
  non-editable policy webpage rather than a PDF.
- **Support URL and support email: OWNER TO SUPPLY.** Separate from a assumed
  marketing page. **Deletion/privacy-request URL or contact route: OWNER TO
  SUPPLY AND VERIFY.** Do not advertise deletion until it actually works.
- Retention/deletion decisions for captain accounts, hashes, ballots, club
  records, operational logs and backups, plus responsible staff and timeframes.
  The only source-supported durations above are cookie expiry and rate-limit
  window; neither is a general database retention policy.
- Actual production hosting/database/storage/image providers, processor roles,
  locations, logging practices, SDK disclosures and access controls.
- Participating clubs, rights to use their names/logos/records/photos and
  junior publication/guardian-consent arrangements. Existing public availability
  does not remove obligations relating to identifiable children.
- Intended target audience. A Juniors tab does not by itself prove a Kids
  Category or child-directed app, but does not justify excluding children from
  Play's audience declaration either. Assess Apple/Play age ratings and Families
  requirements against the real audience; no rating has been invented here.
- Final club-selection routing, locally saved selection, session handling and
  any telemetry. Confirm tenant isolation across public and protected endpoints,
  not just colour changes.

## Sources and approval record

Official guidance consulted 9 October 2026; recheck at submission:

- Apple [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- Apple [Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Google [Data safety definitions and worksheet](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- Google [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)

Before submission record: final build/version, audited commit, participating
clubs and hosts, approved public URLs, processor/retention answers, completed
console preview, approving owner and approval date. These fields are deliberately
unfilled; this preparation does not represent owner sign-off.
