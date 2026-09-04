# Platform Admin SaaS Features — Session Handover

## Context

Ovation is a white-label cricket stats platform. The Platform Admin console (`/platform-admin`) manages tenants — cricket clubs that each get their own branded subdomain. We're preparing for a full 27-club PCA (Peel Cricket Association) rollout with a free tier first, upselling to paid plans later.

## What was done this session

1. **Diagnosed and fixed the branding save bug.** `buildTenantBrand()` in `artifacts/api-server/src/lib/tenant-brand.ts` gave the `clubs` register row priority over the `tenants` row. Admin edits in the platform console saved to `tenants` but were immediately shadowed by non-null values from the `clubs` register. Fixed by flipping the precedence — tenant columns now win, clubs register is the fallback seed. Two new tests added verifying the fix. Committed on `feat/grade-badge-white-label` as `badbfbe`.

2. **Wrote a requirements-only plan** at `docs/plans/2026-07-15-001-feat-platform-admin-saas-features-plan.md`.

## What needs to be built (prioritised)

### Must-build (blocks 27-club rollout)

- **Tenant health dashboard** — Add `last_active_at` to the `tenants` table (updated on authenticated requests). Tenant list shows: last-active timestamp, data source status, branding completeness, admin count. Sortable/filterable.
- **Email-based admin onboarding** — Replace copy-paste reset links with actual email delivery. Needs an email provider decision (Resend / SendGrid / SES).
- **Tenant suspension/archival** — Add `suspended_at` column to tenants. Suspended tenants show an "unavailable" page. Platform admin can suspend/restore from tenant detail. Data preserved.

### Should-build (quality-of-life for scale)

- **Audit log** — `platform_audit_log` table tracking plan changes, branding edits, admin resets, provisioning, suspension. Viewable per-tenant and globally.
- **Entitlements enforcement polish** — Wire existing `EntitlementGate` components to show upgrade prompts on free tier. The entitlements system is built but all-pass-through (except custom domains). No Stripe needed yet — prompts can link to "contact us".
- **Bulk provisioning** — Provision all 27 PCA clubs at once from the central register instead of one-by-one.
- **Platform-wide admin directory** — All club admins across all tenants in one searchable view.

### Build later

- Real Stripe integration, custom domain DNS verification, self-serve upgrades, data export, multi-association support.

## Key files to know

| Area                  | File                                                            | Notes                                                                                                            |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Brand resolver        | `artifacts/api-server/src/lib/tenant-brand.ts`                  | `buildTenantBrand()` — just fixed precedence                                                                     |
| Brand tests           | `artifacts/api-server/src/lib/tenant-brand.test.ts`             | 14 tests including precedence coverage                                                                           |
| Tenants schema        | `lib/db/src/schema/tenants.ts`                                  | Columns: slug, central_club_id, app_club_id, name, short_name, logo_url, favicon_url, colours, plan, badge_style |
| Platform Admin routes | `artifacts/api-server/src/routes/platform-admin.ts`             | CRUD for tenants, branding, admin resets                                                                         |
| Platform Admin UI     | `artifacts/cricket-club/src/pages/platform-admin/`              | tenants-list, tenant-detail, provision, branding-card                                                            |
| Entitlements          | `artifacts/api-server/src/lib/entitlements.ts`                  | Plan tiers + feature matrix, `BILLING_ENABLED` flag                                                              |
| Billing (dormant)     | `artifacts/api-server/src/routes/billing.ts` + `lib/billing.ts` | Stub provider, returns `{disabled: true}`                                                                        |
| Tenant middleware     | `artifacts/api-server/src/middlewares/tenant-context.ts`        | Resolves tenant per-request                                                                                      |
| Provisioning          | `lib/db/src/provision.ts`                                       | Shared by concierge + self-serve signup                                                                          |

## Open decisions

1. **Email provider** — Resend (simple DX), SendGrid (proven), or SES (cheapest)?
2. **Suspension UX** — branded "unavailable" page or generic Ovation-branded?
3. **Audit log retention** — indefinite or auto-prune?
4. **Bulk provisioning admin bootstrap** — clubs without admins first, or require email per club?

## Prompt for new session

```
I'm working on the Ovation Platform Admin SaaS features. Read the plan at docs/plans/2026-07-15-001-feat-platform-admin-saas-features-plan.md and the handover at docs/plans/2026-07-15-001-feat-platform-admin-saas-features-handover.md.

Start with the first must-build item: the tenant health dashboard. Add `last_active_at` and `suspended_at` columns to the tenants table, update the tenant list to show health indicators (last active, branding completeness, admin count), and make the list sortable/filterable by these.
```
