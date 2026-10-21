# Social template library: many designs per card kind, shared across clubs

Status: APPROVED 2026-10-21 by Ash; scope revised the same day (motion, AI, imports, paid
looks: decisions 10–13). Awaiting architect design.

Follows: `match-day-carousel-content.md` (revision of 21 Oct 2026: Gold Foil, Bold Type, Neon
Night and Sunset are hidden pending this library) and `card-kind-templates.md` (ADR-001..003:
templates as layer documents on the blank base).

## Problem

A club can only post in the few looks Ovation has built in code: Club Kit, Broadcast Dark and,
after P8, Duotone. Every Ovation club posts the same designs in its own colours, so no club looks
like itself. Admins who want something different rebuild cards by hand in Canva and retype the
scores, which defeats the automation. Ovation can't add a design without writing a pack in
TypeScript, so the four hidden packs can't come back cheaply either. Ash's Canva screenshot
shows the target: many designs over the same data slots, ready to use or edit.

Real today (Ash, 21 Oct 2026): clubs look alike; admins still use Canva; new designs need code.
Not chosen: "feeds look samey" (week-to-week variety is not the goal).

## Target user

- Primary: each club's volunteer social admin. They pick a look once, automation uses it, and
  they can still choose another template for a single post.
- Secondary: Ovation designers, who add templates and convert the packs without code changes.
- Later (release 2): club admins who design a card from scratch and publish it for every club.
- Followers see the result: cards that look like their club.

## What exists today [CONFIRMED in code 2026-10-21]

There are two template systems, and the library has to end up on one.

1. **Code-built packs on the ADR-010 content contract.** Club Kit and Broadcast Dark (Duotone
   in P8) read `CardContent` plus the visible field set (`@workspace/scorecard/card-content`).
   Each pack declares slots and capacity per size and preset (`pack-templates/content-layouts.ts`),
   and a CI fit grid checks every pack, preset and size. Every carousel and the four content
   kinds (`matchDay`, `results`, `matchSummary`, `teamList`) use these.
2. **Card kind templates (ADR-001..003).** These are layer documents on the blank base, edited at
   `/admin/social/templates/:kind`, one per club per kind, versioned, with drafts holding a
   copy. They come from three starters (Club Kit, Broadcast, Clubhouse) covering every kind in
   `TEMPLATE_CARD_KINDS`, and a warnings gate keeps cards that don't fit out of automation. The
   `KIND_TEMPLATES` switch is **on for one pilot club in production** (Ash, 21 Oct 2026).

## Decisions (Ash, 21 Oct 2026)

1. **Authoring, full vision.** Ovation builds the library. A club can use any template as it is,
   or edit its own copy to make its own look. A club can also design from scratch, and when it
   publishes, that design becomes a template other clubs can use or build on.
2. **Sharing.** A published club template is visible to **every Ovation club**, across
   associations. There is no association-only or private-publish tier. A club's own copies and
   unpublished designs stay private to that club.
3. **Moderation.** Automatic checks, then live. A club template is listed once it passes the fit
   check at every size and preset and the club's logo, photos, sponsors and name have been
   swapped for data slots. Ovation can unlist any template afterwards. No approval queue.
4. **Unit.** A template designs **one card kind** (for example Match Summary) at every size.
   Templates that share a style are grouped into a **look**, so a club can adopt a whole look at
   once or mix designs across kinds. Today's packs become looks.
5. **Auto-queue.** One **default template per kind** per club. Adopting a look sets the default
   for every kind the look covers; kinds it doesn't cover keep their current default. There is
   no rotation and no per-grade rule. A manual post or carousel can use any template for that
   one post without changing the default.
6. **Updates.** Using a template gives the club **its own copy**, tied to the version it came
   from. When the author updates the template, the club sees "update available" and chooses
   whether to take it. Unlisting or deleting a template never breaks a club's copy.
7. **First content.** A **converter plus designer polish**. One tool renders each code-built pack
   at every kind, size and preset and writes it out as a template; a designer fixes whatever
   didn't convert cleanly, and the fit check must pass before listing. It converts Club Kit,
   Broadcast Dark, Duotone, Gold Foil, Bold Type, Neon Night and Sunset. The existing layer
   starters (Club Kit, Broadcast, Clubhouse) go in as they are. After parity the code-built packs
   retire and one template format remains.
8. **Pilot carry-over.** The pilot club's kind templates become its own private copies and stay
   its defaults. Its cards must not change on the day the library ships.
9. **Scope.** Staged.
   - Release 1 is the library: Ovation and converted content, browse, use, edit a copy, looks
     and defaults.
   - Release 2 adds publishing from scratch, then style tags, sorting and favourites.
   - Release 3 adds full motion; release 4 adds premium looks (decisions 10 and 13).

## Decisions, revised scope (Ash, 21 Oct 2026)

My first defaults ruled out motion, AI, imports and paid templates. Ash reviewed them and set
these instead.

10. **Motion.**
    - Release 3 adds **full motion templates**: a per-layer timeline, loops, and video-first
      designs for Reels and Stories.
    - Release 1 keeps **parity**: every pack's current motion survives conversion, so nothing
      regresses. The R1 format must leave room for the timeline, so R3 needs no format change.
    - When a club's default template has motion, automatic publishing posts **video where Meta
      allows** (a feed video or Reel). Otherwise it posts a still of the final frame. This needs
      Meta's video permissions in App Review.
11. **AI-generated designs.**
    - Clubs integrate nothing. Ovation connects one model provider on its own server and pays
      for it.
    - A brief, a reference image, or both go in. Out comes an editable template (layers, styles,
      slot tokens), not a picture. It is fit-checked, sent back to the model with its warnings for
      a retry or two if it fails, and lands as a private draft.
    - Release 1: an internal designer tool to fill the library faster.
    - Release 2: club-facing **Generate**, beside design-from-scratch, with a monthly cap per
      club. It ships only once the designer tool clears a quality bar (PM default: at least 70%
      of the first 50 generated drafts pass the fit check first time).
    - Generation uses sample data only, so no player data reaches the provider. Junior photos are
      blocked from reference images.
12. **Imports.**
    - **Canva** comes in through the AI reference-image path: a Canva export becomes an editable
      template. There is no direct Canva connection, because Canva's API exports only flat images.
      Uploaded-background templates stay as the quick "image plus data slots" route.
    - **Figma** gets a direct import (Figma's API gives exact positions and text styles).
      Ovation designers use it in release 1 through Ovation's own Figma connection. In release 2
      a club can connect its own Figma account and import into a private draft.
13. **Paid looks.**
    - Some Ovation-made looks become **premium**, available only on paid plans through the
      dormant `entitlements.ts`. Club-made templates are always free, and there is no club
      marketplace.
    - This is a later release (4). It starts only once the data-licensing hold lifts
      ([PR #290](https://github.com/AWyborn2/Ovation/pull/290) is still a draft) and billing is
      live.

## Browsing (full version; release split under Prioritisation)

- Previews are drawn in the browsing club's own data: its colours, crest, photos and latest real
  card of that kind (last Saturday's result, this weekend's fixtures). With no real data yet,
  they fall back to the kind's sample in the club's identity.
- Filter by card kind and size: only templates that cover that kind and size are shown.
- Style tags (dark or light, photo-led or no photo, bold or minimal), set by the author and
  checked on publish.
- Sort by popular, new, or Ovation-made versus club-made, and save favourites to a shortlist.
- Each template shows its look, its author ("Ovation" or the club's name) and how many clubs use
  it.

## Template rules (every template, Ovation-made or club-made)

- Binds to the card-content slots of its kind (ADR-010 field catalogue). Core fields always
  show; optional fields follow the club's preset and toggles.
- Declares capacity per size and preset (fixtures per junior day slide, rows per list) so the
  set planner can split carousels as it does today.
- Passes the fit check at every size it covers and every preset: no truncated names and no
  overflow with worst-case content. A listed template covers all four sizes. A club's private
  copy may cover fewer, and automation skips the sizes it lacks (the warnings gate).
- Carousel kinds include their page types: Match Day title, fixture, junior day and sponsors
  pages; results and match summary day pages.
- Juniors isolation and private-player rules are enforced at render, never trusted to the
  template (ADR-001). A published template carries no photos, only photo slots.

## Prioritisation

### Release 1: the library

- **P0** One template format. The content kinds become layer documents bound to `CardContent`
  slots, with preset visibility and declared capacity, so the content contract and the kind
  templates are one model.
- **P0** An automatic fit check per template that does the CI fit grid's job on data: every size,
  every preset, worst-case content. It runs before a template is listed and when a copy is
  saved.
- **P0** Library store: many templates per kind, Ovation or club authorship, versions, looks,
  listed or unlisted.
- **P0** Converter plus designer polish for the seven packs; the three layer starters added as
  they are. Code-built packs retire per pack once its converted templates pass and look right.
  Until then, hidden pack ids keep rendering as Club Kit.
- **P0** Browse with kind and size filters and previews in the club's own data.
- **P0** Use as is, or edit a copy in the template editor. Set a default per kind; adopt a look.
- **P0** Pick any template for a single manual post (Create a Card, Weekend Carousel) without
  changing the default.
- **P0** Carry over the pilot club's kind templates as copies and defaults, with no visible
  change.
- **P0** The warnings gate is unchanged: a card that doesn't fit never auto-posts.
- **P0** Motion parity: every pack's current motion survives conversion. Layer animation is
  extended as far as the seven packs need, and the conversion report confirms it per pack. The
  format leaves room for release 3's timeline.
- **P1** "Update available" on copies when the author publishes a new version.
- **P1** AI designer tool (Ovation only): a brief or screenshot becomes a draft template, with
  fit-check retries, a private draft and sample data only.
- **P1** Figma import for Ovation designers, through Ovation's own Figma connection, into a draft
  template.

### Release 2: clubs share designs

- **P1** Design from a blank canvas, then publish to every club.
- **P1** Publish checks: the fit check at every size and preset. The club's logo, photos,
  sponsors and name are swapped for slots, and literal club or sponsor names in text are flagged
  until the author replaces them with fields. The author confirms they have the rights to any
  uploaded artwork that stays.
- **P1** The author can unlist their own template; Ovation can unlist any template. Copies keep
  working either way.
- **P1** Credit by club name and a "used by N clubs" count.
- **P1** Style tags, set on publish and checked against the design (for example, photo-led
  needs a photo slot).
- **P1** Club-facing Generate, beside design-from-scratch: a brief or reference image (a Canva
  export, say) becomes a private draft. It has a monthly cap per club and blocks junior photos in
  reference images. It ships once the designer tool clears its quality bar (decision 11).
- **P1** Figma import for clubs: a club connects its own Figma account and imports into a private
  draft.
- **P2** Sorting (popular, new, Ovation or club) and favourites.
- **P2** A "Report this template" link that flags a template to Ovation.

### Release 3: full motion

- **P1** A per-layer timeline in the editor (order, duration, easing), loops, and video-first
  templates for Reels and Stories at every size.
- **P1** MP4 renders for motion templates through the existing render harness and video jobs.
- **P1** Automatic publishing posts video where Meta allows (a feed video or Reel), falling back
  to a still of the final frame. It depends on Meta's video permissions in App Review.
- **P1** The fit check covers every frame that shows data, not just the last one.

### Release 4: premium looks (gated)

- **P2** Some Ovation-made looks become premium, on paid plans only, through `entitlements.ts`.
  Club-made templates stay free. It starts only after the data-licensing hold lifts and billing
  is live.

### Won't do (P3)

- A club marketplace or paid club-made templates. Clubs never sell designs, and Ovation takes no
  cut.
- A direct Canva connection. Canva designs come in through the AI image path.
- Club-facing AI generation before the designer tool clears its quality bar.
- Rotating several templates per kind, or per-grade or per-audience defaults (Ash chose one
  default per kind).
- Ratings or comments on templates.
- Font upload (still deferred from card-kind-templates; Google Fonts only).
- Association-only or private-publish sharing tiers.

## User stories

- As a club admin, I browse Match Summary templates drawn in our colours, with our crest and last
  Saturday's result, pick one, and every automated match summary uses it.
- As a club admin, I adopt a whole look in one step so every card kind matches.
- As a club admin, I duplicate a template, change it in the editor, and make my copy our default.
- As a club admin making a one-off post or carousel, I use any template for that post without
  changing our default.
- As a club admin, when a template I use is improved, I see "update available" and decide
  whether to take it.
- As an Ovation designer, I add a template or bring back a hidden pack without a code change.
- (Release 2) As a club admin, I design a card from a blank canvas and publish it. Once it
  passes the checks, every Ovation club can use it, and our club is credited.
- (Release 2) As a club admin, I filter by style, sort by popular, and keep a shortlist.
- (Release 2) As Ovation, I unlist a template that breaks the rules, and the clubs using it keep
  their copies.
- As an Ovation designer, I turn a screenshot or a short brief into a draft template, or import a
  Figma frame, and polish it instead of starting from nothing.
- (Release 2) As a club admin, I upload a design I made in Canva and get an editable template
  with our data in it.
- (Release 3) As a club admin, I pick an animated match summary, and the automated post goes up
  as a video.

## Success criteria

Ash's picks: posts made in Ovation, no code for new designs, clubs share designs. A club having
its own look is not a success gate, but it is worth watching.

- **Posts made in Ovation.** Posts per active club per week that come out of Ovation (automatic
  plus manual) rise at least 25%, comparing the 4 weeks before release 1 with weeks 5–8 after.
  At the 4-weekend check-in, pilot admins (Halls Head plus one PCA club) report they no longer
  rebuild cards in Canva.
- **No code for new designs.** After release 1, every new library template, and each of the
  seven converted packs once listed, goes live with no app code change. Designer polish averages
  5 half-days or less per converted pack (baseline: about 20 to hand-design one). All four
  hidden packs are back in the library as looks.
- **Clubs share designs.** Within 12 weeks of release 2, at least 5 club-published templates are
  listed, and at least 3 of them are in use by a club other than their author.
- **Guardrails (every release).**
  - Zero auto-posts with a layout warning.
  - Zero truncated names or overflow across every listed template, preset and size.
  - Carousels and drafts saved before the library render exactly as they did, or as Club Kit
    for a hidden pack.
  - No junior or private-player data leaves a club through a published template, and none
    reaches the AI provider.
  - Release 1: no converted pack loses motion it has today (conversion report per pack).
- **AI quality bar (gate for club Generate).** At least 70% of the first 50 drafts the designer
  tool generates pass the fit check first time. Track the cost per generation against the
  monthly cap.

## Not building

- A free-form layout editor beyond the existing template editor. Clubs edit copies in the
  current editor.
- New card kinds or content fields. The library designs over the existing field catalogue.
- Changes to central or PlayHQ data. Previews read the club's own existing cards.
- Anything in the Won't do list.

## Risks

- **Two formats become one.** Code-built packs carry ADR-010's fit and capacity guarantees.
  Moving the content kinds onto layer documents could regress them. Mitigation: the per-template
  fit check does the grid's job, and each pack retires only once its converted templates pass.
- **Converter fidelity.** ADR-001 rejected mechanical conversion as lossy for flex layouts.
  Mitigation: convert from the rendered output (boxes per size and preset), not the pack source,
  and measure polish time per pack. If a pack converts badly, it is hand-designed instead, and
  the report says so.
- **Preview cost.** Dozens of thumbnails drawn in each club's data. Mitigation: render in the
  browser, lazily as cards scroll into view, from data loaded once per kind.
- **Community content.** Broken, offensive or copyrighted designs, or another club's sponsor
  left in. Mitigation: the auto checks and identity swap, rights confirmation, author and Ovation
  unlisting, and (P2) reporting.
- **Tenant isolation.** A club's private copies and unpublished designs must never show to
  another club, and a published template must carry none of the author's data. Needs isolation
  tests like `tenant-isolation.test.ts`; RLS is still a TODO.
- **Pilot regression.** The pilot club's live kind templates must carry over byte-identically.
- **Work in flight.** P8 (Duotone) merged on 21 Oct 2026 as a code pack, and it gets converted
  with the others. Whether later packs should be authored straight into the library is the
  architect's call.
- **Motion parity adds to release 1.** Packs with bespoke motion need layer animation extended
  before they can retire. Mitigation: the conversion report lists each pack's motion. A pack
  whose motion can't be matched yet stays a code pack until it can (it isn't dropped).
- **Meta video.** Meta publishing is still off pending App Review, and video needs further
  permissions. Mitigation: release 3 falls back to the still, so motion templates are useful
  before video posting is approved.
- **AI cost, quality and copying.**
  - Generations are billed to Ovation. Mitigation: a monthly cap per club, cost tracked per
    generation, and a designer-only tool first.
  - "Make it like this" could reproduce a paid Canva template. Mitigation: rights confirmation
    on publish and Ovation unlisting.
  - Reference images leave Ovation. Mitigation: block junior photos, use sample data only, and
    tell the club what is sent.
- **Figma per-club connections.** Release 2 needs each club's own Figma sign-in and token
  storage. The tokens are secrets, so they need encryption at rest and revocation.
- **Data governance.** Templates hold no scraped data; previews use the club's own cards.
  Premium looks (release 4) wait for the licensing hold to lift and billing to go live.

## Open questions for the architect

- How carousel page types (title, fixture, junior day, sponsors) sit in one template: one
  document per page type, or one document with page variants.
- Where shared and private templates live: tenant-scoped rows with an Ovation or global scope,
  plus published copies. How this fits `card_templates` (`source = 'kind'`, one per tenant and
  kind under a partial unique index today).
- Converter input: the harness's rendered DOM per size and preset, and how it maps flex layout,
  name-fit boxes and per-pack motion onto layers.
- How the per-template fit check reuses `layer-fit.ts` and the content-layouts grid, and where it
  runs (publish time, copy save, CI for Ovation templates).
- What happens to `KIND_TEMPLATES`, `PACK_TO_STARTER` and `LEGACY_PACK_IDS` once the library is
  the only path.
- How motion sits in the format from release 1, so the release 3 timeline is an extension rather
  than a migration. Which pack motions the R1 layer animation must express.
- The AI generation loop: provider and model, the prompt built from the field catalogue and
  format, validation (`kind-templates/validate.ts`), fit-check retries, the per-club cap, and
  where usage is recorded.
- Figma import: how Figma nodes map to layers (frames, auto layout, text styles, images), and
  how Ovation's and clubs' Figma connections are stored.
- How premium looks would plug into `entitlements.ts` without blocking clubs on free plans from
  their existing copies.
