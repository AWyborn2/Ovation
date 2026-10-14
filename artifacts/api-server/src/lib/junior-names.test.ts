import { describe, expect, it } from "vitest";
import {
  formatJuniorName,
  isJuniorWithheld,
  juniorInitials,
  juniorPublicName,
  makeJuniorNaming,
  parseJuniorNameStyle,
  parseJuniorTeamPublishing,
  JUNIOR_WITHHELD_NAME,
} from "./junior-names";

/** Junior naming (junior PlayHQ sync plan U7; KTD12, R15, R16, R22). */

describe("formatJuniorName", () => {
  it("renders each style for a two-part name", () => {
    expect(formatJuniorName("Ollie Gallash", "full")).toBe("Ollie Gallash");
    expect(formatJuniorName("Ollie Gallash", "first_initial")).toBe("Ollie G");
    expect(formatJuniorName("Ollie Gallash", "first")).toBe("Ollie");
  });

  it("renders a single-name participant sensibly in every style", () => {
    expect(formatJuniorName("Ollie", "full")).toBe("Ollie");
    expect(formatJuniorName("Ollie", "first_initial")).toBe("Ollie");
    expect(formatJuniorName("Ollie", "first")).toBe("Ollie");
  });

  it("collapses extra and surrounding whitespace", () => {
    expect(formatJuniorName("  Ollie   Gallash  ", "full")).toBe("Ollie Gallash");
    expect(formatJuniorName("  Ollie   Gallash  ", "first_initial")).toBe("Ollie G");
    expect(formatJuniorName("  Ollie   Gallash  ", "first")).toBe("Ollie");
  });

  it("uses the last word's first letter for a hyphenated or multi-word surname", () => {
    expect(formatJuniorName("Sam Smith-Jones", "first_initial")).toBe("Sam S");
    expect(formatJuniorName("Mary Anne van Berg", "first_initial")).toBe("Mary B");
    expect(formatJuniorName("Mary Anne van Berg", "first")).toBe("Mary");
  });

  it("upper-cases a lower-case surname initial", () => {
    expect(formatJuniorName("ollie gallash", "first_initial")).toBe("ollie G");
  });

  it("returns an empty string for a blank name", () => {
    expect(formatJuniorName("   ", "first_initial")).toBe("");
    expect(formatJuniorName(null, "full")).toBe("");
  });
});

describe("juniorInitials (opposition players)", () => {
  it("renders initials as 'O. G.'", () => {
    expect(juniorInitials("Ollie Gallash")).toBe("O. G.");
  });
  it("handles single names, extra spaces and hyphens", () => {
    expect(juniorInitials("Ollie")).toBe("O.");
    expect(juniorInitials("  ollie   gallash ")).toBe("O. G.");
    expect(juniorInitials("Sam Smith-Jones")).toBe("S. S.");
  });
  it("returns an empty string for a blank name", () => {
    expect(juniorInitials("")).toBe("");
    expect(juniorInitials(null)).toBe("");
  });
});

describe("juniorPublicName", () => {
  const ollie = { displayName: "Ollie Gallash", isOwnClub: true };

  it("AE3: a private player is withheld whatever the style", () => {
    for (const style of ["full", "first_initial", "first"] as const) {
      expect(juniorPublicName({ ...ollie, isPrivate: true, privacyOverride: false }, style)).toBe(
        JUNIOR_WITHHELD_NAME,
      );
    }
    expect(JUNIOR_WITHHELD_NAME).toBe("Private Player");
  });

  it("AE3: an overridden private player shows in the club's style ('Ollie G')", () => {
    expect(
      juniorPublicName({ ...ollie, isPrivate: true, privacyOverride: true }, "first_initial"),
    ).toBe("Ollie G");
  });

  it("applies the style to a public own-club player", () => {
    const p = { ...ollie, isPrivate: false, privacyOverride: false };
    expect(juniorPublicName(p, "full")).toBe("Ollie Gallash");
    expect(juniorPublicName(p, "first_initial")).toBe("Ollie G");
    expect(juniorPublicName(p, "first")).toBe("Ollie");
  });

  it("renders opposition players as initials whatever the club's style", () => {
    for (const style of ["full", "first_initial", "first"] as const) {
      expect(
        juniorPublicName(
          {
            displayName: "Ollie Gallash",
            isPrivate: false,
            privacyOverride: false,
            isOwnClub: false,
          },
          style,
        ),
      ).toBe("O. G.");
    }
  });

  it("withholds a private opposition player rather than printing initials", () => {
    expect(
      juniorPublicName(
        { displayName: "Ollie Gallash", isPrivate: true, privacyOverride: false, isOwnClub: false },
        "full",
      ),
    ).toBe(JUNIOR_WITHHELD_NAME);
  });
});

describe("isJuniorWithheld", () => {
  it("is true only for a private, non-overridden player", () => {
    expect(isJuniorWithheld({ isPrivate: true, privacyOverride: false })).toBe(true);
    expect(isJuniorWithheld({ isPrivate: true, privacyOverride: true })).toBe(false);
    expect(isJuniorWithheld({ isPrivate: false, privacyOverride: false })).toBe(false);
    expect(isJuniorWithheld({ isPrivate: false, privacyOverride: true })).toBe(false);
  });
});

describe("settings parsing", () => {
  it("parseJuniorNameStyle falls back to full for unknown values", () => {
    expect(parseJuniorNameStyle("first_initial")).toBe("first_initial");
    expect(parseJuniorNameStyle("first")).toBe("first");
    expect(parseJuniorNameStyle("nonsense")).toBe("full");
    expect(parseJuniorNameStyle(null)).toBe("full");
  });

  it("parseJuniorTeamPublishing keeps only valid modes and drops empty age groups", () => {
    expect(
      parseJuniorTeamPublishing({
        "Year 6": { Hawks: "auto", Eagles: "approval", Bad: "sometimes" },
        "Year 7": { X: 3 },
        Junk: "auto",
      }),
    ).toEqual({ "Year 6": { Hawks: "auto", Eagles: "approval" } });
    expect(parseJuniorTeamPublishing(null)).toEqual({});
    expect(parseJuniorTeamPublishing([])).toEqual({});
  });
});

describe("makeJuniorNaming (scorecard / roster lines)", () => {
  const participants = new Map([
    ["p-ollie", { displayName: "Ollie Gallash", isPrivate: true, privacyOverride: false }],
    ["p-sam", { displayName: "Sam Taylor", isPrivate: false, privacyOverride: false }],
    ["p-ava", { displayName: "Ava Ng", isPrivate: true, privacyOverride: true }],
  ]);

  it("withholds a private own-club line and drops its participant id", () => {
    const n = makeJuniorNaming("first_initial", participants);
    expect(
      n.line({ participantId: "p-ollie", playerName: "Ollie Gallash", isHallsHead: true }),
    ).toEqual({
      playerName: "Private Player",
      participantId: null,
      isPrivate: true,
    });
  });

  it("names own-club lines from the participant row, not the stored line copy", () => {
    const n = makeJuniorNaming("first_initial", participants);
    expect(n.line({ participantId: "p-sam", playerName: "Stale Name", isHallsHead: true })).toEqual(
      {
        playerName: "Sam T",
        participantId: "p-sam",
        isPrivate: false,
      },
    );
    expect(
      n.line({ participantId: "p-ava", playerName: "Ava Ng", isHallsHead: true }).playerName,
    ).toBe("Ava N");
  });

  it("falls back to the line's name when the participant row is missing", () => {
    const n = makeJuniorNaming("first", participants);
    expect(
      n.line({ participantId: null, playerName: "Jo Bloggs", isHallsHead: true }).playerName,
    ).toBe("Jo");
  });

  it("renders opposition lines as initials and keeps their id", () => {
    const n = makeJuniorNaming("full", participants);
    expect(
      n.line({ participantId: "opp-1", playerName: "Kai Wilson", isHallsHead: false }),
    ).toEqual({
      playerName: "K. W.",
      participantId: "opp-1",
      isPrivate: false,
    });
  });

  it("exposes the style and a name formatter for directory-style reads", () => {
    const n = makeJuniorNaming("first", participants);
    expect(n.style).toBe("first");
    expect(n.format("Sam Taylor")).toBe("Sam");
  });
});

describe("makeJuniorNaming admin lines", () => {
  const participants = new Map([
    ["p-ollie", { displayName: "Ollie Gallash", isPrivate: true, privacyOverride: false }],
  ]);
  it("returns full names and ids for admins, flagging withheld players", () => {
    const n = makeJuniorNaming("first", participants);
    expect(
      n.adminLine({ participantId: "p-ollie", playerName: "O Gallash", isHallsHead: true }),
    ).toEqual({ playerName: "Ollie Gallash", participantId: "p-ollie", isPrivate: true });
    expect(
      n.adminLine({ participantId: "opp-1", playerName: "Kai Wilson", isHallsHead: false }),
    ).toEqual({ playerName: "Kai Wilson", participantId: "opp-1", isPrivate: false });
  });
});

describe("makeJuniorNaming dismissals (security review P1)", () => {
  // PlayHQ's dismissal text names the fielder and bowler: "c: O Green b: S Taylor".
  const participants = new Map([
    ["p-sam", { displayName: "Sam Taylor", isPrivate: false, privacyOverride: false }],
  ]);
  const raw = "c: Olivia Green b: Sam Taylor";

  it.each(["full", "first_initial", "first"] as const)(
    "a public %s-style line shows the dismissal mode only, never a name",
    (style) => {
      const n = makeJuniorNaming(style, participants);
      const own = {
        ...n.line({ participantId: "p-sam", playerName: "Sam Taylor", isHallsHead: true }),
        dismissal: n.dismissal(raw),
      };
      const opp = {
        ...n.line({ participantId: "opp-1", playerName: "Kai Wilson", isHallsHead: false }),
        dismissal: n.dismissal("st: Sam Taylor b: Olivia Green"),
      };
      expect(own.dismissal).toBe("c: b:");
      expect(opp.dismissal).toBe("st: b:");
      expect(JSON.stringify(opp)).not.toMatch(/green|taylor|wilson/i);
      if (style !== "full") expect(JSON.stringify(own)).not.toMatch(/green|taylor/i);
    },
  );

  it("keeps not-out and blank dismissals so not-out counting is unchanged", () => {
    const n = makeJuniorNaming("first", participants);
    expect(n.dismissal("not out")).toBe("not out");
    expect(n.dismissal(null)).toBeNull();
  });

  it("the admin view keeps the raw text", () => {
    const n = makeJuniorNaming("first", participants);
    expect(n.adminDismissal(raw)).toBe(raw);
  });
});

describe("makeJuniorNaming participant ids are case-insensitive (security review P2)", () => {
  // A legacy participant row kept its mixed-case GUID (migration 0038 only reports
  // those); synced lines carry the lowercased id. The lookup must still find the
  // row, or a private child would be named from the line's stored copy.
  const participants = new Map([
    ["ABCD-Ollie-0001", { displayName: "Ollie Gallash", isPrivate: true, privacyOverride: false }],
  ]);

  it("withholds a private participant whose stored id differs only by case", () => {
    const n = makeJuniorNaming("full", participants);
    expect(
      n.line({ participantId: "abcd-ollie-0001", playerName: "Ollie Gallash", isHallsHead: true }),
    ).toEqual({ playerName: "Private Player", participantId: null, isPrivate: true });
    expect(
      n.line({ participantId: "ABCD-OLLIE-0001", playerName: "Ollie Gallash", isHallsHead: true })
        .isPrivate,
    ).toBe(true);
  });
});
