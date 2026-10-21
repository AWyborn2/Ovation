-- Team-sheet batches (email-distribution-lists: "Email all" and combined sheets).
-- A batch send ("team_sheet_batch") spans several lists, so its email_sends row has no list:
-- list_id becomes nullable. Existing rows keep their list; nothing else changes.
-- Apply BEFORE republishing: Email all and scheduled sends insert rows with list_id NULL.
--
-- Idempotent: DROP NOT NULL on a column that is already nullable is a no-op.

ALTER TABLE "email_sends" ALTER COLUMN "list_id" DROP NOT NULL;
