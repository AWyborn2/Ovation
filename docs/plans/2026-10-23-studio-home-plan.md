# Social Studio home, Canva style

Asked by Ash on 23 Oct 2026, with screenshots of today's Studio page, the template detail dialog,
and Canva's home and template pages:

- Opening the Studio should look and feel like Canva's home page: create something new, edit
  something, or continue designing.
- Picking a template from the template menu should start editing it.
- The Design packs section belongs in the template library.
- Everything else on the Studio page is post settings and moves to its own Settings page.

It ships in the same release as the template library, on the integration branch
`wyborn21/social-template-library-pm`, merged by Ash with #411 after testing.

## What's on the Studio page today (`pages/admin-social-studio.tsx`)

| Section                                                                       | Where it goes                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Design packs (looks, club colours toggle, "Use for every card", size preview) | **Template library → Looks**                                                          |
| "Card designs: Open the template library" link                                | Replaced by the new home                                                              |
| Card names (teams, competitions, crests, juniors) `CardNamesSection`          | **Settings**                                                                          |
| Card content (presets, fields) `CardContentSection`                           | **Settings**                                                                          |
| Background templates (old upload-based ones)                                  | **Settings → Legacy backgrounds**, read-only plus delete; hidden when a club has none |
| On-demand carousel sets launcher (`WeekendCarousel` ×4)                       | **Home: Create → Carousel set** (and stays on the Carousel sets tab)                  |
| `MatchSummarySettings`                                                        | **Settings**                                                                          |

## The new Studio home (the "Studio" tab, `/admin/social`)

Laid out like Canva's home page, in the club's brand theme:

1. **Hero:** "What will you design today?" with one search box. It searches templates, elements
   and the club's own designs, and its results group by type.
2. **Create row:** big round tiles, one per card kind the club uses (Match Day, Match Summary,
   Results, Team List, Milestone, Big Moment, Ladder, Weekend Wrap, Sponsor, Announcement),
   plus **Carousel set** and **Blank design**. A tile opens a picker: choose the size
   (square, portrait, story or landscape), then a template, defaulting to the club's default,
   or start blank. That opens the editor.
3. **Continue designing:** a grid of the club's recently edited work, newest first. It covers
   drafts in the queue, the club's own templates, and carousel sets, each with a thumbnail,
   kind, size and "Edited 2 hours ago". Clicking one opens it in the editor. "See all" goes to
   a full "Your designs" page with filters.
4. **Templates for you:** a strip from the library (the club's adopted look first, then
   others), with "See all" going to the template library.
5. Quick links to Queue and Posting plan, so they stay one click away.

## Templates: pick one and start editing

- In the template detail dialog, the primary button is **"Customise this template"**. It makes a
  club copy (a `card_templates` row from the library version, as "Use" does today) and opens it
  straight in the editor. "Use as default" stays as a secondary button, and so does plain
  "Use", relabelled "Save to my templates".
- Clicking a tile in the library grid opens the detail dialog. Double-clicking a tile, or using
  a hover **Edit** button, goes straight to "Customise".
- On the Looks tab, each look card is the old Design packs card: preview, size switch,
  "Used by N card types", the club colours toggle and "Use for every card".

## Settings tab (`/admin/social/settings`)

A new tab holding:

- Card names
- Card content
- Match summary settings
- Legacy backgrounds
- the social settings currently spread across the Studio page

Each is its own card with a short heading, and the page has anchors so other pages can link
into it.

## Navigation

The Social Media Studio tabs become: **Home** (the new Studio), Templates, Create a card,
Carousel sets, Posting plan, Queue, Fixtures, Junior cards, Photo library, **Settings**. "Cards"
(old upload-based cards) moves under Settings → Legacy backgrounds if it's only the old cards.
Otherwise it stays.

## Decisions taken (to confirm with Ash)

- **H1:** "Customise this template" creates a club copy and opens the editor. Editing never
  changes the library original (ADR-011's copy rule).
- **H2:** Continue designing shows drafts, club templates and carousel sets together, newest
  first, at most 12 on the home page.
- **H3:** The create tiles show the kinds the club actually posts. Kinds turned off in the
  posting plan sit under "More".
- **H4:** Old upload-based backgrounds and Cards move under Settings, not deleted.

## Done means

On the dev stack, as Halls Head:

1. Open Social Media Studio and land on the new home.
2. Search, create a Match Day story from a template, edit it and save.
3. See it at the top of Continue designing, and reopen it.
4. In the Templates tab, open any template, Customise, and land in the editor on a copy.
5. Every setting from the old Studio page is reachable under Settings and still saves.
6. The Looks tab shows the former Design packs controls.

CI is green, and screenshots from the browser are in the PR.
