# Battlecard — BetterCricket & ClubStats

*For PCA/club conversations. Last updated 20 July 2026 — refresh quarterly (see monitoring note at bottom).*

## Quick overview

| | BetterCricket (betterat.cricket) | ClubStats (clubstats.cricket) |
|---|---|---|
| What they do | Single-club stats site, synced live from PlayHQ/Cricket Australia | Single-club stats archive, imported from CSV/Excel |
| Target customer | Any single AU cricket club | Any single AU cricket club (junior → 9+ team) |
| Pricing | $399/yr core, $949/yr full bundle (flat per club) | $199–$599/yr by club size ($249 early-adopter rate, limited spots) |
| Recent developments | Rebranded from KlubPro; publishing `/llms.txt` for AI search | Early-adopter push ("3 spots left"); Perth T20 Cricket League partner |

## Their pitch

**BetterCricket:** "Making your cricket club better." Zero-touch automation — stats update themselves because the platform reads directly from official PlayHQ/Cricket Australia data, so there's never manual re-entry.

**ClubStats:** "Less admin, more stats, complete records." A permanent, club-owned archive that survives volunteer turnover — the antidote to spreadsheets, PDFs, and lost institutional memory.

## Where they're strong (be honest)

- **BetterCricket's direct PlayHQ/Cricket Australia sync** is real and live today — no CSV, no import step, figures always match official results. This is their best card and the one to take most seriously.
- **ClubStats' content and positioning are sharper.** Their "why ClubStats" page argues against spreadsheets specifically, with a real comparison table — better content marketing than BetterCricket's thin FAQ-only site.
- **ClubStats has working self-serve checkout** (Stripe, live on the homepage) and all-inclusive pricing that's easy for a committee to approve without haggling over modules.
- Both are already signing clubs — this isn't vaporware, it's live competition for the same PCA-affiliated committees.

## Where they're weak

- **Neither operates on a shared association database.** Every club onboards from scratch: BetterCricket via live sync plus manual historical layering, ClubStats via CSV/Excel import (PDF/legacy records need a paid custom-quoted migration project). A PCA club moving to either still does an import project.
- **Neither has a cross-club player career view.** A player who's turned out for three PCA clubs over 15 years gets three separate, disconnected profiles — the data models are club-scoped, not association-scoped.
- **Neither handles club lineage** — mergers, renames, amalgamations that are common in decades-old associations like PCA. Ovation's `club_name_history`/lineage model is architecturally something neither can replicate without rebuilding.
- **Neither is genuinely white-label.** Clubs get a themed page under the vendor's own domain (`betterat.cricket` or `club.clubstats.cricket`), not a fully club-branded, custom-domain product.
- ClubStats' team selection is listed as "coming soon" — not shipped.

## Our differentiators

1. **Your history is already there.** For any PCA-affiliate club, decades of match history — every player, every match, every season — is already structured in the central database before the club even signs up. No CSV, no import project, no "custom quote" for old records.
2. **Careers follow the player, not the club.** A player's stats travel with them across every PCA club they've represented, in one profile — impossible for either competitor's club-scoped data model.
3. **Club lineage is preserved.** Amalgamated, renamed, and historic clubs keep a connected record instead of a broken one.
4. **Curated content stays the club's own.** Honour boards, life members, awards, and records are tenant-owned and sit on top of the shared stats layer — the same "institutional memory" pitch ClubStats makes, but without the club having to rebuild the underlying stats history first.
5. **True white-label, not a themed subdomain** (roadmap: custom domain, no vendor branding).

## Objection handling

| If the prospect says... | Respond with... |
|---|---|
| "BetterCricket already syncs automatically from PlayHQ, why would we switch?" | "That solves the season ahead. It doesn't solve the twenty seasons behind you — you'd still be starting your history from zero. Ours is already loaded." |
| "ClubStats is cheaper and just launched, we could be an early adopter there too." | "Their early-adopter pricing gets you a blank slate at a discount. You'd still pay separately to migrate old records, and the price reverts after year one. We start you with your full history already in, association-wide." |
| "We've heard ClubStats has a nicer story / founder is a cricket person." | "Fair — their content is genuinely good. But it's still one club's archive. We're the only one of the three built around the association's shared history, not just a single club's." |
| "Can't we just wait and see how these mature?" | "Every month a club signs with either one is a month of sunk cost — a live URL, players used to checking it — that makes switching later harder, even though we'd give them more with less setup." |

## Landmines to set (ask early)

- "How much of your club's pre-digital history — old scorebooks, PDFs, honour boards — do you actually want online, and who's going to key that in?"
- "Do any of your players also turn out for other PCA clubs — juniors moving up, transfers, dual-registered players? Where would you want their full career to live?"
- "Has your club ever merged, renamed, or changed grades significantly? How is that history currently connected to today's club?"

## Win/loss watch-outs

- Expect to lose deals where a club just wants "a website that updates itself this season" and doesn't care about historical depth — BetterCricket's live sync wins that conversation on convenience alone.
- Expect to lose deals to ClubStats on price/story alone if Ovation isn't self-serve yet — a committee that's ready to buy today won't wait for us to finish billing.
- Expect to win once the pitch reaches an association-level conversation rather than a single club — neither competitor has an answer for "what about all our clubs at once."

---
*Maintenance: review quarterly, and immediately after either competitor announces new pricing, modules, or association/league partnerships. A quarterly monitoring check has been scheduled (see below) — refresh this card and the underlying brief when it reports changes.*
