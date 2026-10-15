# Product Manager — social-auto-queue-criteria

## Phase 1 (2026-10-15)

Canonical requirements: `docs/plans/2026-10-15-001-feat-social-auto-queue-criteria-plan.md` (Product Contract R1–R21, AE1–AE8). This file holds the product framing and the decisions the owner made.

**Who has the problem.** The club's volunteer media officer (Ash at Halls Head; the same role at every pilot club). Pain: 48 cards after one round; 20 of them were grade-leader cards nobody wanted.

**What we're building.** One table (the Posting Plan) where the club sets per card type: auto-queue on/off, senior and junior grades, individual or round carousel. Types merge into Match result and Big Moment; grade leaders, trading cards and countdown retire; the brown junior look retires; every club starts on new defaults.

**Owner decisions (brainstorm + review, 2026-10-15).**

- Retire: individual grade-leader cards, trading cards, countdown. Merge: weekend wrap + match summary + results summary → Match result; century + five-for + big moment → Big Moment.
- Big Moment bar is fixed (century, five wickets, hat-trick, five catches); club picks grades. One exception: junior runs bar may be lowered to 50.
- Packaging per type, club's choice; Big Moments default individual ("centuries and five-fors are rare").
- Juniors: any eligible type can run for junior grades; combined or separate carousels. Junior auto-publish is per team (`auto` mode), every team `approval` at release.
- Brown junior look retired on cards and website.
- Defaults reset for all clubs; unposted cards of retired types dismissed after the republish.
- Fetch ball-by-ball for played matches so hat-tricks work.
- Record, Team of the week, Premiership: real engines wanted (ToW with admin criteria, grade-weighted points, senior + junior) — separate spec next.

**Success criteria.**

- Round 1 2026/27 data drafts roughly 5–8 senior cards for Halls Head (was 48).
- An admin can explain any queued card from the table alone.
- No junior card publishes on its own unless every junior team on it is `auto`.

**Out of scope.** Posting times (calendar owns them), approval routing beyond the per-team mode, adjustable milestone thresholds, drafting caps.
