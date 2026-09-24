import { describe, expect, it } from "vitest";
import { BROADCAST_DARK_PACK } from "./broadcast-dark";
import { renderPackCard, PACK_DEFAULT_TOKENS, type PackTokens } from "../pack-render";
import { accentInk } from "../pack-render/tokens";
import { sampleCardInput } from "../sample-card-inputs";
import type { CardSize, ShareCardInput } from "../share-card";

/**
 * U12 — Broadcast Dark on the shared pack skeleton.
 *
 * The contract checks every pack shares (placeholders declared, fields used,
 * sponsor variants, no runtime constructs, no club identity) live in
 * `pack-lint.test.ts` and already cover these designs. What is specific to the
 * restyle is here: every format is served, the container-query root that makes
 * one markup fit all four sizes, tenant colour flowing through, the photo-less
 * layout, and the landscape summaries.
 */

const designs = BROADCAST_DARK_PACK.designs;
const PACK = BROADCAST_DARK_PACK.packId;
const SIZES: CardSize[] = ["square", "portrait", "story", "landscape"];
const PLACEHOLDER_RE = /\{\{([A-Za-z0-9_.]+)\}\}/;

/** A tenant whose accent is purple. */
const PURPLE: PackTokens = { ...PACK_DEFAULT_TOKENS, accent: "#7C3AED" };

/**
 * Strip every `var(--x, fallback)` expression, innermost first, so what
 * remains is the colour a design commits to regardless of tokens.
 */
function stripVarFallbacks(html: string): string {
  let out = html;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(/var\(--[\w-]+(?:,[^()]*)?\)/g, "");
  }
  return out;
}

const PACK_GOLDS = /#FBAC27|#F5B21A/i;

function render(input: ShareCardInput, size: CardSize, tokens = PACK_DEFAULT_TOKENS) {
  return renderPackCard(input, size, true, tokens, false, null, PACK);
}

describe("Broadcast Dark formats (U12)", () => {
  it("every design has story, shared and landscape markup", () => {
    for (const entry of designs) {
      const f = entry.template.formats as Record<string, string>;
      for (const key of ["story", "shared", "landscape"]) {
        expect(f[key]?.length ?? 0, `${entry.designKey}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("every design renders at all four sizes with nothing left unbound", () => {
    for (const entry of designs) {
      const input = sampleCardInput(entry.kind as ShareCardInput["kind"]);
      for (const size of SIZES) {
        for (const sponsorsOn of [true, false]) {
          const html = renderPackCard(
            input,
            size,
            sponsorsOn,
            PACK_DEFAULT_TOKENS,
            false,
            null,
            PACK,
          );
          const ctx = `${entry.designKey}/${size} sponsors=${sponsorsOn}`;
          expect(html.length, ctx).toBeGreaterThan(0);
          expect(html, ctx).not.toMatch(PLACEHOLDER_RE);
          // A real landscape layout, never the letterboxed square.
          expect(html, ctx).not.toContain("pack-landscape-fallback");
        }
      }
    }
  });

  it("roots every card in a size container so cqmin resolves per format", () => {
    for (const entry of designs) {
      for (const [format, html] of Object.entries(entry.template.formats)) {
        const ctx = `${entry.designKey}/${format}`;
        // The skeleton root fills the native-size wrapper and is a size
        // container: 1cqmin = 10.8px on 1080-wide cards, 6.3px on landscape.
        expect(html, ctx).toContain(
          '<div data-pack-skeleton="1" style="position:absolute;inset:0;container-type:size',
        );
        // The body is its own size container, so body content auto-fits the
        // space between header and footer.
        expect(html, ctx).toContain(
          '<div data-skeleton-body="1" style="flex:1 1 0;min-height:0;min-width:0;container-type:size',
        );
      }
    }
    for (const size of SIZES) {
      const html = render(sampleCardInput("century"), size);
      expect(html, size).toContain("container-type:size");
    }
  });

  it("carries the skeleton header and footer on every design", () => {
    for (const entry of designs) {
      const html = (entry.template.formats as Record<string, string>).story;
      expect(html, entry.designKey).toContain('data-slot="clubLogo"');
      expect(html, entry.designKey).toContain("{{clubName}}");
      expect(html, entry.designKey).toContain("{{clubTagline}}");
      // Footer rule.
      expect(html, entry.designKey).toContain("padding-top:2cqmin;border-top:.15cqmin solid");
    }
  });
});

describe("Broadcast Dark tenant colour (U12)", () => {
  it("never hard-codes the pack gold outside a var() fallback", () => {
    for (const entry of designs) {
      for (const [format, html] of Object.entries(entry.template.formats)) {
        expect(stripVarFallbacks(html), `${entry.designKey}/${format}`).not.toMatch(PACK_GOLDS);
      }
    }
  });

  it("renders a purple tenant's chips, rules and slashes purple", () => {
    for (const entry of designs) {
      const input = sampleCardInput(entry.kind as ShareCardInput["kind"]);
      for (const size of SIZES) {
        const html = render(input, size, PURPLE);
        const ctx = `${entry.designKey}/${size}`;
        // The accent token the chip, rules and slashes read resolves purple…
        expect(html, ctx).toContain("--gold:#7C3AED");
        // …with white type set on it (purple is too dark for the gold's ink)…
        expect(html, ctx).toContain("--accent-ink:#FFFFFF");
        // …and nothing in the card commits to the pack gold regardless.
        expect(stripVarFallbacks(html), ctx).not.toMatch(PACK_GOLDS);
      }
    }
  });

  it("draws the chip and slashes from the accent token", () => {
    const html = render(sampleCardInput("milestone"), "square", PURPLE);
    expect(html).toContain("--sk-chip-bg:var(--gold,#FBAC27)");
    expect(html).toContain("background:var(--gold,#FBAC27);transform:skewX(-22deg)");
  });

  it("keeps dark ink on a light accent (the default gold)", () => {
    expect(accentInk("#FBAC27")).toBe("#10151B");
    expect(accentInk("#7C3AED")).toBe("#FFFFFF");
    expect(accentInk("not-a-colour")).toBeNull();
    expect(render(sampleCardInput("century"), "square")).toContain("--accent-ink:#10151B");
  });
});

describe("Broadcast Dark photo-less cards (U12)", () => {
  it("drops the photo treatment and keeps the milestone's content column", () => {
    const input = sampleCardInput("milestone");
    expect((input as { photoUrl?: string }).photoUrl).toBeFalsy();
    for (const size of SIZES) {
      const html = render(input, size);
      // No photo box, no fades, no leftover authoring hook.
      expect(html, size).not.toContain("width:62%");
      expect(html, size).not.toContain("data-drop-if-empty");
      // The content is all there, in the centred body.
      expect(html, size).toContain("Sample Player");
      expect(html, size).toContain("1000");
      expect(html, size).toContain("Career Runs");
      expect(html, size).toContain(
        "container-type:size;display:flex;flex-direction:column;justify-content:center",
      );
    }
  });

  it("frames a bound photo on the right 62%", () => {
    const input = {
      ...sampleCardInput("milestone"),
      photoUrl: "https://cdn.example/p.jpg",
    } as ShareCardInput;
    const html = render(input, "square");
    expect(html).toContain('width:62%"><img src="https://cdn.example/p.jpg"');
    expect(html).not.toContain("data-drop-if-empty");
  });
});

describe("Broadcast Dark landscape summaries (U12)", () => {
  const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

  it("shows at most five rows of a 12-row club leaderboard in landscape", () => {
    const base = sampleCardInput("clubLeaderboard") as Extract<
      ShareCardInput,
      { kind: "clubLeaderboard" }
    >;
    const input: ShareCardInput = {
      ...base,
      leaders: Array.from({ length: 12 }, (_, i) => ({
        gradeLabel: `G${i + 1}`,
        playerName: `Leader ${i + 1}`,
        value: String(500 - i * 10),
      })),
    };
    const landscape = render(input, "landscape");
    expect(count(landscape, /Leader \d+/g)).toBe(5);
    // The top five, in order.
    expect(landscape).toContain("Leader 1<");
    expect(landscape).toContain("Leader 5<");
    expect(landscape).not.toContain("Leader 6<");
    // The tall formats keep more rows (capped so they still fit).
    expect(count(render(input, "story"), /Leader \d+/g)).toBe(8);
  });

  it("shows the top five of a 12-team ladder in landscape", () => {
    const base = sampleCardInput("ladder") as Extract<ShareCardInput, { kind: "ladder" }>;
    const input: ShareCardInput = {
      ...base,
      rows: Array.from({ length: 12 }, (_, i) => ({
        pos: i + 1,
        team: `Team ${i + 1}`,
        played: 8,
        won: 8 - (i % 8),
        lost: i % 8,
        points: 48 - i * 4,
      })),
    };
    expect(count(render(input, "landscape"), /Team \d+/g)).toBe(5);
    expect(count(render(input, "square"), /Team \d+/g)).toBe(10);
  });

  it("sets the XI in two columns on every format", () => {
    for (const size of SIZES) {
      const html = render(sampleCardInput("teamList"), size);
      expect(html, size).toContain(
        "grid-template-columns:1fr 1fr;grid-template-rows:repeat(6,auto);grid-auto-flow:column",
      );
    }
  });

  it("strips the row-cap authoring hook from the output", () => {
    const html = render(sampleCardInput("ladder"), "landscape");
    expect(html).not.toContain("data-repeat-max");
  });
});
