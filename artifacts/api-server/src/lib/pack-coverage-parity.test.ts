import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// `design-packs.ts` imports @workspace/db, which throws without DATABASE_URL.
// Only the static PACKS array is under test here, so stub the module out —
// `ensurePackTemplates` (the part that touches the DB) is covered by
// design-packs.test.ts with a full Drizzle-shaped mock.
vi.mock("@workspace/db", () => ({
  db: {},
  cardTemplatesTable: {},
}));

const { PACKS } = await import("./design-packs");

/**
 * Coverage-contract parity between the two pack registries (R3).
 *
 * A design pack is declared twice, in two workspace packages that cannot import
 * each other:
 *
 *   - client — `artifacts/cricket-club/src/lib/pack-templates/<pack>/index.ts`
 *     lists the designs that actually render.
 *   - server — `PACKS[].cardKinds` here decides which `card_templates` rows
 *     `ensurePackTemplates` materialises per tenant, i.e. what a tenant can pick.
 *
 * When they disagree the failure is silent and looks like "the pack doesn't
 * work": a kind declared server-side only gets a selectable row, so
 * `resolvePackIdForKind` returns that pack — but the client has no design, so
 * `packSupportsKind` is false and the card quietly falls back to Broadcast Dark.
 * The tenant picked Gold Foil and got Pack A.
 *
 * This test lives on the server side deliberately: api-server runs under node,
 * so reading the client source works locally as well as in CI (the web suite
 * runs under jsdom, where `node:fs` cannot be imported).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_TEMPLATES_DIR = join(
  HERE,
  "..",
  "..",
  "..",
  "cricket-club",
  "src",
  "lib",
  "pack-templates",
);

/** `packId: "..."` / `kind: "..."` as written in a client pack manifest. */
const PACK_ID_RE = /packId:\s*"([^"]+)"/;
const KIND_RE = /\bkind:\s*"([^"]+)"/g;

interface ClientPack {
  packId: string;
  kinds: Set<string>;
  file: string;
}

/**
 * Read every client pack manifest. Parsed from source rather than imported —
 * the manifests are TS in another workspace package with no dependency edge to
 * here, and adding one just for a test would be a worse trade.
 */
function readClientPacks(): ClientPack[] {
  const out: ClientPack[] = [];
  for (const entry of readdirSync(PACK_TEMPLATES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(PACK_TEMPLATES_DIR, entry.name, "index.ts");
    if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf-8");
    const id = PACK_ID_RE.exec(src)?.[1];
    if (!id) continue;
    const kinds = new Set<string>();
    for (const m of src.matchAll(KIND_RE)) kinds.add(m[1]);
    out.push({ packId: id, kinds, file: `pack-templates/${entry.name}/index.ts` });
  }
  return out;
}

describe("pack coverage contract (client manifest ↔ api-server PACKS)", () => {
  const clientPacks = readClientPacks();

  it("finds the client pack manifests it is meant to be checking", () => {
    // Guard the guard: a moved directory or renamed manifest would otherwise
    // make this suite pass by checking nothing at all.
    expect(
      clientPacks.length,
      `no client pack manifests found under ${PACK_TEMPLATES_DIR}`,
    ).toBeGreaterThan(0);
    for (const p of clientPacks) {
      expect(p.kinds.size, `${p.file} declares no kinds`).toBeGreaterThan(0);
    }
  });

  it("every registered client pack has an api-server PACKS entry", () => {
    const serverIds = new Set(PACKS.map((p) => p.id));
    const missing = clientPacks
      .filter((p) => !serverIds.has(p.packId))
      .map((p) => `${p.packId} (${p.file})`);
    expect(
      missing,
      "client packs with no api-server PACKS entry — no tenant will ever get a " +
        "card_templates row selecting them, so they are unreachable:\n" +
        missing.map((m) => `  - ${m}`).join("\n"),
    ).toEqual([]);
  });

  it("every api-server PACKS entry has a client manifest", () => {
    const clientIds = new Set(clientPacks.map((p) => p.packId));
    const missing = PACKS.filter((p) => !clientIds.has(p.id)).map((p) => p.id);
    expect(
      missing,
      "api-server packs with no client manifest — tenants can select these but " +
        "every card falls back to the default pack:\n" +
        missing.map((m) => `  - ${m}`).join("\n"),
    ).toEqual([]);
  });

  it("declared kinds match exactly, per pack", () => {
    const problems: string[] = [];
    for (const pack of PACKS) {
      const client = clientPacks.find((p) => p.packId === pack.id);
      if (!client) continue; // reported by the test above
      const serverOnly = pack.cardKinds.filter((k) => !client.kinds.has(k));
      const clientOnly = [...client.kinds].filter((k) => !pack.cardKinds.includes(k));
      if (serverOnly.length) {
        problems.push(
          `${pack.id}: server declares ${serverOnly.join(", ")} but the client has no ` +
            `design — these silently fall back to the default pack`,
        );
      }
      if (clientOnly.length) {
        problems.push(
          `${pack.id}: client has designs for ${clientOnly.join(", ")} but the server ` +
            `does not declare them — tenants are never offered the pack for these`,
        );
      }
    }
    expect(problems, `pack coverage drift:\n${problems.map((p) => `  - ${p}`).join("\n")}`)
      .toEqual([]);
  });
});
