/**
 * Records a Figma file's frames as a test fixture for the template import
 * (ADR-011 §9, T8.1), so the import's tests run on a real file without the
 * token. Read only: it calls `GET /v1/files/:key/nodes` (and `GET /v1/files/:key`
 * when the link names no frame) with FIGMA_ACCESS_TOKEN, which is never printed.
 *
 *   FIGMA_ACCESS_TOKEN=… pnpm --filter @workspace/api-server exec tsx \
 *     src/maintenance/record-figma-fixture.ts "<figma link>" [--out=<file>] [--kind=century]
 *
 * Writes the nodes response with the vector path data (`fillGeometry`,
 * `strokeGeometry`) left out, then prints what the import makes of it.
 * Read the file before committing it: it holds whatever text the frames have.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  createFigmaClient,
  frameIds,
  framesFromNodes,
  parseFigmaUrl,
} from "../lib/template-import/figma";
import { figmaToTemplate } from "../lib/template-import/figma-map";
import type { FontCatalogueEntry } from "../lib/template-import/figma-fonts";

const DEFAULT_OUT = new URL(
  "../lib/template-import/__fixtures__/figma-recorded.json",
  import.meta.url,
);
const FONTS = new URL("../../../cricket-club/src/lib/google-fonts-catalogue.json", import.meta.url);

/** Path data is large and the import doesn't read it. */
const DROP = new Set(["fillGeometry", "strokeGeometry"]);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const link = args.find((a) => !a.startsWith("--"));
  const flag = (name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!link) throw new Error('Usage: record-figma-fixture.ts "<figma link>" [--out=…] [--kind=…]');
  if (!token) throw new Error("Set FIGMA_ACCESS_TOKEN first.");

  const client = createFigmaClient({ token });
  const parsed = parseFigmaUrl(link);
  const ids = await frameIds(client, parsed);
  if (ids.length === 0) throw new Error("That file has no frames.");
  const nodes = await client.getNodes(parsed.fileKey, ids);
  const frames = framesFromNodes(nodes, ids);
  const out = flag("out") ?? DEFAULT_OUT;
  writeFileSync(
    out,
    `${JSON.stringify(nodes, (key, value: unknown) => (DROP.has(key) ? undefined : value), 2)}\n`,
  );
  console.log(`Recorded ${ids.length} frame(s) of "${nodes.name}" to ${String(out)}.`);

  const fonts = JSON.parse(readFileSync(FONTS, "utf8")) as FontCatalogueEntry[];
  const result = figmaToTemplate({
    kind: flag("kind") ?? "century",
    frames: frames.frames,
    styles: frames.styles,
    fonts,
  });
  for (const f of result.frames) console.log(`  ${f.name} → ${f.page}/${f.size} (by ${f.by})`);
  for (const line of result.report)
    console.log(`  ${line.level}: ${line.layer ?? ""} ${line.message}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
