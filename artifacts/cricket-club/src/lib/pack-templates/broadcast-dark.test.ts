import { describe, expect, it } from "vitest";
import { BROADCAST_DARK_PACK } from "./broadcast-dark";
import type { PackDesignEntry, PackTemplateField } from "./types";

/**
 * U1 — Pack A template lint.
 *
 * The pack assets are hand-transcribed from the Claude Design bundle, so this
 * suite is the verification artifact: it proves the binding contract is
 * complete (every placeholder declared, every declared field used), that no
 * Claude Design runtime constructs survived the conversion, and that the
 * 20-design / 18-kind mapping matches KTD3.
 */

const designs = BROADCAST_DARK_PACK.designs;

const PLACEHOLDER_RE = /\{\{([A-Za-z0-9_.]+)\}\}/g;

function formatEntries(entry: PackDesignEntry): Array<[string, string]> {
  return Object.entries(entry.template.formats) as Array<[string, string]>;
}

function extractPlaceholders(html: string): string[] {
  const keys: string[] = [];
  for (const match of html.matchAll(PLACEHOLDER_RE)) {
    keys.push(match[1]);
  }
  return keys;
}

function fieldAppearsInHtml(field: PackTemplateField, html: string): boolean {
  if (field.type === "text") return html.includes(`{{${field.key}}}`);
  if (field.type === "repeat") return html.includes(`data-repeat="${field.key}"`);
  // photo / logo fields render as data-slot placeholders.
  return html.includes(`data-slot="${field.key}"`);
}

describe("broadcast-dark pack manifest", () => {
  it("has packId broadcast-dark-v1 and exactly 20 designs", () => {
    expect(BROADCAST_DARK_PACK.packId).toBe("broadcast-dark-v1");
    expect(designs).toHaveLength(20);
  });

  it("has unique design keys", () => {
    const keys = designs.map((d) => d.designKey);
    expect(new Set(keys).size).toBe(designs.length);
  });

  it("maps 20 designs onto exactly 18 distinct kinds", () => {
    const kinds = new Set(designs.map((d) => d.kind));
    expect(kinds.size).toBe(18);
  });

  it("gradeLeader appears twice with distinct category presets", () => {
    const gl = designs.filter((d) => d.kind === "gradeLeader");
    expect(gl).toHaveLength(2);
    expect(new Set(gl.map((d) => d.categoryPreset)).size).toBe(2);
    expect(gl.map((d) => d.categoryPreset).sort()).toEqual(["Runs", "Wickets"]);
  });

  it("clubLeaderboard appears twice with distinct category presets", () => {
    const cl = designs.filter((d) => d.kind === "clubLeaderboard");
    expect(cl).toHaveLength(2);
    expect(new Set(cl.map((d) => d.categoryPreset)).size).toBe(2);
    expect(cl.map((d) => d.categoryPreset).sort()).toEqual(["Runs", "Wickets"]);
  });

  it("entry kind/designKey mirror the template", () => {
    for (const entry of designs) {
      expect(entry.template.kind).toBe(entry.kind);
      expect(entry.template.designKey).toBe(entry.designKey);
    }
  });
});

describe("broadcast-dark formats", () => {
  it("match-result exposes story + portrait + square", () => {
    const entry = designs.find((d) => d.designKey === "match-result");
    expect(entry).toBeDefined();
    expect(Object.keys(entry!.template.formats).sort()).toEqual([
      "portrait",
      "square",
      "story",
    ]);
  });

  it("every other design exposes story + shared", () => {
    for (const entry of designs) {
      if (entry.designKey === "match-result") continue;
      expect(
        Object.keys(entry.template.formats).sort(),
        `${entry.designKey} formats`,
      ).toEqual(["shared", "story"]);
    }
  });

  it("every format html is non-empty and contains the clubLogo slot", () => {
    for (const entry of designs) {
      for (const [formatKey, html] of formatEntries(entry)) {
        expect(html.length, `${entry.designKey}.${formatKey}`).toBeGreaterThan(0);
        expect(
          html.includes('data-slot="clubLogo"'),
          `${entry.designKey}.${formatKey} clubLogo slot`,
        ).toBe(true);
      }
    }
  });
});

describe("broadcast-dark conversion hygiene", () => {
  const banned = ["<sc-if", "<image-slot", "hint-placeholder", "{{ "];

  it("no Claude Design runtime constructs survive", () => {
    for (const entry of designs) {
      for (const [formatKey, html] of formatEntries(entry)) {
        for (const construct of banned) {
          expect(
            html.includes(construct),
            `${entry.designKey}.${formatKey} contains "${construct}"`,
          ).toBe(false);
        }
      }
    }
  });
});

describe("broadcast-dark binding contract", () => {
  it("every {{field}} used in html is declared", () => {
    for (const entry of designs) {
      const declared = new Set(entry.template.fields.map((f) => f.key));
      const rowDeclared = new Set(
        (entry.template.repeats ?? []).flatMap((r) =>
          r.fields.map((f) => `row.${f.key}`),
        ),
      );
      for (const [formatKey, html] of formatEntries(entry)) {
        for (const key of extractPlaceholders(html)) {
          if (key.startsWith("row.")) {
            expect(
              rowDeclared.has(key),
              `${entry.designKey}.${formatKey} uses undeclared row field ${key}`,
            ).toBe(true);
          } else {
            expect(
              declared.has(key),
              `${entry.designKey}.${formatKey} uses undeclared field ${key}`,
            ).toBe(true);
          }
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
          `${entry.designKey} declares unused field ${field.key}`,
        ).toBe(true);
      }
    }
  });

  it("every repeat declares a row shape and appears as a data-repeat group", () => {
    for (const entry of designs) {
      for (const repeat of entry.template.repeats ?? []) {
        expect(repeat.maxRows, `${entry.designKey}.${repeat.key} maxRows`).toBeGreaterThan(0);
        expect(
          repeat.fields.length,
          `${entry.designKey}.${repeat.key} row fields`,
        ).toBeGreaterThan(0);
        const allHtml = formatEntries(entry)
          .map(([, html]) => html)
          .join("\n");
        expect(
          allHtml.includes(`data-repeat="${repeat.key}"`),
          `${entry.designKey} missing data-repeat group ${repeat.key}`,
        ).toBe(true);
        // Every declared row field must be bound somewhere in a row template.
        for (const field of repeat.fields) {
          expect(
            allHtml.includes(`{{row.${field.key}}}`),
            `${entry.designKey}.${repeat.key} declares unused row field ${field.key}`,
          ).toBe(true);
        }
        // Declared variants must exist in the markup and vice versa.
        for (const variant of repeat.variants ?? []) {
          expect(
            allHtml.includes(`data-repeat-variant="${variant}"`),
            `${entry.designKey}.${repeat.key} missing variant row ${variant}`,
          ).toBe(true);
        }
      }
    }
  });

  it("declared sponsor variants match the markup", () => {
    for (const entry of designs) {
      const allHtml = formatEntries(entry)
        .map(([, html]) => html)
        .join("\n");
      const hasOn = allHtml.includes('data-sponsors="on"');
      const hasOff = allHtml.includes('data-sponsors="off"');
      expect(
        entry.template.sponsorVariants.includes("on"),
        `${entry.designKey} sponsors-on declared`,
      ).toBe(hasOn);
      expect(
        entry.template.sponsorVariants.includes("off"),
        `${entry.designKey} sponsors-off declared`,
      ).toBe(hasOff);
    }
  });

  it("A3, A5, A9 have no sponsors-off branch (honoured as designed)", () => {
    for (const designKey of ["player-spotlight", "milestone", "new-signing"]) {
      const entry = designs.find((d) => d.designKey === designKey);
      expect(entry, designKey).toBeDefined();
      expect(entry!.template.sponsorVariants, designKey).toEqual(["on"]);
    }
  });
});
