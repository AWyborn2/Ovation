import { describe, expect, it } from "vitest";
import { applyPackData, bindInput } from "./bind";
import type { ShareCardInput } from "../share-card";

/**
 * Player sponsors: the card's player's own sponsors fill the
 * `{{playerSponsor…}}` fields; with none, they bind empty so no sample shows
 * and a layer shown only with a sponsor drops out.
 */
const century = { kind: "century", playerName: "Sam Keeper", runs: 104 } as ShareCardInput;

describe("player sponsor fields", () => {
  it("binds the first and second sponsor's name and logo", () => {
    const bound = bindInput(century, null);
    applyPackData(
      bound,
      {
        playerSponsors: [
          { name: "Joe's Plumbing", logoUrl: "https://img.test/joe.png" },
          { name: "Bakery", logoUrl: "https://img.test/bakery.png" },
        ],
      },
      "century",
    );
    expect(bound.values["playerSponsorName"]).toBe("Joe's Plumbing");
    expect(bound.values["playerSponsor2Name"]).toBe("Bakery");
    expect(bound.images["playerSponsorLogo"]).toBe("https://img.test/joe.png");
    expect(bound.images["playerSponsor2Logo"]).toBe("https://img.test/bakery.png");
  });

  it("binds them empty when the player has none", () => {
    const bound = bindInput(century, null);
    applyPackData(
      bound,
      { sponsors: [{ name: "Club Co", logoUrl: "https://img.test/c.png" }] },
      "century",
    );
    expect(bound.values["playerSponsorName"]).toBe("");
    expect(bound.values["playerSponsor2Name"]).toBe("");
    expect(bound.images["playerSponsorLogo"]).toBeUndefined();
  });
});
