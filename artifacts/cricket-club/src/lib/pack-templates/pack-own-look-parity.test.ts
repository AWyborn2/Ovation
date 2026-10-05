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
 * regenerated when match result cards went to a single sponsor tile.
 */
const BEFORE: Record<string, string> = {
  "broadcast-dark-v1/themed": "d8b2251477f83a077b7b73e9458486ad4586246421676d44a86c12e3b518941d",
  "broadcast-dark-v1/junior": "d55fdfc627d072b4df9e63348fc22649875986de33ed7f0f12cd83a335fc9bf2",
  "broadcast-dark-v1/brandOnly": "7e6bd15d69e8d7a9fe93da9a1de3f3a23b808af232c78c93bf6c70dbdaea35f3",
  "broadcast-dark-v1/brandless": "a77105e3b480b607d2fe3e53a9046b18fdcefcfec9eede7411c9e9fd3603a1e9",
  "gold-foil-v1/themed": "62d9a3b9f3a439db7ea3581ff812d9feddf2caaa046442878d820a3434bf9d30",
  "gold-foil-v1/junior": "c689cf83b1b60ae65aae35f6f64944999f7765a534397925ed5e212725acccf5",
  "gold-foil-v1/brandOnly": "4589a78b6061a3639087be696db9c53876cdaa2af2c410fe737b16462e768c8f",
  "gold-foil-v1/brandless": "a0740eba424b62039ad4cd6c5dffbe9d3822e3fadce7dbf9cd88046fbee33abe",
  "bold-type-v1/themed": "37e57120085bea45bfb1f58542812976674c06cebc16a125d3d76a4aae8f8fd7",
  "bold-type-v1/junior": "ea34bcd00c6746ac32296183264aa818b02bfd223bf016c754fd0fbf0ff1e58b",
  "bold-type-v1/brandOnly": "bb1a83bfd0fac5ad9ce6388c4f4c14de066321bb1183f02534a3b95adfaecaca",
  "bold-type-v1/brandless": "d56834f7276b0935310c68a8b5adff6a820cea45d9b864f24490b3e036fef267",
  "neon-night-v1/themed": "3f76307572530341c1c026276f51d0c14c5a1883999b8ebdcaf4a9bd68e2b9f0",
  "neon-night-v1/junior": "247c38f866c4d561c994de63ced6918762b9db2c187fe8cb35bfe9b44b700d86",
  "neon-night-v1/brandOnly": "8c5b613c45eb4c2cfe34bccbdfe663606713de2ea3042535b50ed783e184ea56",
  "neon-night-v1/brandless": "aede65f514e90337c4f93436fcf547326eb1572849af0939d785d7c3a0cc2dff",
  "sunset-v1/themed": "3dd74ef30394b1b47050ed547db7935ac3e157dec97c3b4f10f9b8e4c03f1187",
  "sunset-v1/junior": "58496f117d0e46abeeadb836492eebe203141de9bd5a069bf211a4229da2851f",
  "sunset-v1/brandOnly": "bb453fc460c9487aa2ed8954f206399d6d8bf1e39d72b86ec06cde159a8579ac",
  "sunset-v1/brandless": "7849b22555b0f88d4693aca65b8d3cbed4fdb63a6f4b904941d3aaad812f4ed5",
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
