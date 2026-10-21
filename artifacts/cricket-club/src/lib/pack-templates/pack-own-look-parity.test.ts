import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { listAllPackManifests } from "./registry";
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
 * The junior scenario was regenerated when the forced junior brown panel was
 * retired (plan 2026-10-15-001 R18): a junior card now renders byte-identically
 * to the brand-only scenario, so each pack's junior digest equals its brandOnly one.
 * Regenerated when ladder rows took the shared name-fit rule (ADR-010 P1: `data-fit`
 * + `data-fit-row` on the team cell), a markup-only change for names that fit.
 * Broadcast Dark regenerated for the content contract (ADR-010 P2): its Match Day
 * card shows the grade (a core field it had no box for), and the template's
 * sample note no longer prints on a real card.
 */
const BEFORE: Record<string, string> = {
  "broadcast-dark-v1/themed": "eaca6db80cdbfcdc881a120e1bc14c7b61311b7781d10217b29cefa766091267",
  "broadcast-dark-v1/junior": "a981d451b31ed1a813990e3bc51445643161a3e434dd0c30412090acbf900cad",
  "broadcast-dark-v1/brandOnly": "a981d451b31ed1a813990e3bc51445643161a3e434dd0c30412090acbf900cad",
  "broadcast-dark-v1/brandless": "9c5a659886837baa1f3176c9922b2d4f783839b74351fe3b8050ae42cae7212c",
  "gold-foil-v1/themed": "d729567915e69ca6933db969df51a400cbfef325d84aa1a94e6fbf31de8e7500",
  "gold-foil-v1/junior": "eeb1df8684ec71aaa7d27c69bf09904c98c30c04cb08d1ce5a6d5167a35a59ac",
  "gold-foil-v1/brandOnly": "eeb1df8684ec71aaa7d27c69bf09904c98c30c04cb08d1ce5a6d5167a35a59ac",
  "gold-foil-v1/brandless": "1870ac7b05e1a45917aeb25322fe4fa57b5b7c25e65bf2b46b01fe011421cefb",
  "bold-type-v1/themed": "1bce6883ef18d0d891af8615e6875ebe22123d4056f5421f6e1918df0726889e",
  "bold-type-v1/junior": "26eef58032da2ca5f59871395610d4d56a26e00965bba39e007353920e4261d6",
  "bold-type-v1/brandOnly": "26eef58032da2ca5f59871395610d4d56a26e00965bba39e007353920e4261d6",
  "bold-type-v1/brandless": "024966977e4a69d47e78cbb626e04dab69f7a15717bc026bf73862ef653f2a82",
  "neon-night-v1/themed": "9be28001802d4c4ee4809bd82404fecbbd7a9e13d4cf27950b6d8319fe0c4294",
  "neon-night-v1/junior": "53bf316cfb218f684c86eba6382918686df1770519de9a5ca8b361a6799cc4b5",
  "neon-night-v1/brandOnly": "53bf316cfb218f684c86eba6382918686df1770519de9a5ca8b361a6799cc4b5",
  "neon-night-v1/brandless": "5f89341b19d9593acda6321c6fa32f5983659c138a4cb02c67c1cdce74f2261a",
  "sunset-v1/themed": "4bee02252e99283f8940ca4820ceacaafa2fcb748011038b8f2f30ba4ad7a672",
  "sunset-v1/junior": "c641aa2cd2b0d4b2e1c1a95241e501f6f8e81c7da195336fb7f45547dfb38155",
  "sunset-v1/brandOnly": "c641aa2cd2b0d4b2e1c1a95241e501f6f8e81c7da195336fb7f45547dfb38155",
  "sunset-v1/brandless": "b021888acb2ace47a33b17e2adc80da8c472a255c2d9ef4f7d5394cefebf5166",
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
  const manifest = listAllPackManifests().find((m) => m.packId === packId)!;
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
const DUAL_MODE = listAllPackManifests().filter((m) => m.colourMode !== "club-only");
const CLUB_ONLY = listAllPackManifests().filter((m) => m.colourMode === "club-only");

// Explicit opt-in for intentional visual changes; normal runs remain strict.
if (process.env.PRINT_PACK_BASELINES) {
  for (const manifest of DUAL_MODE)
    for (const scenario of Object.keys(SCENARIOS) as Scenario[]) {
      process.stderr.write(
        `"${manifest.packId}/${scenario}": "${digest(manifest.packId, scenario, "pack")}",\n`,
      );
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
