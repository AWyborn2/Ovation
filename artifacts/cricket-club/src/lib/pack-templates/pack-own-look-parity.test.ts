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
 * Regenerate ONLY for an intentional change to a pack's own look.
 */
const BEFORE: Record<string, string> = {
  "broadcast-dark-v1/themed": "4501ff33f2696c40b01f406ebdad5a3a4ccca2ac474c05327c686c5dcb6f8fdb",
  "broadcast-dark-v1/junior": "987e3e4bf15afe155a436d8aea6afb7fee3fff1ca1bcb79b486a7cf570b032df",
  "broadcast-dark-v1/brandOnly": "d735ad2d86f40d7360a5f266f3d466b425d8f128703ae9cb91cef64a539ccce2",
  "broadcast-dark-v1/brandless": "2205b95fc6def82317546971dedd7f0ee8b9fa55c3cb1c374044ad93594f40c3",
  "gold-foil-v1/themed": "a6592a9615aac6b1343f05a20461281c0a00ea72dbbb020d0000d2edd7895007",
  "gold-foil-v1/junior": "4679048ce6ee090643a0f3bae4fb7b8fc2386d31b4f1e564d30e4fabf6cd9ad1",
  "gold-foil-v1/brandOnly": "0dba1070d4e38adbb520cc9fa4ca4a787b357ff44e49abb640f0c1302400794e",
  "gold-foil-v1/brandless": "960b83267ddfc43c6bde328f585967e5ddaab66cd2417123def6afa90bc6c2a2",
  "bold-type-v1/themed": "8e209c4526c66a6813b18ad2ad260ce151c08fc8852cf92cc4e922d2953d7afb",
  "bold-type-v1/junior": "7a5a23ffed1984c66f199a62b7e0346022a1172a603a39486edd63df52c1969c",
  "bold-type-v1/brandOnly": "fe7a97fd5c80a4de7cfcfcfa848e4dff866a568f03356c16562b8ee19271da48",
  "bold-type-v1/brandless": "92211fd536e1cde66b967cc3b36b35e23a787284a38f7b53872d1212d3e1c75d",
  "neon-night-v1/themed": "120c6bc22aa9d3923de042a5a586e282b92ab5830032d18f7f1d6d897be20957",
  "neon-night-v1/junior": "f3768d174e119776d3d43c622018839840267d58bee0aab3f5568b364ea2b112",
  "neon-night-v1/brandOnly": "f94e5856cf85059dac555c39fd282909ea175386091d2e68887e69e4802bd155",
  "neon-night-v1/brandless": "fcd06dc060d276e7df70401944397b30847a94af4741a472ef43f9c2c1800206",
  "sunset-v1/themed": "d4b592ca220bc443d601332c81d1011536d48babd84a46d3b0e05d1e23d8b918",
  "sunset-v1/junior": "febb31f2a6e744392d5b6b242557e6bc1516ed224a4a0bbedf283f399ab91db3",
  "sunset-v1/brandOnly": "1914bd514b9188da55225acfed8ecc026573f6d4ac489dcb88dd06cb49edbbd1",
  "sunset-v1/brandless": "f7e7bcce498e1423de2c9952799d8931bc61f11be99993a694d57e717d88c83b",
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
