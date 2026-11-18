/**
 * Round 3 retest, P0 2: a junior made private after a draft was built is
 * withheld whenever the draft is drawn. Pure rules; the end-to-end read,
 * download and post checks are in junior-name-redaction.db.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  redactDraftRow,
  redactJuniorText,
  redactWithheldJuniorNames,
  withheldNames,
} from "./junior-name-redaction";

const W = withheldNames([
  { displayName: "Cohen Buller", isPrivate: true, privacyOverride: false },
  { displayName: "Ava Named", isPrivate: true, privacyOverride: true }, // admin named her
  { displayName: "Sam Public", isPrivate: false, privacyOverride: false },
]);

const teamList = (junior: boolean) => ({
  kind: "teamList",
  ...(junior ? { junior: true } : {}),
  numbering: "shirt",
  players: [
    { order: 1, surname: "BULLER", firstInitial: "C", role: "C", shirtNumber: 8, overseas: true },
    { order: 2, surname: "NAMED", firstInitial: "A", shirtNumber: 4 },
    { order: 3, surname: "PUBLIC", firstInitial: "S", shirtNumber: 5 },
  ],
});

describe("withheld junior names", () => {
  it("withholds a now-private junior's row whole: name, initial, role, number", () => {
    const out = redactWithheldJuniorNames(teamList(true), W, false);
    expect(out.players[0]).toEqual({ order: 1, surname: "PRIVATE PLAYER" });
    expect(out.players[1]).toMatchObject({ surname: "NAMED", firstInitial: "A", shirtNumber: 4 });
    expect(out.players[2]).toMatchObject({ surname: "PUBLIC", shirtNumber: 5 });
  });

  it("catches the shorter naming styles printed whole", () => {
    for (const surname of ["COHEN B", "COHEN", "Cohen Buller"]) {
      const out = redactWithheldJuniorNames(
        { junior: true, players: [{ order: 1, surname, shirtNumber: 8 }] },
        W,
        false,
      );
      expect(out.players[0]).toEqual({ order: 1, surname: "PRIVATE PLAYER" });
    }
  });

  it("checks only junior content: a senior card is untouched", () => {
    const senior = teamList(false);
    expect(redactWithheldJuniorNames(senior, W, false)).toBe(senior);
  });

  it("checks a junior slide inside a set, and its free text", () => {
    const set = {
      kind: "weekendCarousel",
      weekendCarousel: {
        slides: [
          { id: "a", junior: true, input: { ...teamList(true) } },
          {
            id: "b",
            junior: false,
            input: {
              kind: "teamList",
              players: [{ order: 1, surname: "BULLER", firstInitial: "C" }],
            },
          },
          {
            id: "c",
            junior: true,
            input: { kind: "milestone", junior: true, headline: "C. Buller makes 52!" },
          },
        ],
      },
    };
    const out = redactWithheldJuniorNames(set, W, false);
    expect(out.weekendCarousel.slides[0]!.input.players![0]!.surname).toBe("PRIVATE PLAYER");
    expect(out.weekendCarousel.slides[1]!.input.players![0]!.surname).toBe("BULLER");
    expect((out.weekendCarousel.slides[2]!.input as { headline: string }).headline).toBe(
      "Private Player makes 52!",
    );
  });

  it("withholds a name typed into a junior design and a junior caption", () => {
    const row = {
      sourceMatchIsJunior: true,
      cardInput: teamList(true),
      adjustments: {
        pages: { team: { layers: [{ kind: "text", content: "Well played Cohen Buller" }] } },
      },
    };
    const out = redactDraftRow(row, W);
    expect(JSON.stringify(out.adjustments)).not.toMatch(/buller/i);
    expect(redactJuniorText("Big day for C. BULLER and Sam", W)).toBe(
      "Big day for Private Player and Sam",
    );
  });

  it("withholds in the field's case: capitals where the field is in capitals (round 4, P3)", () => {
    const out = redactWithheldJuniorNames(
      {
        kind: "teamList",
        junior: true,
        listName: "C. BULLER",
        headline: "COHEN",
      },
      W,
      false,
    );
    expect(out.listName).toBe("PRIVATE PLAYER");
    expect(out.headline).toBe("PRIVATE PLAYER");
    // Mixed-case text keeps the mixed-case form.
    expect(redactJuniorText("Big day for C. BULLER and Sam", W)).toBe(
      "Big day for Private Player and Sam",
    );
  });

  it("returns the same value when no-one is withheld", () => {
    const none = withheldNames([]);
    const input = teamList(true);
    expect(redactWithheldJuniorNames(input, none, true)).toBe(input);
  });
});
