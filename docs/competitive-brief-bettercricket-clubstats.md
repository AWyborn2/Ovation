# Competitive brief — BetterCricket & ClubStats

*Research date: 20 July 2026. Sources: live site content (betterat.cricket, clubstats.cricket) and public web search. Neither competitor has third-party reviews, analyst coverage, or visible funding/news beyond their own sites as of this date — both are small, founder-run Australian products.*

## 1. Executive summary

BetterCricket (formerly KlubPro) and ClubStats are both single-club, Australia-only SaaS products that turn a club's match data into a public stats website — the same surface-level pitch as Ovation. Neither, however, operates on a shared association-level database: both are sold and onboarded club-by-club, with each new club starting from a blank or manually-imported slate. That is Ovation's opening. The biggest threat is not feature parity — it's speed to market: both competitors already have live, self-serve paid signup (ClubStats has a working Stripe checkout on its homepage) while Ovation's billing is built but still inert.

## 2. Competitor profiles

### BetterCricket (betterat.cricket)

**Company overview.** Made by BetterSports; rebranded from "KlubPro" (per search results, likely earlier in 2026). Targets "Australian cricket clubs of any size, from premier grade to country and association clubs" — but the product itself is club-scoped, not association-scoped. Twitter handle @betterstatsau. No visible funding, headcount, or press coverage.

**Messaging analysis.** Tagline: *"Making your cricket club better."* Core value prop is automation and zero double-entry: stats "update automatically after every game" because the platform reads directly from PlayHQ and Cricket Australia. Tone is plain, benefit-led FAQ copy — no jargon, AU spelling, volunteer-friendly. The villain in their story is manual stats admin and spreadsheet drift; the hero is the volunteer/stats person who no longer has to maintain anything by hand.

**Product/solution positioning.** Modular platform: BetterStats (core — public site, player profiles, leaderboards, all-time records, season yearbooks, shareable stat cards) plus optional modules — BetterSelect (availability/selection), BetterSocials (match-day posts), BetterAdmin (fees/comms/merch), BetterIQ (analytics/opposition scouting), and BetterFantasyCricket (per search results, not detailed on-site). Direct PlayHQ/Cricket Australia data sync is their strongest technical claim — no CSV, no manual re-entry, figures always match official results. Historical backfill "as far as records exist," confirmed to 1975 for some clubs. Club retains full data ownership and CSV export.

**Content strategy.** Thin — mostly a single long FAQ-style homepage plus a few named subpages (features, modules, pricing, about, faq) that all currently render the same homepage content, suggesting the site is still being built out. Notably publishes an `/llms.txt` file — a deliberate move to be well-indexed by AI assistants/answer engines, which is a forward-looking SEO/AEO tactic.

**Strengths.** Real-time, zero-touch data sync directly from PlayHQ/Cricket Australia is a genuine technical edge — no import project, no CSV wrangling. Flat per-club pricing regardless of team count is simple to sell to committees. Fast setup claim (under an hour).

**Weaknesses.** Single-club only — no association or cross-club product. Site content is thin/repetitive across subpages, undermining the "trusted platform" narrative. No visible customer proof (logos, testimonials, club count). Pricing bundles ($949/yr for everything) is meaningfully more expensive than ClubStats' top tier once modules are added.

### ClubStats (clubstats.cricket)

**Company overview.** Built and owned by Sliema Labs Pty Ltd, founded by Anthony Spiteri — an explicitly founder-led, story-driven brand ("built by a cricket tragic"). Actively in early-adopter acquisition mode: "first 10 clubs, 3 remaining" discount language on the pricing page. Has three named partners, including one actual league (Perth T20 Cricket League) — the closest either competitor gets to an association-level relationship, though it reads as a sponsorship/referral partnership, not shared data infrastructure. Instagram and Facebook presence; no LinkedIn/Twitter found.

**Messaging analysis.** Tagline: *"Less admin, more stats, complete records."* Positions itself explicitly as "not a replacement for official competition management" (PlayHQ/Play Cricket) but as "a dedicated archive and presentation layer" for club history. The villain is spreadsheet/PDF sprawl and volunteer handover risk ("club knowledge does not disappear when a volunteer, laptop, or spreadsheet does"); the hero is the platform as permanent institutional memory. More emotionally pitched than BetterCricket — heavy emphasis on honour boards, life members, milestones, "the story behind the numbers."

**Product/solution positioning.** Single tier of features, priced by club size rather than by module: Small/Junior $199/yr, Medium (1–9 teams) $399/yr, Large (9+ teams) $599/yr, plus a time-limited Early Adopter rate of $249/yr with a lifetime 20% discount thereafter. All plans get the full feature set — no upsell modules. Historical import is CSV/Excel-first; PDF or legacy formats need a custom-quoted migration project. Play Cricket data comes in via a "layered" import path (manual CSV, team-mapped CSV, optional direct fetch, match import) rather than BetterCricket's always-on direct sync — meaningfully more manual. Team selection is listed as "coming soon," not live.

**Content strategy.** More developed than BetterCricket's: a dedicated "why ClubStats" page with a comparison table (ClubStats vs spreadsheets vs DIY) and a benefits checklist, a founder-story About page, and a Partners page. This is real competitive-positioning content, not just FAQ copy — ClubStats is explicitly selling against "spreadsheets and self-managed records," not against other platforms.

**Strengths.** Clearer content marketing and differentiation-vs-status-quo argument. All-inclusive pricing (no module upsells) is easier for a committee to understand and budget. Working self-serve checkout (Stripe) live on the site today. Founder narrative builds trust with a skeptical volunteer-run-club audience.

**Weaknesses.** Manual/staged data import (vs BetterCricket's live sync) means more admin burden at exactly the point ClubStats claims to remove admin burden. Team selection not yet shipped. Very early-stage signals (first 10 clubs) suggest thin current customer base. PDF/legacy import triggers a "custom quote" — friction and unpredictable cost for clubs with older, messier records, which describes most of the clubs Ovation is targeting via the PCA database.

## 3. Messaging comparison matrix

| Dimension | Ovation | BetterCricket | ClubStats |
|---|---|---|---|
| Primary tagline | White-label club history platform, powered by association data | Making your cricket club better | Less admin, more stats, complete records |
| Target buyer | Cricket associations (top-down) and their member clubs | Individual club (stats volunteer/committee) | Individual club (committee, volunteer stats owner) |
| Onboarding model | Instant — full multi-decade history pre-populated from the shared association database | Club-initiated PlayHQ/CA sync + manual historical layering | Club-initiated CSV/Excel import; paid custom project for PDF/legacy data |
| Key differentiator | Association-wide shared database; cross-club player careers; club lineage/mergers | Live, zero-touch sync direct from PlayHQ/Cricket Australia | Archive/presentation layer, explicitly scoped away from competition management |
| Content moat | Curated tenant content (honour boards, life members, awards, caps) layered on top of central stats | Records, partnerships, awards (club-level) | Honour boards, milestones, life members (club-level) |
| Tone/voice | Not yet public-facing | Plain, automation-first, volunteer-friendly | Story-led, founder-voiced, nostalgic/preservation-focused |
| Pricing model | Not yet public (plan entitlements built, dormant) | Flat per-club, modular ($399–$949/yr) | Tiered by club size ($199–$599/yr), all-inclusive |
| White-label | Roadmap target: custom domain, no vendor branding | Club skinning (colours/crest/sponsors) on betterat.cricket | Club subdomain (club.clubstats.cricket), ClubStats-branded |

## 4. Content gap analysis

Both competitors publish "why not spreadsheets" and FAQ-driven content aimed at the same volunteer/committee buyer Ovation will eventually need to convince. Ovation currently has no public marketing site to compare against — that itself is the gap. Specific angles neither competitor owns that Ovation should:

- **Association/league buyer content.** Neither site has a page aimed at an association (like PCA) evaluating a platform for its member clubs — both are written entirely to a single club's committee. This is wide open.
- **Cross-club player career.** Neither mentions what happens to a player's stats when they transfer clubs — both are architecturally club-scoped, so this literally isn't a feature they can claim.
- **Club lineage / mergers / name changes.** ClubStats talks about "premiership teams, life members, first XI captains" but not about clubs that have merged, renamed, or moved grades over decades — a real feature of Ovation's `club_name_history`/lineage model.
- **Zero-cost historical onboarding.** ClubStats explicitly monetises messy historical data as a "custom quote" migration project; BetterCricket is vaguer ("as far as records exist"). Ovation's story — full history already there, no import project, no quote — is a stronger and more concrete claim than either.

## 5. Opportunities

- **Sell to the association, not just the club.** Neither competitor has a top-down go-to-market. If Ovation can activate every PCA club at once through the association relationship, it sidesteps the club-by-club sales grind both competitors are currently doing (note ClubStats is literally still counting down "3 early-adopter spots left").
- **"Already there" as the headline claim.** Both competitors' biggest selling point is removing admin going forward; neither can credibly say "your full history is already loaded." That's a one-sentence positioning line Ovation can own outright.
- **True white-label / custom domain.** Both competitors keep their own brand in the URL (`betterat.cricket`, `club.clubstats.cricket`). A club-branded custom domain is a differentiator once Ovation ships it.
- **Multi-club league/association features** (shared ladders, premiership honour boards across grades, cross-club records) — ClubStats' Perth T20 Cricket League partnership shows there's buyer appetite here, but it's a sponsorship relationship, not a product capability. Ovation's central schema already supports this natively.

## 6. Threats

- **They're live and selling; Ovation isn't yet.** ClubStats has a working Stripe checkout in production today. Ovation's entitlements and billing code exist but are dormant/inert per current build status. Every month that gap persists is a month a PCA club could sign with a competitor instead.
- **BetterCricket's direct PlayHQ/Cricket Australia sync is a real technical edge** on the one thing every club cares about — not touching a spreadsheet. If Ovation's own PlayHQ integration stays scrape-based rather than partner/API-based (per the CLAUDE.md data-governance constraint), BetterCricket can credibly claim a lower-friction, more "official" pipeline. This is worth flagging as a genuine product risk, not just a marketing one.
- **ClubStats is already building association-adjacent trust** through its Perth T20 Cricket League partnership — a competitor could get there before Ovation formalises its own association relationships.
- **Low switching cost works against Ovation too.** If a PCA club impulse-signs with BetterCricket or ClubStats for ~$200–$950/yr before Ovation reaches self-serve, they now have sunk cost (site live, players used to the URL) that makes a later Ovation pitch harder, even though Ovation could offer them richer history for less setup effort.

## 7. Recommended actions

**Quick wins (this week):**
- Draft a one-line positioning statement built around "your full club history, already there — not another import project" and test it in any PCA club conversations happening now.
- Check whether Ovation's PlayHQ data pipeline can be described publicly without tripping the non-commercial data-governance constraint in CLAUDE.md — if not, that's a blocker to messaging against BetterCricket's live-sync claim, not just a nice-to-have.

**Strategic moves:**
- Prioritise getting Phase 2 billing/entitlements out of "dormant" so Ovation can move at competitor speed once a PCA club is ready to convert.
- Build one piece of association-facing content (a one-pager or landing section) explicitly aimed at PCA (or a future association) as the buyer, not the club — a gap neither competitor fills.
- When public marketing content exists, put cross-club player careers and club lineage/mergers front and center — features that are structurally impossible for either competitor to match without rebuilding their data model.

Would you like me to:
- Turn section 6 into a one-page battlecard for PCA/club conversations?
- Draft the association-facing one-pager positioning line from the opportunities section?
- Set up a recurring check (e.g. quarterly) on both competitors' pricing and feature pages?
