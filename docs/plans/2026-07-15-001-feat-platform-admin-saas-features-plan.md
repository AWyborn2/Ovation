---
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
title: Platform Admin SaaS Features - Plan
date: 2026-07-15
---

# Platform Admin SaaS Features - Plan

## Goal Capsule

**Objective:** Evolve the Platform Admin console from a concierge provisioning tool into a production SaaS operations hub capable of supporting the full 27-club PCA rollout — covering tenant health visibility, scalable admin onboarding, operational safety (suspension/archival), audit trails, entitlement enforcement, and bulk provisioning.

**Product authority:** Platform Admin (super-admin console at `/platform-admin`); tenant-facing branding and plan features; entitlements gating system.

**Open blockers:** Branding precedence bug (tenant-saved branding shadowed by clubs register — fix in progress). Email delivery infrastructure not yet chosen.

---

## Product Contract

### Problem

The Platform Admin was built for concierge-onboarding 2–3 pilot clubs. At 27 clubs:

- **No visibility** — no way to see which tenants are healthy, set up, or stalled.
- **Admin onboarding is manual** — reset links are copy-paste; club secretaries can't self-serve.
- **No operational safety net** — no way to suspend a problematic tenant without deleting data.
- **No audit trail** — at scale with multiple admins per club, "who changed what" is invisible.
- **Plans are decorative** — badges show but gate nothing; no path to revenue.
- **Provisioning doesn't scale** — one-by-one wizard for 27 clubs is tedious.

### Users

- **Platform operator (Ash)** — manages all tenants, provisions clubs, monitors health, handles support.
- **Club administrators (secretaries)** — receive onboarding emails, manage their club's branding and content.
- **Club members (end users)** — indirectly affected by branding, plan-gated features, and tenant health.

### Success Criteria

1. Platform operator can see at a glance which of 27 tenants are set up, active, and healthy.
2. Club admins can be onboarded via email without operator intervention beyond initial provisioning.
3. A tenant can be suspended and restored without data loss.
4. Every plan change, branding edit, and admin action has a timestamped audit record.
5. Entitlements visibly gate premium features on the free tier with upgrade prompts.
6. All 27 PCA clubs can be provisioned in a single bulk operation.

### Scope

#### Must-build (blocks rollout)

- **Fix branding precedence** — tenant-saved branding wins over clubs register seed in `buildTenantBrand()`. *(Fix in progress.)*
- **Tenant health dashboard** — add `last_active_at` to tenants table (updated on any authenticated request). Tenant list shows: last-active timestamp, data source status, branding completeness (has logo + colours), admin count. Sortable/filterable by health indicators.
- **Email-based admin onboarding** — when platform admin creates or resets a club admin, send an email with the reset link instead of (or in addition to) displaying it in the console. Requires choosing an email provider (Resend, SendGrid, SES, or similar).
- **Tenant suspension** — add `suspended_at` column to tenants. Suspended tenants return a "This site is temporarily unavailable" page. Platform admin can suspend/restore from tenant detail. Suspension preserves all data.

#### Should-build (quality-of-life for scale)

- **Audit log** — `platform_audit_log` table: `id, tenant_id (nullable), actor_type (platform_admin|club_admin), actor_id, action, metadata (jsonb), created_at`. Log: plan changes, branding edits, admin resets, tenant provisioning, suspension/restoration. Viewable per-tenant in tenant detail and globally in a new audit page.
- **Entitlements enforcement polish** — wire the existing `EntitlementGate` components to show upgrade prompts on free tier for: social studio, clubroom TV, mobile app, curation tools. Stripe not required — prompts can link to a "contact us" or future checkout flow.
- **Bulk provisioning** — new page or modal: select multiple unclaimed PCA clubs from the central register, provision all at once with auto-generated slugs. Each gets a free-tier tenant with no admin (admin bootstrapped separately).
- **Platform-wide admin directory** — new page listing all club admins across all tenants, searchable, showing: name, email, tenant, last login. Useful for support and orphan detection.

#### Build later (revenue + expansion)

- **Real Stripe integration** — connect the existing `BillingProvider` to Stripe. Checkout sessions, webhook processing, plan upgrades/downgrades with entitlement sync.
- **Custom domain verification** — DNS TXT record check + SSL provisioning UI. Currently a plain text field with no verification.
- **Self-serve plan upgrades** — upgrade button within club admin dashboard (not just platform console).
- **Data export** — tenant data portability endpoint for compliance/churn scenarios.
- **Multi-association support** — Phase 3 from roadmap. Not PCA-rollout-critical.

### Out of Scope

- Mobile app changes (Expo) — platform admin is web-only.
- Central database schema changes — reads-only, no writes.
- Player identity crosswalk improvements — separate workstream.
- RLS enforcement — valuable but not blocking rollout; app-layer isolation is tested and working.
- Marketing/landing page redesign.

### Outstanding Questions

1. **Email provider choice** — Resend (simple, good DX), SendGrid (proven at scale), or SES (cheapest)? Decision needed before admin onboarding work starts.
2. **Suspension UX** — should suspended tenants show a branded "unavailable" page (using their own logo/colours) or a generic Ovation-branded one?
3. **Audit log retention** — keep indefinitely, or auto-prune after N months?
4. **Bulk provisioning admin bootstrap** — provision clubs without admins and add admins later, or require an admin email per club during bulk provisioning?
