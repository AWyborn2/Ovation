import { describe, expect, it } from "vitest";
import { GOLD_FOIL_PACK } from "./gold-foil";
import { BROADCAST_DARK_PACK } from "./broadcast-dark";
import { renderPackCard, PACK_DEFAULT_TOKENS, packSupportsKind } from "../pack-render";
import { sampleCardInput } from "../sample-card-inputs";
import type { CardSize } from "../share-card";

/**
 * Pack B — Gold Foil.
 *
 * `pack-lint.test.ts` already runs the shared contract over this pack. What is
 * asserted here is Gold Foil specifically: that selecting it actually changes
 * the rendered design (the packId is load-bearing, not decorative), that its
 * signature treatments survived transcription, and that its partial coverage is
 * honest.
 */

const SIZES: CardSize[] = ["square", "portrait", "story"];

const render = (packId: string | undefined, size: CardSize, sponsorsOn = true) =>
  renderPackCard(
    sampleCardInput("matchSummary"),
    size,
    sponsorsOn,
    PACK_DEFAULT_TOKENS,
    false,
    undefined,
    packId,
  );

describe("gold-foil manifest", () => {
  it("is registered as gold-foil-v1", () => {
    expect(GOLD_FOIL_PACK.packId).toBe("gold-foil-v1");
    expect(GOLD_FOIL_PACK.name).toBe("Gold Foil");
  });

  it("covers only the kinds it has actually transcribed", () => {
    // Coverage grows card by card. The point of this test is that the manifest
    // never over-claims: a kind listed here must render, and a kind absent must
    // report unsupported so the caller falls back to the default pack.
    const covered = new Set(GOLD_FOIL_PACK.designs.map((d) => d.kind));
    for (const kind of covered) {
      expect(packSupportsKind(kind, "gold-foil-v1"), kind).toBe(true);
    }
    const packAKinds = new Set(BROADCAST_DARK_PACK.designs.map((d) => d.kind));
    for (const kind of packAKinds) {
      if (covered.has(kind)) continue;
      expect(packSupportsKind(kind, "gold-foil-v1"), `${kind} not yet transcribed`).toBe(
        false,
      );
    }
  });

  it("ships all three formats for Match Result (as the bundle does)", () => {
    const entry = GOLD_FOIL_PACK.designs.find((d) => d.kind === "matchSummary");
    expect(entry).toBeDefined();
    expect(Object.keys(entry!.template.formats).sort()).toEqual([
      "portrait",
      "square",
      "story",
    ]);
  });
});

describe("gold-foil rendering", () => {
  it("renders a different design from Pack A at every size", () => {
    // The load-bearing assertion for the whole packId refactor: if these were
    // equal, packId would be selecting nothing.
    for (const size of SIZES) {
      expect(render("gold-foil-v1", size), size).not.toBe(render(undefined, size));
      expect(render("gold-foil-v1", size).length, size).toBeGreaterThan(0);
    }
  });

  it("keeps the metallic foil display type on the story format", () => {
    const html = render("gold-foil-v1", "story");
    // background-clip:text + the shine keyframes are the pack's signature.
    expect(html).toContain("background-clip:text");
    expect(html).toContain("hhShine");
  });

  it("keeps the concentric groove field on every format", () => {
    for (const size of SIZES) {
      expect(render("gold-foil-v1", size), size).toContain("repeating-radial-gradient");
    }
  });

  it("swaps the sponsor strip for a hashtag footer when sponsors are off", () => {
    for (const size of SIZES) {
      const on = render("gold-foil-v1", size, true);
      const off = render("gold-foil-v1", size, false);
      expect(on, size).not.toBe(off);
      expect(off, size).not.toContain("PROUDLY SUPPORTED BY");
      expect(off, size).not.toContain("presented by");
    }
  });

  it("binds the tenant club name rather than the bundle's wordmark", () => {
    // The bundle set "HALLS HEAD CRICKET CLUB" as a literal in the story
    // header; it must render from {{clubName}} instead.
    const html = render("gold-foil-v1", "story");
    expect(html).not.toContain("HALLS HEAD");
    expect(html).toContain("YOUR CLUB");
  });

  it("exposes the hero photo and POTM photo as bindable slots", () => {
    // Asserted on the TEMPLATE, not the render: `resolveSlots` consumes
    // data-slot markers, turning them into an <img> or a placeholder div.
    const formats = GOLD_FOIL_PACK.designs.find((d) => d.kind === "matchSummary")!.template
      .formats as Record<string, string>;
    expect(formats.story).toContain('data-slot="photo"');
    for (const size of ["portrait", "square"]) {
      expect(formats[size], size).toContain('data-slot="club.logo"');
      expect(formats[size], size).toContain('data-slot="opposition.logo"');
    }
  });

  it("exposes no Player-of-the-Match slot or field in any format", () => {
    // `potm.*` is not on ShareCardInput and nothing populates it, so the panel
    // published the template's sample literal — a fabricated player and figures
    // — as that week's result. Removed from every pack; this keeps it gone.
    const design = GOLD_FOIL_PACK.designs.find((d) => d.kind === "matchSummary")!;
    for (const [format, html] of Object.entries(
      design.template.formats as Record<string, string>,
    )) {
      expect(html, format).not.toContain("potm");
      expect(html, format).not.toContain("PLAYER OF THE MATCH");
    }
    expect(design.template.fields.map((f) => f.key).filter((k) => k.startsWith("potm"))).toEqual(
      [],
    );
  });

  it("renders a bound photo into the story hero slot", () => {
    // The complement of the template check above: prove the slot actually
    // receives an image rather than only existing in the markup.
    const html = renderPackCard(
      sampleCardInput("matchSummary"),
      "story",
      true,
      PACK_DEFAULT_TOKENS,
      false,
      { photoUrl: "https://cdn.example/hero.jpg" },
      "gold-foil-v1",
    );
    expect(html).toContain('<img src="https://cdn.example/hero.jpg"');
  });

  it("uses the same field keys as Pack A for the same kind", () => {
    // bindInput maps a ShareCardInput onto keys per card KIND, not per pack, so
    // a renamed key would silently fall back to samples on real data.
    const goldKeys = new Set(
      GOLD_FOIL_PACK.designs
        .find((d) => d.kind === "matchSummary")!
        .template.fields.map((f) => f.key),
    );
    const packAKeys = new Set(
      BROADCAST_DARK_PACK.designs
        .find((d) => d.kind === "matchSummary")!
        .template.fields.map((f) => f.key),
    );
    // Gold Foil may expose extra slots (its story hero photo); it must not
    // invent a different name for anything Pack A already binds.
    for (const key of goldKeys) {
      if (key === "photo" || key === "clubHashtag") continue;
      expect(packAKeys.has(key), `gold-foil key "${key}" not in Pack A`).toBe(true);
    }
  });
});
