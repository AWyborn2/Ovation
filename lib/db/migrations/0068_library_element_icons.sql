-- The element library's Icons, Shapes and Stickers categories (Tabler, Phosphor,
-- Game-icons, Coolshapes and Fluent Emoji). Safe to re-run.
ALTER TABLE "library_elements" DROP CONSTRAINT IF EXISTS "library_elements_category_check";--> statement-breakpoint
ALTER TABLE "library_elements" ADD CONSTRAINT "library_elements_category_check" CHECK ("category" IN ('frames', 'bands', 'badges', 'rules', 'glows', 'crest-frames', 'sponsor-strips', 'data-blocks', 'textures', 'icons', 'shapes', 'stickers'));
