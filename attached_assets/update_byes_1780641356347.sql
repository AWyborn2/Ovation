-- ============================================================
-- Mark empty "bye" fixture rows as status = 'Bye'
-- ------------------------------------------------------------
-- These are blank fixture slots picked up during scraping where a
-- Halls Head team had a BYE that round: no opponent, no date, no
-- venue, no scores, no players, and no PlayHQ match id. They are
-- NOT real matches and should not count as games.
--
-- This statement is precise (targets only those empty shells) and
-- idempotent (safe to run more than once). Expected: 7 rows updated.
--
-- Run against the Postgres database.
-- ============================================================

UPDATE matches
SET status = 'Bye'
WHERE (status IS NULL OR btrim(status) = '')
  AND team1 IS NULL
  AND team2 IS NULL
  AND playhq_match_id IS NULL
  AND match_id NOT IN (SELECT match_id FROM match_batting)
  AND match_id NOT IN (SELECT match_id FROM match_bowling);

-- Optional check after running:
-- SELECT status, COUNT(*) FROM matches GROUP BY status ORDER BY 2 DESC;
