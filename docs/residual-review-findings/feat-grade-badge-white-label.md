## Residual Review Findings

Source: `ce-code-review` run `review-20260715-100942` on branch `feat/grade-badge-white-label`

### P1 — Brand-precedence silently flipped

- **File:** `artifacts/api-server/src/lib/tenant-brand.ts:51`
- **Owner:** human
- **Detail:** The diff flips brand-field precedence from clubs-register-wins to tenant-row-wins for name, shortName, logoUrl, and all colours — a production behavior change bundled into a badge-style PR. Tenants seeded at onboarding will now permanently shadow live central updates.
- **Reviewers:** correctness, api-contract, adversarial

### P1 — /grade-meta endpoint has zero test coverage

- **File:** `artifacts/api-server/src/routes/grades.ts:408`
- **Owner:** downstream-resolver
- **Fix:** Add grades.test.ts covering central-read branch, native fallback, and gradeAbbr() branches.

### P1 — badgeStyle persistence in PATCH endpoints untested

- **File:** `artifacts/api-server/src/routes/tenant.ts:526`
- **Owner:** downstream-resolver
- **Fix:** Extend tenant-brand-update and platform-admin-brand test suites to assert badgeStyle round-trips.

### P2 — sortOrder from /grade-meta not wired into client sorting

- **File:** `artifacts/cricket-club/src/components/grade-badge.tsx:40`
- **Owner:** downstream-resolver
- **Fix:** Have sortGradesBySeniority accept an optional meta Map from useGradeMeta, falling back to static FALLBACK_META.

### P2 — Badge components and BadgeStylePicker have no tests

- **File:** `artifacts/cricket-club/src/components/badge-presets/index.ts:15`
- **Owner:** downstream-resolver
- **Fix:** Unit test badgeFontSize thresholds and BadgeStylePicker selection/disabled behavior.

### P2 — tenant-brand.test.ts hardcodes badgeStyle: 'shield' everywhere

- **File:** `artifacts/api-server/src/lib/tenant-brand.test.ts:18`
- **Owner:** downstream-resolver
- **Fix:** Add a test case with tenantRow.badgeStyle = 'pill' and assert pass-through.

### P2 — grade-badge.tsx badge-style whitelist fallback untested

- **File:** `artifacts/cricket-club/src/components/grade-badge.tsx:50`
- **Owner:** downstream-resolver
- **Fix:** Add component tests for PRESETS whitelist fallback and useGradeMeta merge precedence.
