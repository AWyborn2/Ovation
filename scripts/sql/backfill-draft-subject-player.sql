-- Player sponsors: record the player on open player-centred drafts made before
-- the sweep started recording it (#568, 27 Oct 2026). Without it a queued card
-- can't find its player, so it keeps the club strip even after the player is
-- tagged on a sponsor.
--
-- Same rule as the sweep (`enrichDraft` → `draftSubjectPlayerId`): the player
-- comes from the card's `/players/<id>` link; only senior, non-fill-in
-- (id < 90000) cards of the player-centred kinds, and only drafts still
-- awaiting review or ready to post. Posted and dismissed drafts are left alone.
-- A draft made by hand in Create a card without a player has no player link,
-- so it stays as it is (pick the player and make the card again).
--
-- Idempotent: only rows whose subject_player_id is still null change, so it is
-- safe to run more than once, on dev and in Production. Run the SELECT first
-- to see what it will touch.

-- 1. Preview
SELECT id, tenant_id, status, card_input->>'kind' AS kind, app_path,
       (substring(app_path FROM '^/players/([0-9]+)'))::int AS player_id
FROM social_drafts
WHERE subject_player_id IS NULL
  AND status IN ('awaiting_review', 'ready')
  AND source_match_is_junior = false
  AND coalesce(card_input->>'junior', 'false') <> 'true'
  AND card_input->>'kind' IN ('milestone', 'century', 'fiveFor', 'debut', 'player', 'newSigning', 'bigMoment')
  AND app_path ~ '^/players/[0-9]+([/?#]|$)'
  AND (substring(app_path FROM '^/players/([0-9]+)'))::int BETWEEN 1 AND 89999
ORDER BY tenant_id, id;

-- 2. Backfill
UPDATE social_drafts
SET subject_player_id = (substring(app_path FROM '^/players/([0-9]+)'))::int
WHERE subject_player_id IS NULL
  AND status IN ('awaiting_review', 'ready')
  AND source_match_is_junior = false
  AND coalesce(card_input->>'junior', 'false') <> 'true'
  AND card_input->>'kind' IN ('milestone', 'century', 'fiveFor', 'debut', 'player', 'newSigning', 'bigMoment')
  AND app_path ~ '^/players/[0-9]+([/?#]|$)'
  AND (substring(app_path FROM '^/players/([0-9]+)'))::int BETWEEN 1 AND 89999;
