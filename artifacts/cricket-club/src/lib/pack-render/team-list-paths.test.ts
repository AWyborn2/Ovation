/**
 * Round 3 retest, P0 1: a team list must print its players' names on every
 * path that draws it. The editor canvas, the slide thumbnails, the queue
 * preview, Share → Download and the server's post render all draw through
 * `renderPackCard` (the server opens the `/__card-render` harness, which mounts
 * the same `PackCard`), so each path's input is drawn here with every committed
 * Team List look and the names are read back from the markup:
 *
 * - a list the server builds (senior sweep and the set builder);
 * - a junior list the server builds (initial only in the club's "full" style);
 * - a list prefilled in the editor from a published team list;
 * - a list filled in by hand ("Fill in by hand").
 *
 * Reads the committed bundle files from disk.
 */
import { readdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
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
import { firstInitialOf, teamListPlayersToState } from "@/components/card-forms/prefill";
import { DESCRIPTORS } from "@/components/card-forms/descriptors";

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");
const LOOKS = readdirSync(BUNDLES).filter((d) =>
  existsSync(path.join(BUNDLES, d, "teamList.json")),
);
const bundle = (look: string) =>
  (
    JSON.parse(readFileSync(path.join(BUNDLES, look, "teamList.json"), "utf8")) as {
      document: TemplateDocumentV2;
    }
  ).document;

const DATA: PackCardData = {
  brand: {
    name: "Halls Head Cricket Club",
    logoUrl: "https://cdn.example.org/crest.png",
    primaryColour: "#1f6f43",
    backgroundColour: "#0c2a1b",
  },
  hashtag: "#HHCC",
};

function text(input: Record<string, unknown>, doc: TemplateDocumentV2, size: CardSize): string {
  const tokens = resolveCardTokens({
    theme: null,
    junior: false,
    data: DATA,
    packId: BLANK_PACK_ID,
  });
  const html = renderPackCard(
    input as unknown as ShareCardInput,
    size,
    true,
    tokens,
    false,
    DATA,
    BLANK_PACK_ID,
    doc as unknown as CardAdjustments,
    { page: "team" },
  );
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}

const META = {
  kind: "teamList",
  gradeRound: "A GRADE — ROUND 6",
  competitionLine: "A Grade",
  venueDateTime: "Rushton Park • SAT 15 NOV • 12:30 PM",
  roundLabel: "ROUND 6",
  opponent: "Waroona",
};

// What the server's builders send (team-list.ts / junior-team-list.ts).
const serverBuilt = {
  ...META,
  numbering: "shirt",
  players: [
    { order: 1, surname: "YOUNG", firstInitial: "J", role: "C", shirtNumber: 7 },
    { order: 2, surname: "HEAD", firstInitial: "M", role: "WK", shirtNumber: 12 },
    { order: 3, surname: "PRIVATE PLAYER" },
  ],
};

// The editor's "Fill from fixture" over a published list.
const prefilled = {
  ...META,
  ...teamListPlayersToState([
    { order: 1, displayName: "Jack Young", role: "C", playerId: 11 },
    { order: 2, displayName: "Mia Head", role: "WK", playerId: 12 },
    { order: 3, displayName: "Private Player", role: "VC", playerId: 13 },
  ] as never),
};

// "Fill in by hand": the form's own columns.
const handFilled = {
  ...META,
  players: [
    { order: 1, firstInitial: "J", surname: "YOUNG", role: "C" },
    { order: 2, firstInitial: "M", surname: "HEAD", role: "WK" },
    { order: 3, firstInitial: "", surname: "PRIVATE PLAYER", role: "VC" },
  ],
};

describe("team list names on every drawing path", () => {
  it("the hand-fill form has an Initial column", () => {
    const keys = DESCRIPTORS.teamList.repeat!.columns.map((c) => c.key);
    expect(keys).toContain("firstInitial");
  });

  it("the prefill gives an initial, but never to a withheld player", () => {
    expect(firstInitialOf("Jack Young")).toBe("J");
    expect(firstInitialOf("Private Player")).toBeUndefined();
    expect(firstInitialOf("Young")).toBeUndefined();
  });

  for (const look of LOOKS) {
    for (const [source, input] of [
      ["server-built", serverBuilt],
      ["prefilled", prefilled],
      ["hand-filled", handFilled],
    ] as const) {
      for (const size of ["square", "portrait", "story", "landscape"] as CardSize[]) {
        it(`${look} ${size}: a ${source} list prints initial, surname and mark`, () => {
          const body = text(input, bundle(look), size);
          expect(body).toContain("J. YOUNG (C)");
          expect(body).toContain("M. HEAD (WK)");
          expect(body).toContain("PRIVATE PLAYER");
          expect(body).not.toMatch(/\w\. PRIVATE PLAYER/);
          expect(body).not.toMatch(/PRIVATE PLAYER \(/);
        });
      }
    }
  }
});
