# Review — junior-card-photos (2026-10-16)

Phase 5 (QA + Security) over `claude/junior-card-photos`, plan `docs/plans/2026-10-16-001-feat-junior-card-photos-plan.md`, ADR-007.

## QA

| AE  | Covered by                                                                                                                 | Result                 |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| AE1 | `routes/juniors-photos.test.ts` "withholding consent": open card stripped in the request, posted card stale, re-allow      | pass                   |
| AE2 | `lib/junior-photos.test.ts` pick: private excluded by `loadJuniorPhotos`, seeded pick stable across order/re-render        | pass                   |
| AE3 | pick returns null with no allowed photo; existing junior suites still assert no photo without uploads                      | pass                   |
| AE4 | Senior library disabled for junior drafts in the drawer; junior cards render nothing without the server marker (renderers) | pass (by construction) |
| AE5 | `juniors-photos.test.ts` "gated serving": public 200 for allowed, 404 for private, admin 200, raw storage path 404         | pass                   |
| AE6 | Combined round carousel: junior slides stay photo-less (server `draft-render` slide marker check); junior-only set picks   | pass (code path)       |
| AE7 | 0045 applied twice locally; no drift; clubs without junior data untouched                                                  | pass                   |

Suites: web (full run in progress at review time), lib/db 487, API junior/photo suites green; typechecks clean.

**Not verified in a browser:** the admin Photo section and the profile avatar (no Chromium locally). Recommend a look at Admin → Junior players → a player after republishing.

## Security

- **Children's photos.** Default-allow is Ash's decision (registration form = consent record), recorded in ADR-007; the admin's withheld flag is audited (who/when) and journalled. Every public read of a junior photo re-checks allowance at request time; responses are `Cache-Control: private, no-store` so no CDN or shared cache keeps a copy after consent is withdrawn.
- **Storage.** Raw junior objects are refused by `GET /storage/objects/*` without an admin session; only `/juniors/photos/:id` serves them. Uploads are converted (EXIF/GPS stripped) and the original deleted.
- **Tenant isolation.** Every route scopes by tenant; the serving route joins `junior_photos` to the tenant's participant row, so another club's photo id is a 404.
- **Fail-closed rendering.** Renderers show a junior photo only behind `cardInput.juniorPhotoAllowed`, which only the server's junior engines write; the senior photo pipeline still returns nothing for junior cards; the manual photo PATCH cannot make a junior card show a senior photo.
- **No new secrets.** No third-party calls for junior photos (background removal stays blocked for juniors).

**Verdict:** ship, with the browser check after republish.
