/**
 * Retest 6, item I: on the Look step, "Your templates" thumbnails printed
 * "FOX" while the library's printed "D. FOX", from the same card input.
 *
 * Both thumbnails draw the same input (the card filled in, else the club's
 * latest senior card, else the shared sample). What differed was the club's
 * own template: a copy saved from a Team List version before #636 prints the
 * bare `surname` cell, and an edited copy never follows the library. Such a
 * player row now reads with the initial (`teamListNamesWithInitials`), so
 * every thumbnail and card drawn from it prints "D. FOX".
 *
 * Every sample a thumbnail or preview falls back to is the shared one
 * (`sampleCardInput`), which carries initials ("J. BURRAGE").
 */
import { describe, expect, it } from "vitest";
import type { TemplateDocumentV2 } from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import { previewSample, stressSample } from "@/lib/kind-templates/samples";
import { seedState } from "@/components/card-forms/seed";
import { DEFAULT_BRAND } from "@workspace/scorecard";
import { pageView } from "./previews";

const DATA: PackCardData = {
  brand: { name: "Halls Head Cricket Club", primaryColour: "#1f6f43" },
  hashtag: "#HHCC",
};

const geo = (x: number, y: number, w: number, h: number) =>
  Object.fromEntries(
    (["square", "portrait", "story", "landscape"] as const).map((s) => [s, { x, y, w, h }]),
  );

/** A club's Team List copied from a library version before #636: number, surname, role. */
const OLD_CLUB_COPY: TemplateDocumentV2 = {
  formatVersion: 2,
  pages: {
    team: {
      layers: [
        {
          id: "players",
          kind: "rows",
          geometry: geo(5, 20, 90, 70),
          rows: {
            repeat: "players",
            rowHeight: 5,
            cells: [
              { field: "number", x: 0, w: 8 },
              { field: "surname", x: 10, w: 70 },
              { field: "role", x: 82, w: 18 },
            ],
          },
        },
      ],
    },
  },
} as unknown as TemplateDocumentV2;

/** What a thumbnail draws: `TemplateThumb`'s page view, then the pack renderer. */
function thumbText(input: ShareCardInput, size: CardSize = "square"): string {
  const view = pageView(OLD_CLUB_COPY, "teamList", input, "team");
  const tokens = resolveCardTokens({
    theme: null,
    junior: false,
    data: DATA,
    packId: BLANK_PACK_ID,
  });
  const html = renderPackCard(
    view.input,
    size,
    true,
    tokens,
    false,
    DATA,
    BLANK_PACK_ID,
    view.document as CardAdjustments,
    { page: "team" },
  );
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}

describe("a club's own Team List prints initials like the library's (retest 6, I)", () => {
  it('the card filled in by hand prints "D. FOX", never a bare "FOX"', () => {
    const filled = {
      ...(sampleCardInput("teamList") as object),
      players: [
        { order: 1, firstInitial: "J", surname: "YOUNG", role: "C" },
        { order: 2, firstInitial: "D", surname: "FOX" },
      ],
    } as ShareCardInput;
    for (const size of ["square", "portrait", "story", "landscape"] as CardSize[]) {
      const body = thumbText(filled, size);
      expect(body, size).toContain("D. FOX");
      expect(body, size).toContain("J. YOUNG");
      expect(body, size).not.toMatch(/(^|[^.] )FOX/);
    }
  });

  it('the shared sample prints "J. BURRAGE" on the club\'s copy', () => {
    const body = thumbText(sampleCardInput("teamList"));
    expect(body).toContain("J. BURRAGE");
    expect(body).not.toMatch(/(^|[^.] )BURRAGE/);
  });
});

describe("every thumbnail and preview sample is the shared one, with initials", () => {
  const players = (input: unknown) =>
    (input as { players?: Array<{ firstInitial?: string; surname: string }> }).players ?? [];
  const shared = players(sampleCardInput("teamList"));

  it("the shared Team List sample's players all carry an initial", () => {
    expect(shared.length).toBeGreaterThan(0);
    for (const p of shared) expect(p.firstInitial, p.surname).toMatch(/^\p{Lu}$/u);
  });

  it.each([
    [
      "usePreviewInput's fallback (sampleCardInput with the club)",
      sampleCardInput("teamList", "Halls Head"),
    ],
    [
      "the template editor and set pickers (previewSample)",
      previewSample("teamList", "Halls Head"),
    ],
    ["the fit check's long-name sample (stressSample)", stressSample("teamList", "Halls Head")],
    ["the Create wizard's seed (seedState)", seedState("teamList", DEFAULT_BRAND)],
  ])("%s draws the shared players", (_label, input) => {
    const got = players(input);
    expect(got.map((p) => p.firstInitial)).toEqual(
      shared.slice(0, got.length).map((p) => p.firstInitial),
    );
    for (const p of got) expect(p.firstInitial, p.surname).toMatch(/^\p{Lu}$/u);
  });
});
