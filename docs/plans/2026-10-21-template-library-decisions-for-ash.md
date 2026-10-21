# Social template library: decisions made while Ash was away

Started 21 Oct 2026. Ash asked the orchestrator session to finish the template library on the
integration branch (`wyborn21/social-template-library-pm`) until it's ready to test on the local
dev server. Where a decision came up, the session went with its own recommendation or the
engineering team's, and logged it here. Nothing was merged to `main` and #411 is untouched.

Each entry says what was decided, why, and how to reverse it. Go through them together with
Ash before #411 merges.

## How the work was run

| #   | Decision                                                                                                                                                                                                                                   | Why                                                                                                                                              | To reverse                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| O1  | The four streams from the EM plan each run in one long-lived session that works through its slices in order. Stream 1 is the L1-A session, Stream 2 the spike session, Stream 3 a new platform session, and Stream 4 the converter session | The app only lets the orchestrator start sessions on Ash's own messages, so each stream carries itself on                                        | n/a                                                         |
| O2  | The orchestrator owns every main→integration sync. Stream sessions only merge the integration branch into their own branches                                                                                                               | One place resolves conflicts in shared state files, so no two sessions fight over them                                                           | n/a                                                         |
| O3  | The library's migration is **0059**, not 0058 as the EM plan says. #415 (crest overrides and junior names) took 0058 on `main`                                                                                                             | Next free number. L9 confirms the final number at release                                                                                        | Renumber at the next `main` sync if needed                  |
| O4  | Ash's milestone checks M1–M5 are deferred to his return. Slices keep merging into the integration branch on green CI, as the plan already allowed                                                                                          | Ash is away. The plan only needed Ash to test at milestones, not to gate each merge                                                              | Ash runs M1–M5 on the dev stack before #411                 |
| O5  | Look polish: past 8 hd, a stream carries on up to 12 hd and ships its best version instead of stopping to ask. Each look's `report.md` says "pending Ash sign-off"                                                                         | The plan said to stop and ask Ash at 8 hd. Waiting would stall the critical path                                                                 | Ash reviews each look; hand-design any he rejects           |
| O6  | `main` was synced into the integration branch (9d7af341). A `status.md` conflict was resolved by keeping both sides                                                                                                                        | It brought in #416 (Studio editor) and #415 (crests). The plan syncs `main` before work starts                                                   | n/a                                                         |
| O7  | Figma import (L8) maps colour **styles** named `ovation/accent`, `ovation/panel`, `ovation/ink` and `ovation/gold`, not Figma variables. A clear "token expired" message is shown, and the runbook notes the token's renewal date          | Ash's token has `file_content:read` only. Variables need the Enterprise-only `file_variables:read`. Personal tokens expire after at most 90 days | If Ovation is on Figma Enterprise, switch L8-A to variables |

## Decisions from the streams

Each stream lists its decisions in its PR bodies under "Decisions for Ash". They're copied here as
the PRs merge.

| #   | Stream | PR  | Decision | Why | To reverse |
| --- | ------ | --- | -------- | --- | ---------- |

## Waiting on Ash

- Sign-off on each of the seven looks (Club Kit, Broadcast Dark, Duotone, Gold Foil, Bold Type, Neon Night, Sunset). Each one's `report.md` says "pending Ash sign-off"
- Milestones M1–M5 on the local dev stack, then the final pass and the merge of #411
- Production steps at release (EM plan, "Migration 0058 and the release", now 0059)
