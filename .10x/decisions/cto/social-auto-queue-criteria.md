# CTO — social-auto-queue-criteria

## Phase 1 strategy (2026-10-15)

**Problem.** After one round, Halls Head's Social Studio queue held 48 cards. The volunteer admin cannot keep up, and with the posting calendar on most cards never get a posting time. The club has no way to say what it wants drafted: automation is per family, thresholds are fixed, and several types overlap.

**Verdict: build now.** The queue is the Studio's core loop; a flooded queue makes every other Studio feature useless. No off-the-shelf product knows a club's scorecards. The Posting Plan (shipped 2026-10-15) is the natural base, so the increment is small relative to its value.

**Build vs buy.** Build. Reuses the Posting Plan table, the central projector, the junior publishing modes and existing card designs. New code is one detector, one central table, a sync flag and gate changes.

**Strategic direction.**

- Fewer, better card types is the direction for every club, not a Halls Head fix. Defaults in code, reset for all clubs, is deliberate: carry-over would preserve the flood.
- Fetching ball-by-ball data (one extra request per match played) stays inside the pilot's non-commercial framing; the data-governance stance is unchanged. Partner/licence work still gates any resale use.
- Junior auto-publishing to Meta is a club choice per team, off at release. Child privacy outranks convenience: untraceable junior cards never publish on their own.

**Opportunity cost.** Record, Team of the week and Premiership engines (owner asked for them) go to a separate spec so the queue fix lands first.

**Risks accepted.** Rolling back to an older build restores old settings (grade leaders return) until a roll-forward; the release SQL can be re-run.
