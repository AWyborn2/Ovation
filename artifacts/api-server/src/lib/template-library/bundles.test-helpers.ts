/**
 * Fixture bundles for template-library tests: real, valid v1 documents (the
 * kinds' placeholders) under look slugs unique to one test run.
 */
import { createHash } from "node:crypto";
import { placeholderDocument, primaryPage } from "@workspace/scorecard/kind-templates";
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

/**
 * A format v2 document for `kind`: its placeholder's layers on the primary
 * page, plus each `extraPages` entry holding a copy of the first layer.
 */
export function v2Document(kind: string, extraPages: string[] = []): Record<string, unknown> {
  const layers = (placeholderDocument(kind) as { layers: Array<{ id: string }> }).layers;
  const pages: Record<string, { layers: unknown[] }> = { [primaryPage(kind)]: { layers } };
  for (const page of extraPages) pages[page] = { layers: [{ ...layers[0]!, id: `${page}-1` }] };
  return { formatVersion: 2, pages };
}
