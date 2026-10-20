-- Email distribution lists, PR2 (.10x/decisions/architect/email-distribution-lists.md).
-- Data only, no schema change: each club with a social_settings.notification_email gets a
-- "Social media" list holding that address, with every social email switched on
-- (card ready, review needed, milestones). Draft notifications then email through the
-- club's social lists instead of the single address; the column stays readable for one
-- release.
-- Apply BEFORE republishing, or clubs stop getting card emails until they add a list.
--
-- Idempotent: a club that already has a social list is left alone, and a list that already
-- has members gets none added.

INSERT INTO "email_lists" ("tenant_id", "kind", "name", "settings", "active")
SELECT s."tenant_id", 'social', 'Social media',
       '{"assetReady": true, "reviewNeeded": true, "milestone": true}'::jsonb, true
FROM "social_settings" s
WHERE nullif(btrim(s."notification_email"), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "email_lists" l WHERE l."tenant_id" = s."tenant_id" AND l."kind" = 'social'
  );
--> statement-breakpoint
INSERT INTO "email_list_members" ("tenant_id", "list_id", "name", "email")
SELECT l."tenant_id", l."id", '', btrim(s."notification_email")
FROM "email_lists" l
JOIN "social_settings" s ON s."tenant_id" = l."tenant_id"
WHERE l."kind" = 'social'
  AND l."name" = 'Social media'
  AND nullif(btrim(s."notification_email"), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "email_list_members" m WHERE m."list_id" = l."id");
