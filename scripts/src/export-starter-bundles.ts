/**
 * Export the three layer starters as template bundles (ADR-011 T4.11):
 * `club-kit-classic`, `broadcast-classic` and `clubhouse`, one file per card
 * kind, each document byte-identical to the TypeScript starter (a test checks).
 *
 *   pnpm --filter @workspace/scripts exec tsx ./src/export-starter-bundles.ts
 *
 * Then run `node lib/template-bundles/generate-index.mjs` and Prettier on the
 * new files. Carousel kinds (Match Day, Match Summary, Team List) are written
 * unlisted: they gain their title, day and sponsors pages in L4-D and are
 * listed then. Retired kinds (no new cards) stay unlisted. Every other kind is
 * listed.
 *
 * The TypeScript starters are deleted in L5-C; after that the bundles are the
 * source and this script goes too. It refuses to overwrite a bundle file whose
 * version is above 1 (one already edited as a bundle).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STARTER_IDS,
  STARTER_NAMES,
  TEMPLATE_CARD_KINDS,
  starterDocument,
  type StarterId,
} from "@workspace/scorecard/kind-templates";
import { isRetiredCardKind } from "@workspace/scorecard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BUNDLES = path.join(ROOT, "lib/template-bundles");

/** The bundle look each starter becomes. */
export const STARTER_LOOKS: Record<StarterId, { slug: string; name: string; description: string }> =
  {
    "club-kit": {
      slug: "club-kit-classic",
      name: "Club Kit Classic",
      description: "The original Club Kit layer designs, in club colours.",
    },
    broadcast: {
      slug: "broadcast-classic",
      name: "Broadcast Classic",
      description: "The original Broadcast layer designs: dark panels and bold numbers.",
    },
    clubhouse: {
      slug: "clubhouse",
      name: "Clubhouse",
      description: "Warm clubroom designs with a scoreboard feel.",
    },
  };

/** Kinds whose library templates need carousel pages before they can be listed. */
const CAROUSEL_KINDS = new Set(["matchDay", "matchSummary", "teamList"]);

const words = (kind: string) =>
  kind.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

function main(): void {
  let written = 0;
  for (const [order, starter] of STARTER_IDS.entries()) {
    const look = STARTER_LOOKS[starter];
    const dir = path.join(BUNDLES, look.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "look.json"),
      `${JSON.stringify({ name: look.name, description: look.description, displayOrder: 100 + order }, null, 2)}\n`,
    );
    for (const kind of TEMPLATE_CARD_KINDS) {
      const document = starterDocument(starter, kind);
      if (!document) continue;
      const file = path.join(dir, `${kind}.json`);
      if (existsSync(file)) {
        const current = JSON.parse(readFileSync(file, "utf8")) as { version?: number };
        if ((current.version ?? 1) > 1) {
          console.log(`skip ${look.slug}/${kind}: already at version ${current.version}`);
          continue;
        }
      }
      const bundle = {
        name: `${STARTER_NAMES[starter]} ${words(kind).toLowerCase()}`,
        version: 1,
        listed: !CAROUSEL_KINDS.has(kind) && !isRetiredCardKind(kind),
        document,
      };
      writeFileSync(file, `${JSON.stringify(bundle, null, 2)}\n`);
      written += 1;
    }
  }
  console.log(`export-starter-bundles: ${written} bundle files written`);
}

main();
