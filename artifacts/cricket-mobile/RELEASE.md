# Mobile release preparation

This codebase targets both iPhone and Android. This preparation does not submit
or publish an app to either store.

## Confirmed release scope and materials

The owner confirmed **Ovation with a club-selection screen** for the first
release. This is one Ovation app for participating clubs, not a Halls Head-only
app or a separate binary for each club.

**Status: release materials prepared; not ready for submission.** The audited
app still connects to one club per build and has no club picker. The confirmed
scope requires implementation and fresh verification before using the planned
store copy. No runtime code, identifiers, branding assets or publishing settings
were changed as part of preparing these materials.

- [Store listings, screenshots and reviewer pack](release/STORE-MATERIALS.md)
- [Data-flow audit and privacy/data-safety worksheets](release/PRIVACY.md)

The worksheets are evidence-based drafts, not submitted store declarations or
a published privacy policy. Unresolved answers are explicitly marked for owner
confirmation. No support, privacy, deletion or production URL has been invented.

## Store identity

Replit Expo Launch requires **static `app.json`**. The existing default identity
is preserved: name `Ovation`, scheme `ovation`, and identifier
`app.ovation.ovation` on both platforms. Build numbers start at 1.

The original icon artwork is retained. `store-icon.png` is a square, opaque,
1024×1024 version of that artwork, suitable for a store build. The artwork
currently depicts Halls Head; confirm the intended release branding before submission.

The release branding is now confirmed as Ovation. Replace the Halls Head store
icon and splash artwork with owner-approved Ovation artwork before submission;
retain club-specific branding inside the selected club's screens. The current
1024×1024 icon is technically suitable, but its artwork is not suitable for
the confirmed multi-club release.

Do not change identifiers for an app already registered in either store.
If preparing a separate club-branded app, agree its separate store identity first.
Environment variables no longer silently replace the static store identity.

## API configuration

For the **current code only**, production `EXPO_PUBLIC_DOMAIN` must resolve to
a published club hostname, not the Ovation marketing/platform host. Do not
include `/api` or a development hostname. This is not a solution for the
confirmed club-selection release. Its club discovery and selected-club API
routing still need to be designed and implemented. Merely pointing today's app
at the platform host will not create a club picker.

Club switching must clear the previous club's query cache and keep captain
sessions, ballots, branding and junior data isolated. Production routing must
respect server-side tenant resolution; a dev-only `x-tenant-id` override is not
a production club-selection mechanism. Re-audit privacy after adding discovery,
remembered club selection or any new authentication/storage flow.

The development workflow continues to use the development API independently.

Run these checks from the workspace:

```
pnpm --filter @workspace/cricket-mobile test
pnpm --filter @workspace/cricket-mobile run typecheck
pnpm --filter @workspace/cricket-mobile run release:check
```

`release:check` verifies both platforms' configuration, the store icon, HTTPS
and the live club-brand endpoint for today's single-club configuration. It
does **not** verify club selection, final artwork, privacy policy, store answers,
reviewer access or device behavior. Update its coverage for the confirmed scope
and run it before starting a store release.
Ordinary website publishing also builds an Expo Go preview, so that build does
not require a club to be selected and does not block publishing the platform
website. Production builds never fall back to `REPLIT_DEV_DOMAIN`, and keep the
club API domain separate from the domain hosting mobile assets.

## Verification limits and remaining store steps

- Metro production exports verify JavaScript and assets for iOS and Android;
  they are not signed `.ipa` or `.aab` binaries.
- Test on physical iPhone and Android devices before store submission, including
  captain sign-in, session persistence, logout and reopening the app.
- Implement and verify the confirmed club-selection scope and Ovation artwork;
  confirm the production discovery/club hosts through the deployment process.
- Prepare screenshots, descriptions, support/privacy URLs, store privacy/data
  declarations, and review access if a reviewer needs a captain account.
- iPhone build/upload is handled by Replit Expo Launch, followed by TestFlight
  and Apple review.
- Replit does not currently provide Google Play publishing. Android signing,
  bundle build/upload and Play internal testing require a separate release process.
- Increment `ios.buildNumber` and `android.versionCode` for later store uploads.

## Submission gates

- [ ] Club discovery, initial selection, switching and reopening are implemented.
- [ ] No previous club's brand, data or captain session leaks on switching.
- [ ] Owner-approved Ovation icon/splash and Play feature graphic are ready.
- [ ] Both platforms have passed physical-device captain/session checks.
- [ ] Public support and privacy URLs are supplied by the owner and reachable;
      privacy policy is accessible inside the app as well as in store metadata.
- [ ] Owner confirms processors, log/backup retention, sharing, deletion process,
      intended audience, content rights and final privacy worksheet answers.
- [ ] Reviewer captain access and a safe, open voting fixture are available.
- [ ] Final iPhone/Android screenshots depict the actual release build.
- [ ] Developer accounts, agreements, signing and console permissions are ready.
- [ ] Separate explicit approval is obtained before any upload or submission.
