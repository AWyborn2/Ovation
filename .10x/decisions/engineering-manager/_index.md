# engineering manager — Index

Cross-cutting notes for this role. Entries tagged [CONFIRMED 2026-10-07] were discovered in the codebase and confirmed by the user.

## Active features

- [social-auto-queue-criteria](social-auto-queue-criteria.md)
- [card-kind-templates](card-kind-templates.md)
- [selection-hub-decoupling](selection-hub-decoupling.md) — PR0 foundation then PR1–PR3 in parallel sessions (planned 19 Oct 2026)
- [selection-side-size](selection-side-size.md) — PR A foundation (migration 0049, shape helper), then PR B size + PR C overseas in parallel, then PR D cards/public; ~15 hd (planned 20 Oct 2026)
- [match-day-carousel-content](match-day-carousel-content.md) — P0 preview fix + P1 names now (parallel), P2 content contract foundation, then P3–P6 in parallel (≤2), P7 other kinds, P8 new pack, P9 retire packs; ~36 hd; migrations 0050–0053 (planned 20 Oct 2026)
- [selection-hub-redesign](selection-hub-redesign.md) — 2 sequential PRs (layout T1.1–T1.7, interaction T2.1–T2.7), client only, no migration (Planning complete 21 Oct 2026)
- [social-template-library](social-template-library.md) — slices L1–L9 in four streams (at most four sessions), all PRs into `wyborn21/social-template-library-pm`; structured-output spike now; all seven looks gate the single merge; Ash tests at milestones M1–M5; migration 0058 (0057 went to #412) by hand right before the republish; ~150 hd, critical path ~45 hd (Planning complete 21 Oct 2026)

## Cross-cutting principles

- Long-lived integration branches: sync `main` in before each milestone, take migration numbers late and renumber at each sync, and keep `.10x/status.md` out of slice PRs when several sessions run at once (milestone sync PRs update it).
- With parallel sessions, name an owner for each shared file (OpenAPI spec, harness, renderer modules) before work starts; the second PR to merge rebases and regenerates codegen.
