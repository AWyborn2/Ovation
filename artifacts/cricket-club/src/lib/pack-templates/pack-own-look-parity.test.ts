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
 * (f7f03385) with the then-current token pipeline — `resolvePackTokens({ brand:
 * brandDefaultTokens(brand), theme: tokensFromCardTheme(theme), junior })` —
 * over every design of every pack at all four sizes. Each scenario now renders
 * through the shared `resolveCardTokens` with the pack switched to "pack"; a
 * changed digest means the pack's own look drifted.
 *
 * Regenerate ONLY for an intentional change to a pack's own look.
 */
const BEFORE: Record<string, string> = {
  "broadcast-dark-v1/themed": "311eb15ee5b45f071037c5a5b1501453f3787cc551e5ef905d2242026bb551d8",
  "broadcast-dark-v1/junior": "6329c03c099427abae39570f1a9e8a5f1c2906f00692aff66d2f82d1ac00a305",
  "broadcast-dark-v1/brandOnly": "bf965e5fca13c20b78a2f780e0ccb6c2b53c26725f2eb0bf478da9530cca7150",
  "broadcast-dark-v1/brandless": "6a17cc19bb86d10b5a401175d60cc32dd3c6a68e9003c228061aaf120bed562c",
  "gold-foil-v1/themed": "a686c89c3bc88570708cd872f25a7ad0570f02ab6fc65eefa9a4e0b096092457",
  "gold-foil-v1/junior": "b2cd272148476a443ed1f1dd86384d312a10863bf1bd7451941cec75642039e0",
  "gold-foil-v1/brandOnly": "c863ed220e59a11e260991838a5d9e889aa9b6c6875c75a152270fb3d19526dc",
  "gold-foil-v1/brandless": "544ccc74d52039610c52b6851a8435a5fb25c5532dd7a719dc2e3db5e0461117",
  "bold-type-v1/themed": "bafe6000f1d7af8f78782114337dce9f988dec9f1771e559ac0001b62f07d603",
  "bold-type-v1/junior": "2525d44f7254fd51d09d3a1b01e29a22204a5fb2946d036368e048820c708ece",
  "bold-type-v1/brandOnly": "1235cf73a863bed61dd2e613df4d0e5ed2e3ab7286db94644f72c426738cdc78",
  "bold-type-v1/brandless": "7db03b78d638cf555391e7d8a13cb285cfca3b0ad867be5eceb3c440a63de121",
  "neon-night-v1/themed": "28300abb704c4c939da68443dde736096b31a1f11851e53d84aacce6739ddf62",
  "neon-night-v1/junior": "1cfd12e4c1bba318ac185440b89b5722ed0485b3efaefa8f7c2739993744fb77",
  "neon-night-v1/brandOnly": "eaa9ed462ce4384541090ab86a3c23354ff98294f86833a1dd56feda280dbfe4",
  "neon-night-v1/brandless": "0e125080bd46d8eeb9caa5de0cd909013c619f79ccaa51b8c40a77d8f50bbf99",
  "sunset-v1/themed": "71387abf52ef0488c75af9701fe5f612fd886e8f11555ad2902c9d315e91fb5e",
  "sunset-v1/junior": "e915ba04a89c3ccd8540bbc09a529e4d5f212568ceda92a87d106dc8bf52dd8a",
  "sunset-v1/brandOnly": "9a2a982b33131766b13e17361f883a825644056453a95dc7ead9dc1bb7d05b2e",
  "sunset-v1/brandless": "df667964fc07379e5de7e5b256b7ceaf19c881354794309cf63d63e9e59aa5a1",
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
  for (const entry of manifest.designs) {
    const input = sampleCardInput(entry.kind as ShareCardInput["kind"]);
    for (const size of SIZES) {
      hash.update(renderPackCard(input, size, true, tokens, s.junior, data, packId));
    }
  }
  return hash.digest("hex");
}

describe("Pack's own look is byte-identical to before club colours", () => {
  it("covers every registered pack", () => {
    const packs = new Set(Object.keys(BEFORE).map((k) => k.split("/")[0]));
    expect([...packs].sort()).toEqual(
      listPackManifests()
        .map((m) => m.packId)
        .sort(),
    );
  });

  for (const manifest of listPackManifests()) {
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
