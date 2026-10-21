import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chooseFont,
  cssFontFamily,
  fontIndex,
  nearestWeight,
  type FontCatalogueEntry,
} from "./figma-fonts";

const CATALOGUE = JSON.parse(
  readFileSync(
    new URL("../../../../cricket-club/src/lib/google-fonts-catalogue.json", import.meta.url),
    "utf8",
  ),
) as FontCatalogueEntry[];
const index = fontIndex(CATALOGUE);

describe("Figma fonts → the Google Fonts catalogue (T8.4)", () => {
  it("keeps catalogue families, however Figma spells them", () => {
    expect(chooseFont(index, "Bebas Neue", 400)).toEqual({
      family: "Bebas Neue",
      category: "Sans Serif",
      weight: 400,
    });
    expect(chooseFont(index, "BebasNeue", 400).family).toBe("Bebas Neue");
    expect(chooseFont(index, "montserrat", 800).substitutedFrom).toBeUndefined();
  });

  it("substitutes the nearest catalogue family for others", () => {
    const sub = (family: string) => chooseFont(index, family, 400);
    expect(sub("Helvetica Neue")).toMatchObject({
      family: "Arimo",
      substitutedFrom: "Helvetica Neue",
    });
    expect(sub("Arial").family).toBe("Arimo");
    expect(sub("Gotham Bold").family).toBe("Montserrat");
    expect(sub("Futura PT").family).toBe("Jost");
    expect(sub("Times New Roman").family).toBe("Tinos");
    expect(sub("Menlo").family).toBe("JetBrains Mono");
    expect(sub("Zorblat Grotesk Condensed").family).toBe("Barlow Condensed");
    expect(sub("Zorblat Brush Script").family).toBe("Kaushan Script");
    expect(sub("Zorblat Sans Serif").family).toBe("Inter");
    expect(sub("Zorblat Serif").family).toBe("EB Garamond");
    expect(sub("Totally Unknown").family).toBe("Inter");
  });

  it("snaps the weight to one the family has, and says so", () => {
    // Anton comes in 400 only.
    expect(chooseFont(index, "Anton", 700)).toMatchObject({
      family: "Anton",
      weight: 400,
      weightFrom: 700,
    });
    expect(nearestWeight([400, 700], 550)).toBe(700);
    expect(nearestWeight([300, 500], 400)).toBe(500);
  });

  it("writes the family as templates store it", () => {
    expect(cssFontFamily({ family: "Anton", category: "Sans Serif" })).toBe("'Anton',sans-serif");
    expect(cssFontFamily({ family: "Space Mono", category: "Monospace" })).toBe(
      "'Space Mono',monospace",
    );
    expect(cssFontFamily({ family: "EB Garamond", category: "Serif" })).toBe("'EB Garamond',serif");
  });
});
