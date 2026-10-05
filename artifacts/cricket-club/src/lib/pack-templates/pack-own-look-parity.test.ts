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
 * regenerated when tall cards anchored their copy clear of the photo (Bold
 * Type's wedge grows on story; Sunset's glass hugs the copy).
 */
const BEFORE: Record<string, string> = {
  "broadcast-dark-v1/themed": "77892172c9a6725acd210b50c81e4823dd95301dcb0603c1e2039c44be034b68",
  "broadcast-dark-v1/junior": "8836fbeea5a8a56a9306e5e9bf679d6f86a3a1ef65727fde114fe8e031753632",
  "broadcast-dark-v1/brandOnly": "f7cda8f7634b4ccd8b78afff561278f21582f083b2410f2a3355a5f91e6dded1",
  "broadcast-dark-v1/brandless": "bd005b44943bdf8fe215b7a9b8f86f682a8afa40865f396dce932eb6af4859b5",
  "gold-foil-v1/themed": "627d45c03ffb8f27d002052bcb01800bfdb81f8967e896052c16698a3de0c872",
  "gold-foil-v1/junior": "efe5980aa40d0cdd0a28b0d26feaf4b1904fd49ce0ebd1cbe2156a9f8b392cec",
  "gold-foil-v1/brandOnly": "ecb6401cd01486996418b624c333303b374e135f78a2a8a1ddccfa0cd9fca013",
  "gold-foil-v1/brandless": "27f3a73353aca8ccccd5f9aa5a04868da06c0201b1583efe78185ca55aefdbfa",
  "bold-type-v1/themed": "7c157041bcf6a8ac2d0871eb17aa65fc31369d2ef1424b31d76c15d742528900",
  "bold-type-v1/junior": "44553f03f3204765447544c9f510c1b712f632564681b647a61e58649cf44fa9",
  "bold-type-v1/brandOnly": "5ca7b51ebe3c299e914585b48a26cae8b446bf0c9b42c9c40c0660624693d006",
  "bold-type-v1/brandless": "4bfbc570f963ea620c8104bc7598a6bc1ffceff63dbd6e9a62446d2b3bf091e8",
  "neon-night-v1/themed": "9cc246ad946944ec888c3e27e3cf47192134f4a5327775438d2b72572f0d3a14",
  "neon-night-v1/junior": "ffd39c7705b7a2034c2993e165b2f843c04a7b57a471358b870b6a7e11de7d2f",
  "neon-night-v1/brandOnly": "bf758a22f82e77765d86701dab167ae785a56dc225e5e991ec5476af74ba0b8c",
  "neon-night-v1/brandless": "fa84043b425582cd74534b517272ade594b86a565d801234a25a07ad40b0aee3",
  "sunset-v1/themed": "95915d5b908cd9fac5ca88bc801c38ec26e867e7723f6ea2984808f4eaf0f675",
  "sunset-v1/junior": "b683a6884fb7a3b1cf3038abbae07842bdbd5fa3495e4b42089e986b2b23001b",
  "sunset-v1/brandOnly": "e49d9f598a12d300b36c28e4141f47baa03c46e8c96d1397e86693017fae7514",
  "sunset-v1/brandless": "8b0b303db07ab1255723d4350bcf3112c73fc3e00c21e356b82841ae12881930",
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
