import { describe, expect, it } from "vitest";
import type { PackManifest } from "./types";
import { renderPackCard, PACK_DEFAULT_TOKENS, type PackTokens } from "../pack-render";
import { sampleCardInput } from "../sample-card-inputs";
import type { CardSize, ShareCardInput } from "../share-card";

/**
 * Shared U13 contract for a pack restyled onto the card skeleton — imported by
 * each pack's `<pack>-skeleton.test.ts`. (Test-only helper: not a `.test.ts`,
 * so it holds no suite of its own.)
 *
 * `pack-lint.test.ts` already proves the binding contract for every pack
 * (placeholders declared, fields used, sponsor variants, no club identity).
 * This covers what the skeleton restyle adds: every format served natively,
 * container-query roots, the tenant accent flowing through, the photo-less
 * layout and the landscape summaries.
 */

export const SKELETON_SIZES: CardSize[] = ["square", "portrait", "story", "landscape"];
const PLACEHOLDER_RE = /\{\{([A-Za-z0-9_.]+)\}\}/;

/** A tenant whose accent is purple. */
export const PURPLE: PackTokens = { ...PACK_DEFAULT_TOKENS, accent: "#7C3AED" };

/** Strip every `var(--x, fallback)` expression, innermost first. */
export function stripVarFallbacks(html: string): string {
  let out = html;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(/var\(--[\w-]+(?:,[^()]*)?\)/g, "");
  }
  return out;
}

export interface SkeletonContractOpts {
  /**
   * The pack's own default accent literal(s) — the colour the tenant accent
   * replaces. Must never survive outside a `var()` fallback.
   */
  accentLiterals: RegExp;
  /** A string only the pack's photo treatment emits (present iff a photo is bound). */
  photoMarker: string;
  /** Strings that identify the pack's signature treatment on every card. */
  signature: string[];
}

export function describeSkeletonPack(pack: PackManifest, opts: SkeletonContractOpts): void {
  const designs = pack.designs;
  const render = (
    input: ShareCardInput,
    size: CardSize,
    tokens: PackTokens = PACK_DEFAULT_TOKENS,
    data: Parameters<typeof renderPackCard>[5] = null,
  ) => renderPackCard(input, size, true, tokens, false, data, pack.packId);

  describe(`${pack.name} formats (U13)`, () => {
    it("every design has story, shared and landscape markup", () => {
      for (const entry of designs) {
        const f = entry.template.formats as Record<string, string>;
        for (const key of ["story", "shared", "landscape"]) {
          expect(f[key]?.length ?? 0, `${entry.designKey}.${key}`).toBeGreaterThan(0);
        }
      }
    });

    it("every design renders natively at all four sizes with nothing unbound", () => {
      for (const entry of designs) {
        const input = sampleCardInput(entry.kind as ShareCardInput["kind"]);
        for (const size of SKELETON_SIZES) {
          for (const sponsorsOn of [true, false]) {
            const html = renderPackCard(
              input,
              size,
              sponsorsOn,
              PACK_DEFAULT_TOKENS,
              false,
              null,
              pack.packId,
            );
            const ctx = `${entry.designKey}/${size} sponsors=${sponsorsOn}`;
            expect(html.length, ctx).toBeGreaterThan(0);
            expect(html, ctx).not.toMatch(PLACEHOLDER_RE);
            expect(html, ctx).not.toContain("pack-landscape-fallback");
          }
        }
      }
    });

    it("roots every card on the size-container skeleton", () => {
      for (const entry of designs) {
        for (const [format, html] of Object.entries(entry.template.formats)) {
          const ctx = `${entry.designKey}/${format}`;
          expect(html, ctx).toContain(
            '<div data-pack-skeleton="1" style="position:absolute;inset:0;container-type:size',
          );
          expect(html, ctx).toContain(
            '<div data-skeleton-body="1" style="flex:1 1 0;min-height:0;min-width:0;container-type:size',
          );
          expect(html, ctx).toContain('data-slot="clubLogo"');
          expect(html, ctx).toContain("{{clubName}}");
          expect(html, ctx).toContain("padding-top:2cqmin;border-top:.15cqmin solid");
        }
      }
    });

    it("carries the pack's signature treatment on every card", () => {
      for (const entry of designs) {
        const html = render(sampleCardInput(entry.kind as ShareCardInput["kind"]), "square");
        for (const marker of opts.signature) {
          expect(html, `${entry.designKey}: ${marker}`).toContain(marker);
        }
      }
    });
  });

  describe(`${pack.name} tenant colour (U13)`, () => {
    it("never hard-codes the pack's accent outside a var() fallback", () => {
      for (const entry of designs) {
        for (const [format, html] of Object.entries(entry.template.formats)) {
          expect(stripVarFallbacks(html), `${entry.designKey}/${format}`).not.toMatch(
            opts.accentLiterals,
          );
        }
      }
    });

    it("renders a purple tenant accent through every design and size", () => {
      for (const entry of designs) {
        const input = sampleCardInput(entry.kind as ShareCardInput["kind"]);
        for (const size of SKELETON_SIZES) {
          const html = render(input, size, PURPLE);
          const ctx = `${entry.designKey}/${size}`;
          expect(html, ctx).toContain("--gold:#7C3AED");
          expect(html, ctx).toContain("--accent-ink:#FFFFFF");
          // The accent the card reads is the token, never a pack default.
          expect(html, ctx).toContain("var(--gold");
          expect(stripVarFallbacks(html), ctx).not.toMatch(opts.accentLiterals);
        }
      }
    });
  });

  describe(`${pack.name} photos (U13)`, () => {
    it("drops the photo treatment and keeps the column when no photo is bound", () => {
      const input = sampleCardInput("milestone");
      expect((input as { photoUrl?: string }).photoUrl).toBeFalsy();
      for (const size of SKELETON_SIZES) {
        const html = render(input, size);
        expect(html, size).not.toContain(opts.photoMarker);
        expect(html, size).not.toContain("data-drop-if-empty");
        expect(html, size).toContain("Sample Player");
        expect(html, size).toContain("Career Runs");
        expect(html, size).toContain(
          "container-type:size;display:flex;flex-direction:column;justify-content:center",
        );
      }
    });

    it("renders a bound photo inside the pack's photo treatment", () => {
      const input = {
        ...sampleCardInput("milestone"),
        photoUrl: "https://cdn.example/p.jpg",
      } as ShareCardInput;
      const html = render(input, "square");
      expect(html).toContain(opts.photoMarker);
      expect(html).toContain('<img src="https://cdn.example/p.jpg"');
      expect(html).not.toContain("data-drop-if-empty");
    });
  });

  describe(`${pack.name} landscape summaries (U13)`, () => {
    const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

    it("caps a 12-row club leaderboard: five in landscape, eight on the tall formats", () => {
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
      expect(landscape).toContain("Leader 1<");
      expect(landscape).not.toContain("Leader 6<");
      expect(count(render(input, "story"), /Leader \d+/g)).toBe(8);
      expect(landscape).not.toContain("data-repeat-max");
    });

    it("caps a 12-team ladder: five in landscape, ten on square", () => {
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
  });
}
