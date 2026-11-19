/**
 * Team of the Week photos (Ash, dev retest 6, Nov 2026), every look that has
 * a Team of the Week, every size, in the editor and the download (both draw
 * `renderPackCard`):
 *
 *  - a player with no photo shows the look's no-photo design in their photo
 *    cell (the club's crest, faint: #664), never an empty dark oval;
 *  - the hero photo frame (Club Kit's big panel) shows the top player's
 *    photo. The Team of the Week input carries no card photo of its own, so
 *    the frame, bound to the card photo, was always empty. With no player
 *    photo at all it shows the look's no-photo design (panel and crest).
 *
 * Read from the bundle files on disk, as the other bundle tests are.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  flattenLayers,
  normaliseDocument,
  placeholderImage,
  worstCaseCard,
  type TemplateDocumentV2,
} from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import { SIZES, type CardSize, type ShareCardInput } from "@/lib/share-card";
import { bindInput } from "./bind";

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");
const SIZE_KEYS = Object.keys(SIZES) as CardSize[];
const CREST = placeholderImage("clubLogo");

/** Every look's Team of the Week bundle. */
function bundles(): Array<{ name: string; raw: unknown; doc: TemplateDocumentV2 }> {
  const out: Array<{ name: string; raw: unknown; doc: TemplateDocumentV2 }> = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const file = path.join(BUNDLES, look, "teamOfWeek.json");
    if (!existsSync(file)) continue;
    const { document } = JSON.parse(readFileSync(file, "utf8")) as { document: unknown };
    out.push({
      name: `${look}/teamOfWeek`,
      raw: document,
      doc: normaliseDocument(document, "teamOfWeek") as TemplateDocumentV2,
    });
  }
  return out;
}

/**
 * The card as a club draws it: no card photo picked (the input has none), and
 * players with a photo where `photo(i)` says so.
 */
function render(raw: unknown, size: CardSize, photo: (i: number) => boolean): string {
  const card = worstCaseCard("teamOfWeek", {
    page: "card",
    contentKind: "teamOfWeek",
    preset: "full",
    photo: true,
    sponsors: "max",
    junior: false,
  });
  const input = structuredClone(card.input) as Extract<ShareCardInput, { kind: "teamOfWeek" }>;
  input.players = input.players.map((p, i) => ({
    ...p,
    photoUrl: photo(i) ? placeholderImage(`player${i}`) : null,
  }));
  const data = { ...card.data, photoUrl: null } as unknown as PackCardData;
  const tokens = resolveCardTokens({ theme: null, junior: false, data, packId: BLANK_PACK_ID });
  return renderPackCard(
    input,
    size,
    card.sponsorsOn,
    tokens,
    false,
    data,
    BLANK_PACK_ID,
    raw as CardAdjustments,
    { page: "card" },
  );
}

const parse = (html: string) =>
  new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

/** Each list row's photo cell: what it draws (a photo, the no-photo crest, nothing). */
function photoCells(html: string): Array<"photo" | "crest" | "empty"> {
  const out: Array<"photo" | "crest" | "empty"> = [];
  for (const row of Array.from(parse(html).querySelectorAll("[data-row-index]"))) {
    const imgs = Array.from(row.querySelectorAll('[data-row-cell="photo"] img')).map(
      (img) => img.getAttribute("src") ?? "",
    );
    out.push(
      imgs.some((s) => s.includes("player"))
        ? "photo"
        : imgs.some((s) => s === CREST)
          ? "crest"
          : "empty",
    );
  }
  return out;
}

/** The photo layers drawn on a size, and what they draw. */
function heroPhotos(html: string, doc: TemplateDocumentV2): string[] {
  const ids = new Set(
    flattenLayers(doc.pages.card?.layers ?? [])
      .filter((l) => l.kind === "photo")
      .map((l) => l.id),
  );
  const root = parse(html);
  return [...ids].flatMap((id) =>
    Array.from(root.querySelectorAll(`[data-layer-id="${id}"] img`)).map(
      (img) => img.getAttribute("src") ?? "",
    ),
  );
}

describe("Team of the Week photos", () => {
  const all = bundles();

  it("reads every look's Team of the Week", () => {
    expect(all.map((b) => b.name)).toEqual(
      expect.arrayContaining([
        "broadcast-classic/teamOfWeek",
        "club-kit/teamOfWeek",
        "club-kit-classic/teamOfWeek",
        "clubhouse/teamOfWeek",
      ]),
    );
  });

  it("binds the top player with a photo as the card's photo (the hero frame)", () => {
    const input = {
      kind: "teamOfWeek",
      title: "SENIOR TEAM OF THE WEEK",
      dateLabel: "10 OCTOBER",
      players: [
        { name: "A. NOPHOTO", figure: "50", grade: "A", photoUrl: null },
        { name: "B. PHOTO", figure: "40", grade: "B", photoUrl: "https://x.test/b.jpg" },
        { name: "C. PHOTO", figure: "30", grade: "C", photoUrl: "https://x.test/c.jpg" },
      ],
    } as unknown as ShareCardInput;
    expect(bindInput(input).images["photo"]).toBe("https://x.test/b.jpg");
    const none = {
      ...input,
      players: [{ name: "A", figure: "1", grade: "A", photoUrl: null }],
    } as unknown as ShareCardInput;
    expect(bindInput(none).images["photo"]).toBeUndefined();
  });

  it("a player with no photo draws the no-photo crest in their photo cell, every look and size", () => {
    const bad: string[] = [];
    for (const b of all)
      for (const size of SIZE_KEYS) {
        // Every other player has a photo.
        const cells = photoCells(render(b.raw, size, (i) => i % 2 === 0));
        if (cells.length === 0) continue;
        cells.forEach((c, i) => {
          const want = i % 2 === 0 ? "photo" : "crest";
          if (c !== want) bad.push(`${b.name} ${size} row ${i}: ${c}, wanted ${want}`);
        });
      }
    expect(bad).toEqual([]);
  });

  it("the hero frame shows the top player's photo, or the look's no-photo design", () => {
    const bad: string[] = [];
    for (const b of all)
      for (const size of SIZE_KEYS) {
        const frames = flattenLayers(b.doc.pages.card?.layers ?? []).filter(
          (l) => l.kind === "photo" && (!l.sizes || l.sizes.includes(size)),
        );
        if (frames.length === 0) continue;
        // The first player has none; the second's is the top photo.
        const shown = heroPhotos(
          render(b.raw, size, (i) => i > 0),
          b.doc,
        );
        if (!shown.includes(placeholderImage("player1")))
          bad.push(`${b.name} ${size}: hero frame empty (${shown.length} photos)`);
        // No player photo at all: the no-photo design is drawn on the frame.
        const html = render(b.raw, size, () => false);
        const designed = flattenLayers(b.doc.pages.card?.layers ?? []).filter(
          (l) =>
            l.showWhen?.photo === false &&
            (!l.sizes || l.sizes.includes(size)) &&
            html.includes(`data-layer-id="${l.id}"`),
        );
        if (designed.length === 0) bad.push(`${b.name} ${size}: no no-photo design`);
      }
    expect(bad).toEqual([]);
  });
});
