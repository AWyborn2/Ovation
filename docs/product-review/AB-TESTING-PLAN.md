# Ovation — A/B Testing Plan & Multi-Club Tester Panel

Part of the July 2026 product review. Two halves:

1. **Executed now:** an 11-club tester panel sweep — every club named for the pilot was
   provisioned as a real tenant and a tester walked its site comparing every rendered stat
   against direct SQL on the database (results below).
2. **Designed for launch:** realistic experiments for live traffic, with an honest read on
   what club-scale traffic can and cannot support statistically.

---

## Part 1 — 11-club tester panel (executed)

**Method.** The 11 clubs (Halls Head, Mandurah, White Knights, Shoalwater Bay, Secret Harbour,
Waroona, Pinjarra, South Mandurah, Rockingham Hornets, Warnbro Swans, Singleton Irwinians) were
provisioned as tenants through the production `provisionTenant` path against a stand-in central
PCA database (deterministic generator: `evidence/generate-central.mjs`; internally consistent —
670 innings validated, batting sums, wickets and bowling credits all reconcile to the published
scores). Tenants 2–11 read stats from the central schema filtered by club id; Halls Head (tenant 1)
runs native reads. Each club's site was walked by a tester on its own subdomain
(`<slug>.ovation.test`) with production-style host routing; every stats surface was compared to
direct SQL ground truth.

**Results:** see `PANEL-RESULTS` section placeholder — filled from
`evidence/club-sweep-1/findings.md` and `evidence/club-sweep-2/findings.md`.

<!-- PANEL-RESULTS -->

---

## Part 2 — Live-traffic experiment designs

### The statistical reality check (read first)

A PCA club site's realistic traffic is **hundreds of visitors a month, not hundreds of
thousands**. A classic two-variant A/B test detecting a 20% relative lift on a 10% baseline
conversion needs ~3,000–4,000 visitors *per arm*. At pilot scale that is **6–18 months per
experiment** — untenable. Therefore:

- **Visitor-level A/B tests** are reserved for the *aggregate platform funnel* (marketing site
  + signup), where traffic pools across all clubs.
- **Club-facing changes** use qualitative methods: moderated walkthroughs (feedback pack),
  task-completion timing, and *sequential* rollouts (ship to 3 clubs, watch a leading indicator
  2 weeks, roll on/back). Bayesian or sequential analysis over fixed-horizon testing.
- **Kill criteria** are defined before each experiment starts.

### Instrumentation gap (blocker)

The app currently ships **no product analytics** — no page-view events, no funnel steps, no
admin-action telemetry (only server request logs via pino). Before ANY experiment:

1. Add a lightweight, privacy-respecting analytics layer (self-hosted Plausible/Umami class,
   or PostHog if session replay is wanted), keyed by tenant.
2. Emit the canonical funnel events: `landing_view`, `signup_started`, `club_selected`,
   `slug_chosen`, `signup_completed`, `first_admin_login`, `first_curated_item_added`,
   `public_share_first` (the activation chain), plus `page_view` with page-type dimension.
3. Respect `is_private` and avoid PII in events.

### Experiment 1 — Signup wizard: club-first vs value-first
- **Hypothesis:** showing the club's real data preview ("here's YOUR 2014 premiership team")
  *before* asking for account details lifts signup completion.
- **Variants:** A = current (pick club → slug → account); B = pick club → live preview page of
  that club's actual stats → slug → account.
- **Primary metric:** `signup_completed / signup_started`. Guardrail: time-to-complete < 5 min.
- **Scale:** platform-level (pooled traffic), sequential analysis, minimum 200 starts per arm.

### Experiment 2 — Landing page hero: "your history" vs "your brand"
- **Hypothesis:** leading with the loaded-history value prop ("24 seasons, already online")
  out-converts the white-label/branding value prop.
- **Variants:** hero copy + imagery only. **Metric:** `signup_started / landing_view`.
- Pooled platform traffic; 2-week sequential windows.

### Experiment 3 — Empty-state activation nudges (club admin)
- **Hypothesis:** empty curated sections that show a 1-click "add your first…" CTA (vs a bare
  empty state) increase `first_curated_item_added` within 7 days of provisioning.
- **Variants:** per-tenant assignment at provision time (tenant is the unit — fine at n≈small
  only as a directional signal; treat as staged rollout with before/after telemetry, not a
  significance test).
- **Metric:** activation rate (≥1 curated item in week 1); secondary: items added in 30 days.

### Experiment 4 — Public page engagement: leaderboard density
- **Hypothesis:** a compact default leaderboard (top 10 + expand) beats the full table for
  mobile scroll-depth and player-detail click-through.
- **Variants:** per-session assignment on public pages (pooled across clubs — the component is
  identical per tenant, so pooling is valid). **Metric:** player-detail CTR from leaderboards;
  guardrail: no drop in time-on-page for desktop.

### Experiment 5 — Clubroom TV rotation content mix
- **Qualitative/rotational:** vary honours-vs-live-stats mix per week per venue; measure via
  bar-staff/committee feedback (feedback pack Q-batch), not analytics.

### Operating cadence

- One platform-funnel experiment live at a time (traffic is scarce — don't split it).
- Club-facing changes: walkthrough-test with 3 clubs from the feedback pack before any rollout.
- Every experiment logged in a one-page decision doc: hypothesis, variant screenshots, dates,
  result, decision (ship/kill/iterate).
