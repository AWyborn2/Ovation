-- Caption seeds (New Studio retest, Nov 2026): two default caption templates
-- seeded before the July 2026 brand-leak fix named "the Hammers". The seed
-- never overwrites a row it already made, so clubs seeded then still hold the
-- old text. This rewrites a template only when it is still exactly the old
-- seed, byte for byte, to today's tenant-neutral default. A template a club
-- has edited, and every saved draft caption, is left as it is.
-- Data only; no schema change. Safe before or after republishing.
--
-- Idempotent: once rewritten, the old text no longer matches.

UPDATE "caption_templates"
SET "template" = E'{player.name} — {stat.label}: {stat.value} 🏏\n\nHonour board form. {app.link}\n\n{hashtag} #ClubCricket',
    "updated_at" = now()
WHERE "engine" = 'ondemand'
  AND "platform" = 'instagram'
  AND "template" = E'{player.name} — {stat.label}: {stat.value} 🏏\n\nHonour board form for the Hammers. {app.link}\n\n{hashtag} #ClubCricket';
--> statement-breakpoint
UPDATE "caption_templates"
SET "template" = E'Season recap — {grade.name} 📋\n\nLeading the way this season. {app.link}\n\n{hashtag}',
    "updated_at" = now()
WHERE "engine" = 'recap'
  AND "platform" = 'instagram'
  AND "template" = E'Season recap — {grade.name} 📋\n\nLeading the way for the Hammers this season. {app.link}\n\n{hashtag}';
