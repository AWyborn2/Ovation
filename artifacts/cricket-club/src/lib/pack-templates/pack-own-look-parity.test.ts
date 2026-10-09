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
 * Type's wedge grows on story; Sunset's glass hugs the copy). Regenerated for
 * intentional Team List grade headings and name-adjacent role labels.
 * Broadcast Dark regenerated for its single-column Team List lineup (5307f5c3).
 */
const BEFORE: Record<string, string> = {
  "broadcast-dark-v1/themed": "c73b441530f60944687a1ee7403941ada4d19c650373acbb697edad7c932abac",
  "broadcast-dark-v1/junior": "9d9a44024e5dc752bc651ab15d602141461a965c835004d6363f2b11577bcb84",
  "broadcast-dark-v1/brandOnly": "8208e85f7fcc112cce39cea8ee5603fdaa9c35f04ca64ddd211b5b18eaa634df",
  "broadcast-dark-v1/brandless": "cc99ca81db8928dc5311b70ac1b7164fe39ddc30e67c2d3a31deef18c3a1241f",
  "gold-foil-v1/themed": "ec94f57dd02feea1f71bd6ba8d2947d9efc2ff7d0e88e665eb4cc9bb1729b0d1",
  "gold-foil-v1/junior": "976aa1d71788525aa7d5c3b0c1228db4a632141329514b12113e6247e791cad8",
  "gold-foil-v1/brandOnly": "556d55f2fc647320b7e5f02f1e258dd2db426b4076716a93d19702adb75d38b8",
  "gold-foil-v1/brandless": "372c5c47024557e25e250530e4c77ea1bfdf04654a01704e138a9375d0337474",
  "bold-type-v1/themed": "6ab83951d550c0f838dfe287eb7d289fe463e7f0d531b95ee388381b4623cad9",
  "bold-type-v1/junior": "2d0cbc56759cc884cb82d7088eb8bbab05904d4eb84de9b8e429410ed63fe58e",
  "bold-type-v1/brandOnly": "940b7c4764a1248af9920549c8b99762e38c01a813c70e536b0bdce5b90f8c28",
  "bold-type-v1/brandless": "5f1d022300f07243c962117d14c1bd05fa9c47c50a0d1da609400149d60fcdb4",
  "neon-night-v1/themed": "762254ed5cc69cf256b398ce37d27825902c27451f91cd1f63c0c76a7b330d15",
  "neon-night-v1/junior": "674cc8141950a9b23207b6b1f7c65aff39e99fb89dde7fcc7a426aa5589c3b28",
  "neon-night-v1/brandOnly": "a50c4d582de19f3d76453919c279c535f59c8067e6e2f3dfc2d0ade361e12aef",
  "neon-night-v1/brandless": "f8211d197031d78414127abceb34c83810d0f7cd2272eb66d72d7e96bba9448a",
  "sunset-v1/themed": "59357eddbf19b4c4e4b40bebb0bb1c3d749f63063874a5eee45b84bb2f34c873",
  "sunset-v1/junior": "a4e594102040fea5c4a5dc19a97b4ac70ba21c3d9ad7586b56885ecb23a728e4",
  "sunset-v1/brandOnly": "00339cb0037a0494b0c92ee3e1a864006596e95a5673e12f8b8f784ec738d8ee",
  "sunset-v1/brandless": "5f84a4328ee17559e94ab6ccdc1b4a69eb519b259c8dd423bd54ba054700d1bf",
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

// Explicit opt-in for intentional visual changes; normal runs remain strict.
if (process.env.PRINT_PACK_BASELINES) {
  for (const manifest of DUAL_MODE) for (const scenario of Object.keys(SCENARIOS) as Scenario[]) {
    process.stderr.write(`"${manifest.packId}/${scenario}": "${digest(manifest.packId, scenario, "pack")}",\n`);
  }
}

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
