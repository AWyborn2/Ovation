import { describe, expect, it } from "vitest";
import {
  CAPTURE_SIZES,
  FIELD_MARKER_RE,
  SENTINEL_PALETTES,
  markerField,
  markersIn,
} from "@workspace/scorecard/pack-capture";
import { WORST_CASE_NAMES } from "@workspace/scorecard/kind-templates";
import { listAllPackManifests } from "../../pack-templates/registry";
import { captureRender, captureVariants, fillEmpty, prepareCard } from "./plan";
import { sentinelImage } from "./sentinels";
import { shortenUrls } from "./dom";

const PACKS = listAllPackManifests().map((p) => p.packId);
const HIDDEN = ["gold-foil-v1", "bold-type-v1", "neon-night-v1", "sunset-v1"];

describe("converter capture plan (L4-A1)", () => {
  it("plans all seven packs, the hidden four included", () => {
    expect(PACKS.sort()).toEqual(
      [
        "bold-type-v1",
        "broadcast-dark-v1",
        "club-kit-v1",
        "duotone-v1",
        "gold-foil-v1",
        "neon-night-v1",
        "sunset-v1",
      ].sort(),
    );
    for (const packId of PACKS) {
      const variants = captureVariants(packId);
      expect(variants.length, packId).toBeGreaterThan(0);
      expect(new Set(variants.map((v) => v.id)).size, `${packId} ids are unique`).toBe(
        variants.length,
      );
      // Every content kind page is there, at every preset.
      for (const id of [
        "matchDay.fixture.slide.full",
        "matchDay.title.slide.minimal",
        "matchDay.day.slide.standard",
        "matchDay.sponsors.slide.full",
        "results.result.slide.standard",
        "matchSummary.day.slide.minimal",
        "teamList.team.slide.full",
      ])
        expect(
          variants.some((v) => v.id === id),
          `${packId} ${id}`,
        ).toBe(true);
    }
  });

  it("refuses an unknown pack rather than capturing the default", () => {
    expect(() => captureVariants("no-such-pack")).toThrow(/Unknown pack/);
  });

  it("renders a hidden pack as itself, not as Club Kit", () => {
    const kit = captureVariants("club-kit-v1").find(
      (v) => v.id === "matchDay.title.slide.standard",
    )!;
    const kitHtml = prepareCard(
      "club-kit-v1",
      captureRender("club-kit-v1", kit, kit.renders[0]!, "story"),
      "story",
    ).html;
    for (const packId of HIDDEN) {
      const v = captureVariants(packId).find((x) => x.id === "matchDay.title.slide.standard")!;
      const html = prepareCard(
        packId,
        captureRender(packId, v, v.renders[0]!, "story"),
        "story",
      ).html;
      expect(html, packId).not.toBe(kitHtml);
    }
  });

  it("every variant renders at every size, and sentinel renders show only markers", () => {
    for (const packId of PACKS) {
      for (const v of captureVariants(packId)) {
        for (const r of v.renders) {
          for (const size of CAPTURE_SIZES) {
            const card = prepareCard(packId, captureRender(packId, v, r, size), size);
            const where = `${packId} ${v.id} ${r.content}/${r.palette} ${size}`;
            expect(card.html, where).not.toBe("");
            expect(card.html, `${where}: placeholder left`).not.toMatch(/\{\{\s*[\w.]+\s*\}\}/);
            if (r.content !== "sentinel") continue;
            // Every marker names a field the card bound, and at least one shows.
            const shown = markersIn(card.html);
            expect(shown.length, `${where}: no marker shown`).toBeGreaterThan(0);
            for (const key of shown)
              expect(markerField(key, Object.keys(card.markers)), `${where}: ${key}`).toBeDefined();
          }
        }
      }
    }
  }, 120_000);

  it("worst-case renders are the fit check's content: no markers, the team list at twelve", () => {
    const v = captureVariants("broadcast-dark-v1").find((x) => x.id === "teamList.team.full")!;
    const worst = v.renders.find((r) => r.content === "worst")!;
    const card = prepareCard(
      "broadcast-dark-v1",
      captureRender("broadcast-dark-v1", v, worst, "story"),
      "story",
    );
    expect(card.html).not.toMatch(FIELD_MARKER_RE);
    const players = (card.input as unknown as { players: unknown[] }).players;
    expect(players).toHaveLength(12);
    // The longest one-word surname in the names fixture (a stand-in), as the card prints it.
    const surname = WORST_CASE_NAMES.playersLongWord[0].split(" ").slice(-1)[0]!.toUpperCase();
    expect(card.html).toContain(surname);
  });

  it("the two sentinel palettes move every brand token", () => {
    const [a, b] = SENTINEL_PALETTES;
    expect(a!.id).toBe("A");
    expect(b!.id).toBe("B");
    const v = captureVariants("club-kit-v1").find((x) => x.id === "matchDay.fixture")!;
    const tokens = (palette: "A" | "B") =>
      prepareCard(
        "club-kit-v1",
        captureRender("club-kit-v1", v, { content: "sentinel", palette, detail: "full" }, "square"),
        "square",
      ).tokens;
    const ta = tokens("A");
    const tb = tokens("B");
    for (const key of ["accent", "panel", "ink"] as const) expect(ta[key], key).not.toBe(tb[key]);
  });

  it("fills what the sample leaves empty from the worst case, so optional blocks get markers", () => {
    expect(
      fillEmpty(
        { a: "", b: { c: null, d: "x" }, list: [], design: "x" },
        { a: "1", b: { c: 2, d: "y" }, list: [1], design: "y", setRole: "cover" },
      ),
    ).toEqual({ a: "1", b: { c: 2, d: "x" }, list: [], design: "x" });
    // Century's shirt-number chip only draws with a shirt number.
    const v = captureVariants("gold-foil-v1").find((x) => x.id === "century.card")!;
    const card = prepareCard(
      "gold-foil-v1",
      captureRender("gold-foil-v1", v, v.renders[0]!, "square"),
      "square",
    );
    expect(card.markers.shirtNumber).toBe("[[shirtNumber]]");
  });

  it("a single card's worst case is the card, not Match Summary's innings-detail slide", () => {
    const v = captureVariants("gold-foil-v1").find((x) => x.id === "matchSummary.result.full")!;
    const worst = v.renders.find((r) => r.content === "worst")!;
    const input = captureRender("gold-foil-v1", v, worst, "square").input as Record<
      string,
      unknown
    >;
    expect(input.carouselDetail).toBeUndefined();
  });

  it("names sentinel images by slot, so a captured src says where it came from", () => {
    const url = sentinelImage("players[0].photoUrl", 10, 10);
    expect(url).not.toMatch(/['()]/);
    expect(shortenUrls(`url("${url}")`)).toBe('url("sentinel:players_0_.photoUrl")');
    expect(shortenUrls(`data:image/png;base64,${"A".repeat(400)}`)).toBe(
      "data:image/png…(422 chars)",
    );
  });
});
