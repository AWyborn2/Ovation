# Mobile release preparation

This codebase targets both iPhone and Android. This preparation does not submit
or publish an app to either store.

## Store identity

Replit Expo Launch requires **static `app.json`**. The existing default identity
is preserved: name `Ovation`, scheme `ovation`, and identifier
`app.ovation.ovation` on both platforms. Build numbers start at 1.

The original icon artwork is retained. `store-icon.png` is a square, opaque,
1024×1024 version of that artwork, suitable for a store build. The artwork
currently depicts Halls Head; confirm the intended release branding before submission.

Do not change identifiers for an app already registered in either store.
If preparing a separate club-branded app, agree its separate store identity first.
Environment variables no longer silently replace the static store identity.

## API configuration

The current mobile experience is club-specific; it has no club-selection screen.
Set **production** `EXPO_PUBLIC_DOMAIN` to the published club hostname, not the
Ovation marketing/platform host. Do not include `/api` or a development hostname.
The development workflow continues to use the development API independently.

Run these checks from the workspace:

```
pnpm --filter @workspace/cricket-mobile test
pnpm --filter @workspace/cricket-mobile run typecheck
pnpm --filter @workspace/cricket-mobile run release:check
```

`release:check` verifies both platforms' configuration, the store icon, HTTPS
and the live club-brand endpoint. Run it before starting a store release.
Ordinary website publishing also builds an Expo Go preview, so that build does
not require a club to be selected and does not block publishing the platform
website. Production builds never fall back to `REPLIT_DEV_DOMAIN`, and keep the
club API domain separate from the domain hosting mobile assets.

## Verification limits and remaining store steps

- Metro production exports verify JavaScript and assets for iOS and Android;
  they are not signed `.ipa` or `.aab` binaries.
- Test on physical iPhone and Android devices before store submission, including
  captain sign-in, session persistence, logout and reopening the app.
- Confirm the intended club/branding and production API host before release.
- Prepare screenshots, descriptions, support/privacy URLs, store privacy/data
  declarations, and review access if a reviewer needs a captain account.
- iPhone build/upload is handled by Replit Expo Launch, followed by TestFlight
  and Apple review.
- Replit does not currently provide Google Play publishing. Android signing,
  bundle build/upload and Play internal testing require a separate release process.
- Increment `ios.buildNumber` and `android.versionCode` for later store uploads.
