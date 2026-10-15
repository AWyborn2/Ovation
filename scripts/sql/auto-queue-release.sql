-- Auto-queue criteria release (docs/plans/2026-10-15-001-feat-social-auto-queue-criteria-plan.md, U9).
-- Run in Replit's Production SQL runner AFTER republishing the code (R20, R21). Idempotent:
-- a second run changes nothing. Read-only checks follow each step.
--
-- 1. Grade leader, trading card and countdown cards are retired (R5). Open drafts of those
--    kinds are dismissed (as the Dismiss button would) and any publication still waiting to
--    go out for them is cancelled. Posted cards and their history are left alone.
-- 2. Junior auto-publishing now means publishing to Facebook and Instagram (R16/R17), so
--    every junior team goes back to "approval" and a club opts in again, team by team.

-- 1a. Cancel publications that would still go out for a retired-kind draft.
update social_publications p
set status = 'cancelled',
    updated_at = now()
from social_drafts d
where d.id = p.draft_id
  and p.status in ('scheduled', 'held')
  and d.status in ('awaiting_review', 'ready')
  and d.card_input->>'kind' in ('gradeLeader', 'tradingCard', 'countdown');

-- 1b. Dismiss the open retired-kind drafts.
update social_drafts
set status = 'dismissed',
    reviewed_at = now()
where status in ('awaiting_review', 'ready')
  and card_input->>'kind' in ('gradeLeader', 'tradingCard', 'countdown');

-- Check (read-only): expect 0.
-- select count(*) from social_drafts
-- where status in ('awaiting_review', 'ready')
--   and card_input->>'kind' in ('gradeLeader', 'tradingCard', 'countdown');

-- 2. Every junior team back to "approval". The map is { ageGroup: { teamName: mode } }.
update junior_match_display_settings s
set team_publishing = coalesce(
      (
        select jsonb_object_agg(
                 age.key,
                 coalesce(
                   (
                     select jsonb_object_agg(team.key, to_jsonb('approval'::text))
                     from jsonb_each(age.value) team
                   ),
                   '{}'::jsonb
                 )
               )
        from jsonb_each(s.team_publishing) age
      ),
      '{}'::jsonb
    ),
    updated_at = now()
where s.team_publishing::text like '%"auto"%';

-- Check (read-only): expect 0.
-- select count(*) from junior_match_display_settings where team_publishing::text like '%"auto"%';
