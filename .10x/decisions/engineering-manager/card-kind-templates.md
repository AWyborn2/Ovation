# Engineering Manager — card-kind-templates

## Phase 3 task breakdown (2026-10-07)

Tasks are half a day or less. IDs are `T<unit>.<n>`; unit IDs match the plan (U1–U10). Estimates in half-days (hd).

### Milestone A — model and rendering (U1–U4)

| Task | Description | Est | Depends on |
|---|---|---|---|
| T1.1 | Shared document types, sizes-present and layers-for-size helpers in `lib/scorecard/src/kind-templates/document.ts` + tests | 1 | — |
| T1.2 | Add-to-sizes placement and rows capacity helpers + tests | 1 | T1.1 |
| T1.3 | `{{field}}` token substitution (escaped) and empty-element rule in `adjustments.ts` + tests | 1 | T1.1 |
| T1.4 | Per-size presence in `renderFreeLayers` + byte-identity guard for legacy drafts | 1 | T1.1 |
| T1.5 | `photo` layer render (focal/zoom, junior drop) + tests | 1 | T1.4 |
| T1.6 | `rows` layer render (cells, variants) + tests | 2 | T1.2, T1.4 |
| T2.1 | `layer-fit.ts` step-down loop with injected measurer (text layers) + tests | 1 | T1.4 |
| T2.2 | Extend fit to rows cells; warning shape per size/row | 1 | T1.6, T2.1 |
| T2.3 | Harness runs fit after fonts/images; returns warnings; server renderer carries them back | 1 | T2.1 |
| T3.1 | Static field catalogue (Broadcast Dark + Club Kit for PACK_ONLY_KINDS) in `lib/scorecard` + tests | 1 | T1.1 |
| T3.2 | Web parity test vs `resolveTemplate`/`bindInput`; blank-base `packTextFields` reads catalogue | 1 | T3.1 |
| T3.3 | Sample and stress-sample inputs per kind | 1 | T3.1 |
| T4.1 | Google Fonts catalogue script + committed JSON | 1 | — |
| T4.2 | Font loader for document families with explicit load and failure detection; harness wiring + tests | 1 | T4.1, T2.3 |

### Milestone B — storage, starters scaffold, guards (U5, U6 scaffold, U10)

| Task | Description | Est | Depends on |
|---|---|---|---|
| T5.1 | Schema changes + migration `0035_kind_templates.sql` (snapshot, journal) | 1 | — |
| T5.2 | Kind-templates switch (off by default) + tests | 0.5 | — |
| T5.3 | OpenAPI schemas/paths + codegen | 1 | T5.1 |
| T5.4 | `lib/kind-templates.ts`: get-or-create (insert-or-ignore), versioned save + tests | 1 | T5.1, T6.1 |
| T5.5 | Apply-to-drafts transaction (revisions, status re-check, keep `editedAt`) + tests | 1 | T5.4 |
| T5.6 | Routes (list, get, save, start, dismiss, apply) with tenant isolation + route tests | 1 | T5.3, T5.4, T5.5 |
| T5.7 | Exclude `source = 'kind'` from template list and share-card modal pre-selection + tests | 0.5 | T5.1 |
| T6.1 | Starter loader, pack-to-starter map, contract test (skips missing files) | 1 | T1.1, T3.1 |
| T10.1 | Template lint (rendered output) + `pack-card-mounts` extension, against fixture templates | 1 | T1.6, T3.1 |
| T10.2 | `render-starter-proofs.ts` contact-sheet script | 1 | T2.3 |

### Milestone C — automation (U7)

| Task | Description | Est | Depends on |
|---|---|---|---|
| T7.1 | `draft-upsert`: copy template on create (switch on); refresh keeps document; mark for warnings render | 1 | T5.4 |
| T7.2 | `draft-render`: render-for-warnings at every enabled size; store per size; templated drafts ignore `slides` | 2 | T2.3, T7.1 |
| T7.3 | `card-sets.ts`: capacity-driven split for templated drafts; over-10 warning + tests | 1 | T1.2 |
| T7.4 | Sweep runs pending renders before promotion; promotion/auto-publish skip unrendered or warned drafts | 1 | T7.2 |
| T7.5 | Publish worker aborts on publish-time warnings; ad-hoc drafts from kind template; `designEditedAt` on design edits | 1 | T7.2 |

### Milestone D — editor and Studio (U8, U9)

| Task | Description | Est | Depends on |
|---|---|---|---|
| T8.1 | Template-mode page and route; load/save kind template with version conflict handling | 2 | T5.6 |
| T8.2 | Starter chooser with thumbnails; size tabs; add-to-other-sizes prompt (one undo step) | 1 | T8.1, T1.2 |
| T8.3 | Toolbar text styles (incl. letter spacing) for every text layer; font picker with search | 1 | T8.1, T4.2 |
| T8.4 | Field-token insert; rows panel (style one row, variants) | 2 | T8.1, T3.1, T1.6 |
| T8.5 | Preview data (latest draft or sample) + stress toggle + inline warnings; save-blocking rules | 1 | T8.1, T3.3, T2.1 |
| T8.6 | Apply dialog (count, reset warning, default Don't apply, progress, results, retry) | 1 | T8.1, T5.6 |
| T8.7 | Tablet touch (drag/resize/rotate, larger handles); phone message; dialog focus handling | 2 | T8.1 |
| T6.2 | "Export as starter" (platform admins) | 0.5 | T8.1 |
| T9.1 | Studio Templates section + retired-pack banner (switch-gated) | 1 | T5.6 |
| T9.2 | Remove canvas template builder and Save as template (switch-gated) | 0.5 | T8.1 |
| T9.3 | Queue "Needs a look" filter, badge, drawer reason, Edit design, Mark ready anyway | 1 | T7.2 |

### Design track (parallel, owner: Ash or a designer)

| Task | Description | Est | Depends on |
|---|---|---|---|
| D1 | Hand-design Club Kit starters, 21 kinds × 4 sizes, export, commit | ~20 hd | T6.2, T8.7 |
| D2 | Hand-design Broadcast starters, 21 kinds × 4 sizes (3 kinds from scratch) | ~20 hd | T6.2 |
| D3 | Contact-sheet review and fixes; remove contract-test skips | 2 | D1, D2, T10.2 |

### Release (after Phase 5)

| Task | Description | Depends on |
|---|---|---|
| R1 | Ash runs `0035_kind_templates.sql` in production | T5.1 |
| R2 | Republish with switch off; smoke check | R1 |
| R3 | Turn switch on for Halls Head; watch warnings and render time for one weekend | D3, R2 |
| R4 | Turn on for all clubs | R3 |

**Totals:** engineering ≈ 45 half-days (~4.5 weeks for one engineer); design track ≈ 42 half-days in parallel after T8.1/T6.2.

**Critical path:** T1.1 → T1.4 → T1.6 → T2.2 → … → T8.1 → T6.2 → D1/D2 → D3 → R3.

**Risks:** starter design throughput; render time per sweep after T7.4; tablet gesture work in T8.7 is the least-known estimate.
