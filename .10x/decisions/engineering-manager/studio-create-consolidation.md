# Studio create consolidation: plan

**Status:** Planned 29 Oct 2026. **Design:** `decisions/architect/studio-create-consolidation.md`.
**Rule:** one PR to `main` per slice, in order. Each PR is drafted, driven to green and merged when green
(Ash's standing rule). After each merge, the Replit agent (app "OVATION APP") runs `git pull` and restarts dev.
It runs migrate only for a slice with a migration (only S1). Everything new mounts only when the club's
"New Studio (preview)" switch is on.

## P0 slices

| #   | Slice                                    | Contents                                                                                                                                                                                                                                                                                                                                                                  | Migration |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| S1  | Switch and menu                          | `tenants.new_studio_enabled` (0076); spec `UpdateTenantBody` / `AdminTenant` / `TenantPlan.newStudio`; console card; `useNewStudio()`; `previewTabs` and `hidden` tabs in `admin-nav.ts`; Photos tab shell (senior and junior libraries); Settings links strip; Your designs at its own tab; redirects when on. Tests: nav (both lists), redirects, smuggled-flag ignored | 0076      |
| S2  | Create: wizard and senior single cards   | `components/studio-create/` (steps, query-string state, descriptor table); senior sources with team badges; look and size step; finish = `createSocialDraft` and open the editor. Tests: step flow, badges, draft body per kind                                                                                                                                           | none      |
| S3  | Create: junior single cards              | `GET /juniors/fixtures/{id}/social-prefill`; junior kinds in the wizard; `createSocialDraft` marks junior drafts and strips or stamps junior photos server-side. Tests: isolation (junior route reads junior tables only), consent fail-closed, a client-supplied consent marker is ignored                                                                               | none      |
| S4  | Create: carousels                        | Lift `assembleWeekendCarousel` out of the hook (old page unchanged); senior and junior carousel sources; "Pick by hand" free set; open the set editor. Tests: the existing weekend-carousel suite unchanged, plus wizard carousel cases                                                                                                                                   | none      |
| S5  | Editor: page strip counter, grid, Share  | N / M counter and grid view in the set editor; `ShareDownloadPanel` (All, This page, Custom; PNG and JPG; one image or a numbered zip) in both editors, reusing the existing export code. Tests: page selection, file naming, junior photo rule on export                                                                                                                 | none      |
| S6  | Editor: Card and Set panel               | Sponsors toggle, What these cards show, Send to queue (`approveSocialDraft`) in both editors                                                                                                                                                                                                                                                                              | none      |
| S7  | Home, Queue filter, Your designs filters | `StudioHomeV2`; Queue Seniors / Juniors filter; Your designs type chips                                                                                                                                                                                                                                                                                                   | none      |

**Then review on dev:** turn the switch on for Halls Head (tenant 1) on dev only and give Ash the testing
checklist (`docs/testing/2026-10-29-new-studio-checklist.html`).

## P1 slices (after Ash's dev review)

| #   | Slice                           | Contents                                                                                  |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| S8  | Set editor: open one slide      | "Edit this slide" in the card editor, written back to the set                             |
| S9  | Set editor: per-slide layout    | `arrangement.pageFor` and "apply to every slide". Ash reviews the arrangement field first |
| S10 | Settings as cards               | Card grid over the existing pages                                                         |
| S11 | Photos: Uploads and Collections | Two more tabs over the existing data                                                      |
| S12 | Sponsors per slide              | Mount the sponsor session's component in the Set panel once it is on `main`               |

## Checks per PR

- `pnpm run typecheck`, `lint`, `format:check`, and web tests.
- API tests against a local Postgres for any slice that touches the server (S1, S3).
- `pnpm --filter @workspace/api-spec run codegen` after every spec change. Generated files are never edited by
  hand.

## Production

- S1 is the only migration. Ash runs its SQL in the Production SQL runner **before** republishing.
- The switch stays off for every club until Ash turns it on, so the order is dev, then a test tenant, then Halls
  Head, then the rest. Nothing changes for clubs in Production until then.
