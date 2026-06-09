-- ============================================================================
--  Halls Head CC — PlayHQ-era player linking fix  (Josh Rudge investigation)
--  Generated 2026-06-09
--
--  ROOT CAUSE: 2023/24+ PlayHQ exports store Halls Head players as 'Initial
--  Surname' with no resolved player_id. The match-history ETL drops HH lines
--  with NULL player_id (matches-etl.sql ~L185/205/219), so these players
--  vanish from match_player_lines -> derived stats -> leaderboards.
--  FIX: resolve player_id via the career-stable PlayHQ participant id BEFORE
--  the drop filter. Mapping below was disambiguated from rosters + the
--  participant id's own full-name history (see playhq_id_resolution.csv).
--
--  Idempotent. Section A is the portable root fix (participant -> player_id).
--  Section B backfills this database's scorecard tables. ******** (privacy-
--  masked) lines are intentionally left dropped. B Lee resolved to Bradley Lee (203).
-- ============================================================================
BEGIN;

-- ---- Section A: participant -> player_id map (the root-cause fix) -----------
-- Apply this in the ETL before dropping NULL-player_id HH lines: resolve each
-- line's PlayHQ participant id through this map.
UPDATE playhq_participants SET player_id = 44 WHERE participant_id = 'b9172430-e724-4631-9e0e-d1d27808d0ad';  -- Josh Rudge
UPDATE playhq_participants SET player_id = 34 WHERE participant_id = 'a09913c7-d038-49f3-8834-eafa6e93d115';  -- Richard Woods
UPDATE playhq_participants SET player_id = 36 WHERE participant_id = 'b803aa67-9622-4f41-9a2e-761d11b55c3d';  -- Jake Wyllie
UPDATE playhq_participants SET player_id = 58 WHERE participant_id = '10b54e10-a071-42da-ab13-7c29233b392a';  -- Alec Smith
UPDATE playhq_participants SET player_id = 168 WHERE participant_id = '9b5f05c2-23d9-467d-b99b-d64fafd26b9a';  -- Jobin Muthukattil Kuriakose
UPDATE playhq_participants SET player_id = 347 WHERE participant_id = '7c16f626-5d3e-4353-8c3c-3b1b3d94167f';  -- Bradley Rayment
UPDATE playhq_participants SET player_id = 500 WHERE participant_id = '5376c4ff-49b0-4e55-979f-e8a3ec69990a';  -- Brodie Rayment
UPDATE playhq_participants SET player_id = 537 WHERE participant_id = '6d9461db-8fe7-4df1-b3b6-acbab37717ff';  -- Sabrina Evans
UPDATE playhq_participants SET player_id = 219 WHERE participant_id = '26b19b36-3c8f-4930-a1ca-ac0fbddf8d8d';  -- Joshua Jones
UPDATE playhq_participants SET player_id = 572 WHERE participant_id = 'f39dc157-299d-407d-b1a8-76067caa7e40';  -- Jazz Jones
UPDATE playhq_participants SET player_id = 2 WHERE participant_id = '2044cc99-9693-4027-a32c-52b955fc8d49';  -- Dale Burns

-- ---- Section B: backfill scorecard lines in THIS database ------------------
-- Single-participant abbreviations (every line of this name is the same person):
UPDATE match_batting SET player_id = 44 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'J Rudge';
UPDATE match_bowling SET player_id = 44 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'J Rudge';
UPDATE match_batting SET player_id = 34 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'R Woods';
UPDATE match_bowling SET player_id = 34 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'R Woods';
UPDATE match_batting SET player_id = 36 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'J Wyllie';
UPDATE match_bowling SET player_id = 36 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'J Wyllie';
UPDATE match_batting SET player_id = 58 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'A Smith';
UPDATE match_bowling SET player_id = 58 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'A Smith';
UPDATE match_batting SET player_id = 168 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'J Muthukattil Kuriakose';
UPDATE match_bowling SET player_id = 168 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'J Muthukattil Kuriakose';
UPDATE match_batting SET player_id = 537 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'S Evans';
UPDATE match_bowling SET player_id = 537 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'S Evans';
UPDATE match_batting SET player_id = 2 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'D Burns';
UPDATE match_bowling SET player_id = 2 WHERE is_halls_head = TRUE AND player_id IS NULL AND COALESCE(is_fill_in,FALSE)=FALSE AND player_name = 'D Burns';

-- 'J Jones' is two people, split by grade: Female A = Jazz Jones (572), else Joshua Jones (219)
UPDATE match_batting SET player_id = 572 WHERE is_halls_head=TRUE AND player_id IS NULL AND player_name='J Jones' AND match_id IN (SELECT match_id FROM matches WHERE parent_grade='Female A');
UPDATE match_bowling SET player_id = 572 WHERE is_halls_head=TRUE AND player_id IS NULL AND player_name='J Jones' AND match_id IN (SELECT match_id FROM matches WHERE parent_grade='Female A');
UPDATE match_batting SET player_id = 219 WHERE is_halls_head=TRUE AND player_id IS NULL AND player_name='J Jones' AND match_id IN (SELECT match_id FROM matches WHERE parent_grade<>'Female A');
UPDATE match_bowling SET player_id = 219 WHERE is_halls_head=TRUE AND player_id IS NULL AND player_name='J Jones' AND match_id IN (SELECT match_id FROM matches WHERE parent_grade<>'Female A');

-- 'B Rayment' is two people in the same F-grade XI (cannot split by name/grade).
-- Split is by PlayHQ participant id; the exact row ids in this DB build are:
UPDATE match_batting SET player_id = 347 WHERE id IN (44497,44527,44591,44610,44747,45541) AND player_id IS NULL;  -- Bradley Rayment
UPDATE match_bowling SET player_id = 347 WHERE id IN (26137,26160,26210,26228,26763) AND player_id IS NULL;  -- Bradley Rayment
UPDATE match_batting SET player_id = 500 WHERE id IN (44504,44576,44616,44755) AND player_id IS NULL;  -- Brodie Rayment
UPDATE match_bowling SET player_id = 500 WHERE id IN (26141,26184,26213,26225,26303,26321) AND player_id IS NULL;  -- Brodie Rayment

COMMIT;

-- ---- Section C: B Lee — RESOLVED (was held for review) --------------------
-- 'B Lee' (participant d8ee4db6-d9ee-4d85-9ddc-6f1f4a7d03b0, 32 lines, E Grade 2024/25-2025/26)
-- = Bradley Lee (203). Brendan Lee (416) was ruled out: his full career export shows
-- he played only the 2021/22 season, so the 2024/25-2025/26 lines cannot be him.
BEGIN;
UPDATE playhq_participants SET player_id = 203 WHERE participant_id = 'd8ee4db6-d9ee-4d85-9ddc-6f1f4a7d03b0';
UPDATE match_batting SET player_id = 203 WHERE is_halls_head=TRUE AND player_id IS NULL AND player_name='B Lee';
UPDATE match_bowling SET player_id = 203 WHERE is_halls_head=TRUE AND player_id IS NULL AND player_name='B Lee';
COMMIT;

-- ---- Verification ---------------------------------------------------------
-- Josh Rudge now has A-grade games in 2023/24-2025/26 (expect 21/18/17):
--   SELECT m.season, COUNT(DISTINCT m.match_id) FROM (
--     SELECT match_id,player_id FROM match_batting WHERE player_id=44
--     UNION ALL SELECT match_id,player_id FROM match_bowling WHERE player_id=44) x
--   JOIN matches m ON m.match_id=x.match_id WHERE m.parent_grade='A' AND m.season>='2023/24'
--   GROUP BY m.season;
-- Remaining NULL HH non-fill-in 2023+ lines should be 76 (privacy-masked ******** only).
