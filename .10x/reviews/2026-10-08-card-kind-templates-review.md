# Review — card-kind-templates (2026-10-08)

Two independent reviews (security, QA) of `origin/main...HEAD`, run as separate agents with read-only access; every finding re-checked against the code before fixing.

## Security

| # | Finding | Severity | Outcome |
|---|---|---|---|
| S1 | Style values (letter spacing, row cell x/w, photo focal/zoom; pre-existing: weight, align, radius, box, opacity, delay, `data-inherited-from`) printed raw into `style="…"` → stored markup/script in admins' browsers and the headless renderer; server stored documents unvalidated | High | **Fixed** both sides: renderer coerces every number to a finite value, alignment to a fixed set, escapes `data-inherited-from` (valid values print byte-identical); API validates template documents strictly (`templateDocumentErrors`: known keys only, finite in-range numbers, bounded/safe strings, kind's own fields, https-or-token images, no charts, unique ids). Starter contract test runs the same validator. |
| S2 | Junior/senior rows could share a templated slide (keyed on `row.junior`, no split when the list fits) | Medium | **Fixed**: rows classified by `grade`/`gradeLabel` with `isJuniorGradeLabel`; mixed lists split even when they fit; all-junior lists render as junior (no photo). |
| S3 | One club's layout checks could hog the shared render queue | Medium | **Fixed** (partly): per-club render budget per sweep (`LAYOUT_RENDERS_PER_SWEEP` = 60 images). Publish-priority queueing and per-render caps left as follow-up. |
| S4 | Stale layout-check result could clear a design changed mid-render | Low | **Fixed** (= Q1). |
| S5 | Malformed documents crash rendering | Low | **Fixed** by S1 validation + renderer guards (`rows`/`cells` own-property and array checks). |
| S6 | Exported starters are a supply-chain path | Info | **Fixed**: contract test validates every starter. |

Not changed (pre-existing, out of scope): draft PATCH adjustments are not schema-validated (drafts carry other keys); the renderer coercion now covers them. No CSP on the web app; renderer network isn't sandboxed. Logged as follow-ups.

## QA

| # | Finding | Severity | Outcome |
|---|---|---|---|
| Q1 | Layout check writes unconditionally → an apply/edit/refresh during a render could be marked clear unchecked | Medium | **Fixed**: write only when still pending and template version, adjustments and card input are unchanged; otherwise stays pending. Test. |
| Q2 | Warnings for a size turned off kept a draft blocked forever | Medium | **Fixed**: full check replaces stored warnings (merge kept for single-size publish renders). Test. |
| Q3 | Pending-review count dropped layout-blocked drafts | Low–Med | **Fixed**: count keeps drafts that aren't layout-clear. |
| Q4 | Boot validation rejected `"1, 7"` and trailing commas → server wouldn't start | Low–Med | **Fixed**: boot regex accepts what the switch parses. Test. |
| Q5 | Junior split never fired on real rows | Low | **Fixed** (= S2). Tests. |
| Q6 | Rows silently hidden when one row is taller than its box | Low | **Fixed**: "overflow" warning when capacity is 0 with rows. Test. |
| Q7 | "Add to other sizes" could fold into a later step | Low | **Fixed**: any other edit, gesture, undo or redo closes the offer. Test. |
| Q8 | Apply `skipped` is client arithmetic | Low | Accepted; documented. |
| Q9 | Canvas touch changes leaked into the draft editor (switch off) | Low | **Fixed**: `touch` prop, template editor only. |

DoD gaps accepted for this PR (tracked): server render smoke with a real headless Chromium (no Chromium in CI/local); static (non-field) text isn't shrink-to-fit checked (KTD9 narrowed to live-field text to keep pack bytes identical); some AE test gaps (AE1 end-to-end, AE6 server junior list) — covered at unit level.
