-- A club's templates go with the club (template library, ADR-011 L3-B). Since every new draft
-- creates its kind's default template, card_templates rows are the club's own configuration:
-- deleting a tenant now deletes them instead of being blocked by them. Nothing in production
-- deletes a tenant today; tests and maintenance scripts that remove their temporary tenants do.
--
-- Idempotent, one statement (the Production SQL console runs one highlighted statement).
ALTER TABLE "card_templates" DROP CONSTRAINT IF EXISTS "card_templates_tenant_id_tenants_id_fk", ADD CONSTRAINT "card_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
