# Ovation Mobile: store listing and review pack

## Listing status

Prepared 9 October 2026 for the owner-confirmed **Ovation app with club
selection**. All listing copy below is a **planned-release draft**. The current
app cannot select/switch clubs; do not paste this copy into a submission until
that behavior exists and is verified. Use “participating clubs,” not “all cricket
clubs.” Content availability varies by club and its recorded history.

Store identity remains unchanged in `../app.json`: display name `Ovation`,
version `1.0.0`, iOS bundle ID and Android package `app.ovation.ovation`, iOS
build `1`, Android version code `1`. No identifier changes are proposed.
Confirm ownership/name availability in both stores without silently renaming
the app or creating a new identity.

## Apple App Store draft metadata

| Field | Draft |
| --- | --- |
| Name (30 characters max) | Ovation |
| Subtitle (30 max) | Cricket stats & club history |
| Primary category suggestion | Sports — owner to confirm |
| Promotional text (170 max) | Explore your cricket club's players, scorecards and honours. Choose a participating club and discover the records that tell its story. |
| Keywords (100 max) | cricket,club,scorecard,players,statistics,records,honours,premierships,juniors |
| Support URL | OWNER TO SUPPLY — public and working |
| Privacy Policy URL | OWNER TO SUPPLY — see `PRIVACY.md` |
| Marketing URL (optional) | Omit unless owner supplies an appropriate public page |
| Copyright | OWNER TO SUPPLY — correct year and rights holder |
| Review contact | OWNER TO SUPPLY — name, monitored email and phone |
| Age rating | Complete questionnaire for actual content/audience; not assigned here |

### Apple description (under 4,000 characters)

Ovation brings your cricket club's records and history to your phone.

Choose a participating club, then explore the players, scorecards and achievements that make it yours.

• Search players and view career statistics and grade-by-grade records.
• Browse matches by grade and season, and open detailed cricket scorecards.
• Discover honour boards, premierships, awards and club records.
• Explore junior players, matches and premierships in a separate junior section where available.
• Grade captains can sign in with their club-issued account to submit 3-2-1 award votes for eligible rounds.

Public club records can be browsed without signing in. Captain voting requires an account supplied by your club and an award open for voting.

Records reflect the information entered or imported by each club. Available seasons and features may vary, older history may be incomplete, and recent results may take time to appear.

### Initial version notes

First release of Ovation for participating cricket clubs, with club selection, player statistics, match scorecards, honour boards, junior records where available and captain 3-2-1 voting.

Use only once these features are present in the submitted binary. Do not claim
offline access, live ball-by-ball scoring, push alerts, fan accounts, social-card
export, registration or payments: this audit did not establish those features.

## Google Play draft metadata

| Field | Draft |
| --- | --- |
| App name (30 characters max) | Ovation |
| Short description (80 max) | Your cricket club's players, scorecards, records and honours in one app. |
| Category suggestion | Sports — owner to confirm |
| Support email (required) | OWNER TO SUPPLY — monitored, publishable address |
| Website/support URL | OWNER TO SUPPLY |
| Privacy Policy URL | OWNER TO SUPPLY |
| Developer identity/contact | OWNER TO SUPPLY and complete account verification |

### Play full description (under 4,000 characters)

Follow your cricket club's records and history with Ovation.

Choose a participating club to explore its players, scorecards and achievements.

PLAYERS AND STATISTICS
Search players and view career totals, grade-by-grade records and milestones.

MATCHES AND SCORECARDS
Browse recorded matches by grade and season. Open a match to explore its detailed cricket scorecard.

HONOURS AND HISTORY
Discover honour boards, premierships, awards and records celebrating your club's achievements.

JUNIOR CRICKET
Where a club has junior records available, explore junior players, matches and premierships in a separate section.

CAPTAIN VOTING
Grade captains can use their club-issued account to submit 3-2-1 award votes for eligible rounds while voting is open.

Public records do not require sign-in. Voting access is provided by your club, not through public account registration in the app.

Ovation displays the records entered or imported by participating clubs. Content and available seasons vary by club. Historical records may be incomplete and recent matches may take time to appear.

## Screenshot and artwork checklist

Capture **the actual final build on each platform** with release fonts and
approved Ovation artwork. This is a capture plan, not a delivered screenshot
set. Do not reuse development previews, fabricate the club picker or present
web screens as native screenshots. Avoid personal captain credentials, actual
unpublished votes and private junior names; use authorised review/demo data.

| Order | Screen and suggested caption | Acceptance check / alt-text guidance |
| --- | --- | --- |
| 1 | Club selection — “Choose your club” | **Blocked until implemented.** Show real participating clubs with authorised logos; alt text describes selectable club list. |
| 2 | Selected-club Home — “Your club at a glance” | Correct club brand and populated summary; no neutral loading placeholders. Alt text identifies club summary and recent games. |
| 3 | Players/profile — “Explore player records” | Authorised public player with statistics fitting the screen; alt text identifies player statistics, not unseen private details. |
| 4 | Match scorecard — “Every recorded match” | Legible innings, runs/wickets and correct crests; alt text describes match and scorecard. |
| 5 | Honours/premierships — “Celebrate club history” | Populated genuine honour board; alt text describes achievements displayed. |
| 6 | Juniors — “Junior cricket, separately” | Only publicly permitted data; private identities not visible. Alt text describes junior records without identifying a private player. |
| 7 (optional) | Captain ballot — “Captain 3-2-1 voting” | Dedicated demo captain/fixture, no credentials in shot; make clear this is captain-only. Alt text describes three player selection controls. |
| 8 (optional) | Switch club / second Home | Verify brand/data both change correctly; no prior-club content or session leak. |

### Apple assets

- Approved square opaque **1024×1024** Ovation icon (current image is Halls Head).
  Review the splash artwork too; do not change bundle ID.
- Supply 1–10 PNG/JPEG screenshots per required size/localisation; plan six
  portrait iPhone images. A current accepted portrait size is **1320×2868**;
  **1290×2796** and **1260×2736** are also listed in Apple's specifications.
  Use the required iPhone display slot shown in App Store Connect at upload,
  rather than relying on historical screen-size labels.
- `ios.supportsTablet` is false: iPad screenshots are not part of this pack.
  Reassess if tablet support changes.
- App preview video is optional, not prepared here.

### Google Play assets

- Ovation high-resolution store icon: **512×512**, 32-bit PNG with alpha,
  maximum **1024 KB**. The Expo 1024 icon is not a substitute for this asset.
- Feature graphic: **1024×500**, JPEG or 24-bit PNG without alpha.
- At least **2** screenshots total; up to **8** per supported device type.
  PNG/JPEG, minimum dimension 320px, maximum 3840px; the longer dimension
  must not exceed twice the shorter.
- Plan six **1080×1920** portrait phone screenshots. At least four screenshots
  at 1080px minimum and 9:16 portrait (or 16:9 landscape) meet the cited
  screenshot recommendation criteria. Supply concise alt text.
- No tablet/TV/watch assets are claimed here; confirm Android supported-device
  distribution and supply required assets if additional form factors are enabled.

Recheck the official screenshot specifications at upload; store requirements
can change independently of app code.

## Reviewer access: Apple and Google

Public browsing needs no account. Captain voting is gated, so both stores need
working access instructions. Do not state “all functionality accessible without
login.” Do not commit credentials, use a real captain's account or give reviewers
administrator access.

### Owner-provided review fixture

- A stable, discoverable participating club and its precise picker label.
- A dedicated captain account valid on that club's production API. Username
  and password must be placed privately in Apple review sign-in fields and
  Google's App access instructions, **not in this repository or chat**.
- Grade permission, a voting-enabled/open/unfinalised award, a season and an
  imported non-abandoned round with at least three eligible players.
- A safe review/demo fixture whose votes can be submitted and changed without
  affecting real awards. Keep the account and fixture available throughout
  review, including resubmissions; avoid expiration, geography restrictions,
  OTP dependencies or IP allowlists that block store reviewers.
- Exact club, grade, award and round labels, review contact details, and any
  additional access steps. No account or fixture was created in this preparation.
- Preflight on physical iPhone and Android: fresh install → select club →
  browse → sign in → vote → reopen → verify saved vote/session → sign out.
  Verify expiration/error recovery and switching clubs while signed in.

### Review notes template — fill before submission

> Ovation displays cricket records for participating clubs. Public player,
> match, honour-board and available junior records can be browsed without login.
> On first launch choose [OWNER-SUPPLIED CLUB LABEL].
>
> To test restricted functionality, open Captain and use the dedicated review
> account supplied in the private review-access fields. This is a club-issued
> captain account; there is no public self-registration in the app.
>
> Open [AWARD], [GRADE], [SEASON], [ROUND]. Select three different eligible
> players for the 3-, 2- and 1-point selections and submit. Reopen the round
> to check/change the saved ballot while voting remains open. This fixture is
> isolated from real awards.
>
> Use Sign out in Captain. To change clubs use [FINAL CLUB-SWITCH PATH].
> Only the selected club's records and permitted captain actions should appear.
> Junior records are separate; private linked junior identities are withheld
> from directories/profiles and masked on supported scorecards.
>
> Review contact: [OWNER-SUPPLIED NAME / EMAIL / PHONE].

The bracketed fields are **not submission-ready**. Confirm the final switch
path and safe fixture behavior after implementation. If real review data is
unavailable, resolve the access blocker rather than bypassing authentication.

## Developer-account prerequisites and release paths

### iPhone — Replit Expo Launch

- Owner needs active paid **Apple Developer Program** membership and access
  to the correct Apple team/App Store Connect app record. Check identity/legal
  entity verification, agreements and permissions; organisation enrolment may
  require a D-U-N-S number.
- App Store Connect must own/reserve the existing `app.ovation.ovation` bundle
  ID, app record and owner-supplied SKU. Provide required Apple authentication/
  authorisation through the supported Launch flow, never in repository files.
- Use **Replit Expo Launch** for the signed iOS build/upload. Follow Launch's
  supported account setup and checklist, then TestFlight/device testing and
  review metadata. The release owner completes the review submission through
  the supported Launch/App Store Connect flow once explicitly approved.
- No EAS CLI, manual iOS build workaround, upload, TestFlight invitation or
  store submission was performed or requested by this preparation.

### Android — separate owner-controlled release process

- Replit does **not currently provide Google Play publishing**. Agree an
  Android release owner and external build/signing/upload process; no EAS CLI
  commands are part of this pack.
- Owner needs a verified Google Play Console developer account (personal or
  organisation), accepted agreements, account payment/enrolment completed and
  app-level access. Complete organisation/identity/contact/device verification
  as required by that account type.
- Keep `app.ovation.ovation`; establish secure upload-key custody, Play App
  Signing enrolment and a signed Android App Bundle through the separate
  Android process. Check the current target API requirement and final merged
  permissions. A Metro export is **not** a signed `.aab`.
- Begin with internal testing and physical-device checks. Personal accounts
  created after **13 November 2023** must normally complete a closed test with
  **12 opted-in testers continuously for 14 days** before applying for
  production access; internal testing alone does not satisfy that requirement.
  Confirm what the owner's console requires.
- Complete App access, Data safety, privacy URL, target audience, ads declaration,
  content rating and country/device availability against the final build.
  Do not infer a children's category or “no ads” solely from a Juniors tab or
  absence of an ad SDK; review actual content, sponsor treatment and audience.
- After testing, use the separately agreed process for upload/review only with
  the owner's explicit approval. No bundle, key or Play submission is created here.

## Owner hand-off checklist

- [ ] Approved Ovation artwork and rights to participating club content.
- [ ] Initial participating clubs and production discovery/club routing confirmed.
- [ ] Public privacy policy/support URLs and monitored contacts provided.
- [ ] Privacy/deletion/processor/retention answers approved (`PRIVACY.md`).
- [ ] Native binaries, permissions, SDK disclosures/manifests and device behavior checked.
- [ ] Final screenshots/feature graphic captured; listing draft matches the binary.
- [ ] Review club/account/fixture privately supplied and tested on both platforms.
- [ ] Publisher identity, accounts, signing custody, console records and agreements ready.
- [ ] Age/audience/ads/content questionnaires completed accurately.
- [ ] Explicit permission granted for the next release action.

## Official references

Consulted 9 October 2026; recheck current console requirements:

- [Replit native mobile apps](https://docs.replit.com/features/artifact-types/building-mobile-apps)
- [Replit Apple account setup](https://docs.replit.com/build/mobile-apple-account)
- [Replit iOS upload](https://docs.replit.com/build/mobile-upload-ios)
- [Replit iOS review submission](https://docs.replit.com/build/mobile-publish-ios)
- [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- [Google listing graphics and screenshots](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
- [Google new personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
