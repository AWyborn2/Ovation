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
 * regenerated when match result cards went to a single sponsor tile.
 */
const BEFORE: Record<string, string> = {
  "broadcast-dark-v1/themed": "9d5306cdb50c60f094230fc78bd6dab2e6e7ae48ed7efe8e9c09715994327438",
  "broadcast-dark-v1/junior": "286f5bbe99f172a81aae4cfa068012c9b8087bc1209c17b075072b16caf86cc7",
  "broadcast-dark-v1/brandOnly": "a5a53be358e60c3ccc36fc59a372720b9692fb093b5b3e2cd49320ac296903be",
  "broadcast-dark-v1/brandless": "824926c5f7bc61e433b6e177766acef989710c400ef96db62134d2780f7fad42",
  "gold-foil-v1/themed": "9346b3d050550198a17cbd501323ba4555780659996ce4fca09a9356d701530a",
  "gold-foil-v1/junior": "ae20b7f4416ea48b709dacc4187ccb8b76f90f4b09c2ef5f121d6b6c167b145e",
  "gold-foil-v1/brandOnly": "48211f6fa1f96d43277dea8e06553c5bbc4666ab5abb8ab226245d0a90e58c3c",
  "gold-foil-v1/brandless": "a2f58eef6b1ee572d132c009397d46b90649e56d8501cdb95a79dee1fa3d639b",
  "bold-type-v1/themed": "c227bd4f703e9141c8d5d65d372cae47a74a2b342156660e3b5b7dd797de1a84",
  "bold-type-v1/junior": "adde9395a3f756947ea8b44cd2fdc6fced7f36a4b7f142102d0564d873941a00",
  "bold-type-v1/brandOnly": "346a7cfd9637da5dbff47100e695a55b5c9513c7f5db0b06c17501e71b318544",
  "bold-type-v1/brandless": "5f65cd1dab31878582fa406ffc73bfd7c186f9ce5549e123bab65b2e229b506c",
  "neon-night-v1/themed": "362335d92852003079cb77e37f20a450866ec93f10bd1069c55bbc7986b44f2e",
  "neon-night-v1/junior": "fdf911c5d166e13ff3ef77cf5a822e8d9d3020ef049bcfe00c40c300720232f0",
  "neon-night-v1/brandOnly": "425ad7f91bac0241761842d8905fa41ff26866c533892b1dd2b3ac47013f3acf",
  "neon-night-v1/brandless": "06df27ab849170b3ecbe1cf4e9ebf4464a666307efe2705d78d24aa960b69522",
  "sunset-v1/themed": "2d978c237530b0d44a9866d996f92f15df20bd8ea94c92e462b482c417968a2d",
  "sunset-v1/junior": "3b98ebd9d140fff16ee1036336f38d3ffad533df35d126adb58c106fc0d6bd24",
  "sunset-v1/brandOnly": "e83515debed11a0d63a4ba0eebead5719f81d82d966db2c5942212949f640798",
  "sunset-v1/brandless": "2004d3de4883f03726cb5a1d7c2c31775972a4e4fb00cf1f8953681d5f0ac54f",
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
