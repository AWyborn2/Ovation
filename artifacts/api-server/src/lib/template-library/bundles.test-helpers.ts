/**
 * Fixture bundles for template-library tests: real, valid v1 documents (the
 * kinds' placeholders) under look slugs unique to one test run.
 */
import { createHash } from "node:crypto";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import type { TemplateBundle } from "@workspace/template-bundles";

export function fixtureTemplate(
  kind: string,
  opts: { version?: number; listed?: boolean; name?: string; document?: unknown } = {},
): TemplateBundle["templates"][number] {
  const file = {
    name: opts.name ?? `${kind} fixture`,
    version: opts.version ?? 1,
    listed: opts.listed ?? true,
    document: opts.document ?? placeholderDocument(kind),
  };
  return {
    kind,
    hash: createHash("sha256").update(JSON.stringify(file)).digest("hex"),
    file,
  };
}

export function fixtureBundle(
  slug: string,
  templates: TemplateBundle["templates"],
  name = `Look ${slug}`,
): TemplateBundle {
  return { slug, look: { name, description: `${name} (test)` }, templates };
}
