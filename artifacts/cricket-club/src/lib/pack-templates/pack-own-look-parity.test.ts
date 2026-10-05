import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { listPackManifests } from "./registry";
import { renderPackCard, resolveCardTokens } from "../pack-render";
import { buildPackData } from "../pack-card-data";
import { sampleCardInput } from "../sample-card-inputs";
import type { CardSize, ShareCardInput } from "../share-card";

/**
 * "Pack's own look" must render byte-identically to the output from before the
 * club colour mode existed. The digests below were captured from `main`
 * (1f5a1c94, after the name-fit change in #230) with the then-current token pipeline — `resolvePackTokens({ brand:
 * brandDefaultTokens(brand), theme: tokensFromCardTheme(theme), junior })` —
 * over every design of every pack at all four sizes. Each scenario now renders
 * through the shared `resolveCardTokens` with the pack switched to "pack"; a
 * changed digest means the pack's own look drifted.
 *
 * Regenerate ONLY for an intentional change to a pack's own look. Last
 * regenerated for sponsor footers: logos (or the presenting sponsor's name
 * only when there are none), never the name as text beside logos. Last
 * regenerated when match result cards went to a single sponsor tile. Last
 * regenerated when tall cards anchored their copy clear of the photo (Bold
 * Type's wedge grows on story; Sunset's glass hugs the copy).
 */
const BEFORE: Record<string, string> = {
  "broadcast-dark-v1/themed": "94a804c63184d98fdd51d6a6dc572dab88df817b83d8e5d917f4c976160d65c1",
  "broadcast-dark-v1/junior": "d23cbac2a6cc71289c1a6a4ae1479bf03a9c114c4a8667b7aa6a2d246e99ad66",
  "broadcast-dark-v1/brandOnly": "1514e83de447fbd75af4fc8633a08970c0bc9c9ff3502fc3fb39f98e674bdd37",
  "broadcast-dark-v1/brandless": "08bd161835d7e2921bf101ac9995a1841723c071a5426f65f5f197aac71a6c13",
  "gold-foil-v1/themed": "42a175cc34a8b67d6dde93b92d5f45c29bdc6e2938f01375380ec2c61cdfc5ac",
  "gold-foil-v1/junior": "489b85aeec8919379186023e74ccbe3d6f6aa65ad9705bee701ca093ea7153ae",
  "gold-foil-v1/brandOnly": "78dc65029c8745f5f125591e0078aceb2452efd247df3121bc49bd3321feac2c",
  "gold-foil-v1/brandless": "6c083e8f3f9b3ba43ecae8250836ebce3560c777e96dc0342cedcd5c000a41b2",
  "bold-type-v1/themed": "dc62fb501731637c74703925b7b36b69737ad54a37ba59afb0566753dead0803",
  "bold-type-v1/junior": "bf0f1cbb26cba2c5cd40bc4312c770bd2cec16e2bb4f4b8d7340d659cc32e32f",
  "bold-type-v1/brandOnly": "d99fd64a480ed3c39eb19b683fc23d5db27aa683c17a7c345cab0f86d01aab9c",
  "bold-type-v1/brandless": "6b6e5219c96e2e0142c62f2e7c68c8874eb65b01ce1b04354ebbd68a3ac7f802",
  "neon-night-v1/themed": "e237893a65a777f9a4b2b8dd7d4e25be8b857530767728671a31f38736a93355",
  "neon-night-v1/junior": "71ed6720a4c8268721fa7a46d3afdafaeae8a3ef7728c0cd6b0d8e2ba37e3615",
  "neon-night-v1/brandOnly": "f5f73d11206c1a4ddb50b543f3cae92ec5cc71a11c2d0a1d46068bee4b2c9c85",
  "neon-night-v1/brandless": "8841a6fd3e7512408df404cf8e753a16360811941c05adf9c06d248317e52b19",
  "sunset-v1/themed": "f41849f7d60f9724aa14ca858a4e8dfe9294c1ff74785c0dcaff800faf9d4863",
  "sunset-v1/junior": "5e4e4592c39f3c5e551817ccac04b89232b76a1a75cc918d613de331b4bc3a87",
  "sunset-v1/brandOnly": "5a21f2b4a5e5437e3e6797f51d1891bb04cb6092567366cea274eca7a6079b4e",
  "sunset-v1/brandless": "689b3ac4d9af744e4663b6fb2fd1f5e125f6d0fb58d3fcb1e2c7b74fc1974867",
};

const SIZES: CardSize[] = ["square", "portrait", "story", "landscape"];
const BRAND = {
  name: "Demo Cricket Club",
  tagline: "CRICKET CLUB · EST. 1991",
  primaryColour: "#E63946",
  backgroundColour: "#14213D",
  juniorsColour: "#2E4A3A",
};
const THEME = { accent: "#FBAC27", bgPanel: "#42342B", bgDark: "#322F3D", textLight: "#F5F2E8" };

const SCENARIOS = {
  themed: { brand: BRAND, theme: THEME, junior: false },
  junior: { brand: BRAND, theme: null, junior: true },
  brandOnly: { brand: BRAND, theme: null, junior: false },
  brandless: { brand: null, theme: null, junior: false },
} as const;

type Scenario = keyof typeof SCENARIOS;

function digest(packId: string, scenario: Scenario, mode: "club" | "pack"): string {
  const s = SCENARIOS[scenario];
  const data = buildPackData({
    brand: s.brand,
    hashtag: "#DEMOCC",
    packColourModes: { [packId]: mode },
  });
  const tokens = resolveCardTokens({ theme: s.theme, junior: s.junior, data, packId });
  const hash = createHash("sha256");
  const manifest = listPackManifests().find((m) => m.packId === packId)!;
  // Set covers and the round team-list kind arrived after these digests were
  // captured; they have no "before" to match, and every other design is
  // unchanged by them.
  for (const entry of manifest.designs) {
    if (entry.role === "cover" || entry.kind === "teamListRound") continue;
    // Rendered as one card, as before sets: an unplanned long or mixed round
    // now renders as its set's first slide, which is planning, not the look.
    const input = {
      ...sampleCardInput(entry.kind as ShareCardInput["kind"]),
      density: "standard",
    } as ShareCardInput;
    for (const size of SIZES) {
      hash.update(renderPackCard(input, size, true, tokens, s.junior, data, packId));
    }
  }
  return hash.digest("hex");
}

/** Packs with a "Pack's own look" (every pack but the club-only ones). */
const DUAL_MODE = listPackManifests().filter((m) => m.colourMode !== "club-only");
const CLUB_ONLY = listPackManifests().filter((m) => m.colourMode === "club-only");

describe("Pack's own look is byte-identical to before club colours", () => {
  it("covers every registered pack with an own look", () => {
    const packs = new Set(Object.keys(BEFORE).map((k) => k.split("/")[0]));
    expect([...packs].sort()).toEqual(DUAL_MODE.map((m) => m.packId).sort());
  });

  // A club-only pack (Club Kit) IS the club's colours: a stored "Pack's own
  // look" choice is ignored, and a branded club's render follows its brand.
  for (const manifest of CLUB_ONLY) {
    it(`${manifest.name}: always renders in club colours`, () => {
      for (const scenario of Object.keys(SCENARIOS) as Scenario[]) {
        expect(digest(manifest.packId, scenario, "pack"), scenario).toBe(
          digest(manifest.packId, scenario, "club"),
        );
      }
      expect(digest(manifest.packId, "brandOnly", "club")).not.toBe(
        digest(manifest.packId, "brandless", "club"),
      );
    });
  }

  for (const manifest of DUAL_MODE) {
    it(`${manifest.name}: every design, size and scenario matches`, () => {
      for (const scenario of Object.keys(SCENARIOS) as Scenario[]) {
        expect(digest(manifest.packId, scenario, "pack"), scenario).toBe(
          BEFORE[`${manifest.packId}/${scenario}`],
        );
      }
    });

    it(`${manifest.name}: club colours differ from the pack's own look for a branded club`, () => {
      expect(digest(manifest.packId, "brandOnly", "club")).not.toBe(
        BEFORE[`${manifest.packId}/brandOnly`],
      );
      // A brand-less render has no club colours to take on: unchanged.
      expect(digest(manifest.packId, "brandless", "club")).toBe(
        BEFORE[`${manifest.packId}/brandless`],
      );
    });
  }
});
