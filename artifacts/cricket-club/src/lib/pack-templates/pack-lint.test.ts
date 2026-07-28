import { describe, expect, it } from "vitest";
import { listPackManifests } from "./registry";
import type { PackDesignEntry, PackTemplateField } from "./types";
import { renderPackCard, PACK_DEFAULT_TOKENS, packSupportsKind } from "../pack-render";
import { sampleCardInput } from "../sample-card-inputs";
import type { CardSize, ShareCardInput } from "../share-card";

/**
 * Pack-agnostic template lint — runs over EVERY registered pack.
 *
 * Pack A's own suite (`broadcast-dark.test.ts`) keeps the checks specific to it
 * (20 designs, 18 kinds, the two category-preset pairs, which cards omit a
 * sponsors-off branch). What lives here is the contract any pack must satisfy,
 * so a new pack inherits the guardrails instead of being trusted.
 *
 * The packs are hand-transcribed from Claude Design bundles, so this is the
 * verification artifact for that transcription: it proves the binding contract
 * is complete in both directions (every placeholder declared, every declared
 * field used), that no runtime constructs survived, and that no sample carries
 * a club's identity.
 */

const PLACEHOLDER_RE = /\{\{([A-Za-z0-9_.]+)\}\}/g;

function formatEntries(entry: PackDesignEntry): Array<[string, string]> {
  return Object.entries(entry.template.formats) as Array<[string, string]>;
}

function fieldAppearsInHtml(field: PackTemplateField, html: string): boolean {
  if (field.type === "text") return html.includes(`{{${field.key}}}`);
  if (field.type === "repeat") return html.includes(`data-repeat="${field.key}"`);
  return html.includes(`data-slot="${field.key}"`);
}

/**
 * Literals that would leak one club's identity to every tenant. The bundles
 * were authored with real Halls Head data, so a transcription can carry these
 * in unless something checks (R6). Opposition club names are excluded on
 * purpose — they are the other side of the fixture, not the tenant.
 */
const CLUB_IDENTITY_LITERALS = [
  "Halls Head",
  "HALLS HEAD",
  "HALLSHEAD",
  "EST 1991",
  "eSA Sport",
  "PEELPREMIERLEAGUE",
  "black & gold",
];

for (const pack of listPackManifests()) {
  describe(`pack contract: ${pack.name} (${pack.packId})`, () => {
    const designs = pack.designs;

    it("declares at least one design", () => {
      expect(designs.length).toBeGreaterThan(0);
    });

    it("has unique design keys", () => {
      const keys = designs.map((d) => d.designKey);
      expect(new Set(keys).size).toBe(designs.length);
    });

    it("entry kind/designKey mirror the template", () => {
      for (const entry of designs) {
        expect(entry.template.kind, entry.designKey).toBe(entry.kind);
        expect(entry.template.designKey, entry.designKey).toBe(entry.designKey);
      }
    });

    it("every format html is non-empty", () => {
      for (const entry of designs) {
        const formats = formatEntries(entry);
        expect(formats.length, entry.designKey).toBeGreaterThan(0);
        for (const [format, html] of formats) {
          expect(html.length, `${entry.designKey}/${format}`).toBeGreaterThan(0);
        }
      }
    });

    it("no Claude Design runtime constructs survive the conversion", () => {
      // The renderer only ever sees plain HTML plus data-* conventions.
      for (const entry of designs) {
        for (const [format, html] of formatEntries(entry)) {
          const ctx = `${entry.designKey}/${format}`;
          expect(html, ctx).not.toContain("<sc-if");
          expect(html, ctx).not.toContain("<image-slot");
          expect(html, ctx).not.toContain("hint-placeholder-val");
          expect(html, ctx).not.toContain("{{ ");
          expect(html, ctx).not.toContain("assets/");
        }
      }
    });

    it("every {{field}} used in html is declared", () => {
      for (const entry of designs) {
        const declared = new Set(entry.template.fields.map((f) => f.key));
        for (const repeat of entry.template.repeats ?? []) {
          declared.add(repeat.key);
          for (const f of repeat.fields) declared.add(`row.${f.key}`);
        }
        for (const [format, html] of formatEntries(entry)) {
          for (const match of html.matchAll(PLACEHOLDER_RE)) {
            expect(
              declared.has(match[1]),
              `${entry.designKey}/${format} uses undeclared {{${match[1]}}}`,
            ).toBe(true);
          }
        }
      }
    });

    it("every declared field appears in at least one format html", () => {
      for (const entry of designs) {
        const allHtml = formatEntries(entry)
          .map(([, html]) => html)
          .join("\n");
        for (const field of entry.template.fields) {
          expect(
            fieldAppearsInHtml(field, allHtml),
            `${entry.designKey} declares unused field "${field.key}"`,
          ).toBe(true);
        }
      }
    });

    it("declared sponsor variants match the markup", () => {
      for (const entry of designs) {
        const allHtml = formatEntries(entry)
          .map(([, html]) => html)
          .join("\n");
        expect(
          entry.template.sponsorVariants.includes("on"),
          `${entry.designKey} sponsors-on declared`,
        ).toBe(allHtml.includes('data-sponsors="on"'));
        expect(
          entry.template.sponsorVariants.includes("off"),
          `${entry.designKey} sponsors-off declared`,
        ).toBe(allHtml.includes('data-sponsors="off"'));
      }
    });

    it("(R6) no sample default carries a club's identity", () => {
      for (const entry of designs) {
        const fields = [
          ...entry.template.fields,
          ...(entry.template.repeats ?? []).flatMap((r) => r.fields),
        ];
        for (const field of fields) {
          for (const literal of CLUB_IDENTITY_LITERALS) {
            expect(
              field.sample,
              `${entry.designKey}.${field.key} sample contains "${literal}"`,
            ).not.toContain(literal);
          }
        }
      }
    });

    it("(R6) no template html hard-codes a club's identity", () => {
      for (const entry of designs) {
        for (const [format, html] of formatEntries(entry)) {
          for (const literal of CLUB_IDENTITY_LITERALS) {
            expect(
              html,
              `${entry.designKey}/${format} html contains "${literal}"`,
            ).not.toContain(literal);
          }
        }
      }
    });

    it("renders every declared kind at every size without leaving placeholders", () => {
      const sizes: CardSize[] = ["square", "portrait", "story"];
      for (const entry of designs) {
        expect(packSupportsKind(entry.kind, pack.packId), entry.designKey).toBe(true);
        const input = sampleCardInput(entry.kind as ShareCardInput["kind"]);
        for (const size of sizes) {
          for (const sponsorsOn of [true, false]) {
            const html = renderPackCard(
              input,
              size,
              sponsorsOn,
              PACK_DEFAULT_TOKENS,
              false,
              undefined,
              pack.packId,
            );
            const ctx = `${pack.packId}/${entry.designKey}/${size} sponsors=${sponsorsOn}`;
            expect(html.length, ctx).toBeGreaterThan(0);
            // An unsubstituted {{key}} means a placeholder the renderer never
            // resolved — the card would ship with literal braces on it.
            expect(html, ctx).not.toMatch(PLACEHOLDER_RE);
          }
        }
      }
    });
  });
}
