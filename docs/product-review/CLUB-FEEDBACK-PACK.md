# Ovation — Pilot Club Feedback Pack

Ready-to-send materials for gathering structured product feedback from prospective and pilot
Peel Cricket Association clubs. Pair with the demo environment (any provisioned club subdomain)
or a screen-share walkthrough. Produced as part of the July 2026 product review.

---

## 1. Outreach email (draft — personalise the [brackets])

**Subject:** Your club's full history, stats and honour boards — online in 5 minutes (pilot invite)

Hi [first name],

I'm reaching out because [club name] has 20+ seasons of PCA history — every scorecard,
premiership and record — and right now most of it lives in filing cabinets and memories.

We've built **Ovation**: a website for your club, branded as *your* club, that arrives already
loaded with your complete playing history from the association's records — career stats for
every player, season-by-season matches, grade leaderboards, records and premierships. Your
committee adds the things only the club knows: honour boards, life members, club champions,
milestones. It stays current automatically as new results come in.

Halls Head CC has been running on it this season — have a look: [demo link].

We're inviting **three PCA clubs** into a free pilot for the 2026/27 season. In return we'd ask
for a 30-minute feedback call each month. No technical work needed from you — we set it up and
hand you the keys.

Would you have 20 minutes for a walkthrough this week or next?

[signature]

---

## 2. Guided walkthrough script (for the call / kiosk demo)

1. Open `yourclub.ovation.app` — their crest, their colours, their name. (First reaction?)
2. Players directory → a long-serving player's career page. ("Is this right? What's missing?")
3. A recent match scorecard, then a 2000s-era one. ("How far back does your memory go?")
4. Grade leaderboard + Records. ("Who should be on top of this list? Are they?")
5. Honour boards + premierships. ("What would you add that the association doesn't know?")
6. Admin: change club colours live; add a life member. ("Could your secretary do this?")
7. Clubroom TV mode. ("Where would this screen hang in your clubrooms?")

Capture verbatim reactions at each stop — especially data corrections, which are the pilot's
gold (every correction is engagement).

## 3. Structured feedback survey (send after the walkthrough)

Scale questions are 1–5 (1 = strongly disagree, 5 = strongly agree).

**A. First impressions**
1. The site immediately felt like *our club's* site, not a generic template. [1–5]
2. I could find a specific player's career record without help. [1–5]
3. The history/stats shown for our club looked accurate. [1–5] — if under 4: *what was wrong?* [text]

**B. Value**
4. Rank these by value to your club (1 = most): full playing history · honour boards ·
   live season stats · social-media graphics · clubroom TV display · juniors section.
5. What would this replace for you today (club website, Facebook page, spreadsheet, nothing)? [text]
6. "If this disappeared after the pilot, how disappointed would you be?"
   (Very / Somewhat / Not) — *the Sean Ellis product-market-fit question.*

**C. Committee & admin**
7. Who at your club would maintain the curated content, and how confident are you they could
   use the admin console after one demo? [role + 1–5]
8. What club content do you keep today that you saw no home for? [text]

**D. Commercials (unpriced signal)**
9. What would you expect something like this to cost a club per season? [open text — do NOT
   anchor with numbers]
10. Who would pay — club funds, sponsor, association? [choice]

**E. Close**
11. Would you put your club's name on a pilot? (Yes / Need committee approval / No — why?) [text]
12. Which other PCA club do you think would want this most? [text — referral seed]

## 4. Feedback processing

- Log every response against the club in a shared sheet; tag issues `data-accuracy`,
  `ux`, `missing-feature`, `pricing`, `trust`.
- Data corrections → route into the curation/override workflow (they are pilot engagement, not
  bug reports).
- Report monthly: pilot NPS-proxy (Q6), top 3 friction themes, correction volume per club.

## 5. Notes / constraints

- Keep pilot framing **non-commercial** until data licensing is resolved (see CLAUDE.md data
  governance: scraped deep scorecards must not be commercialised; PlayHQ partner / Fixtura
  licence first).
- Respect `is_private` players in any demo — never screen-share a private player's page.
