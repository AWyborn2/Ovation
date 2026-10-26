-- The element library's Textures and patterns category (the Textures Kit and the
-- 20 Seamless Patterns kit, both CC BY 4.0). Safe to re-run.
ALTER TABLE "library_elements" DROP CONSTRAINT IF EXISTS "library_elements_category_check";--> statement-breakpoint
ALTER TABLE "library_elements" ADD CONSTRAINT "library_elements_category_check" CHECK ("category" IN ('frames', 'bands', 'badges', 'rules', 'glows', 'crest-frames', 'sponsor-strips', 'data-blocks', 'textures'));
