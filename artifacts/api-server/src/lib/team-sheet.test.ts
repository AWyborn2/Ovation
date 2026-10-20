import { describe, it, expect } from "vitest";
import {
  absoluteLogoUrl,
  formatSheetDate,
  normaliseOvers,
  renderTeamSheetHtml,
  teamSheetPlayers,
  type TeamSheet,
} from "./team-sheet";
import { PCA_BYLAW_5_9, juniorBowlingLimit } from "./team-sheet-rules";

/** The printed team sheet (pure parts). The DB loader is exercised by the route. */

const member = (id: number, first: string, last: string, dateOfBirth: string | null = null) => ({
  id,
  firstName: first,
  lastName: last,
  preferredName: null,
  dateOfBirth,
  linkedPlayerId: null,
  playhqProfileId: null,
});

const MEMBERS = [
  member(1, "Ava", "Hill"),
  member(2, "Ben", "Cole", "2011-08-01"),
  member(3, "Cal", "Dunn"),
  member(4, "Dan", "Ford"),
];

describe("teamSheetPlayers", () => {
  const side = {
    // Slot 2 open, the 12th (index 11) filled.
    slots: [
      { memberId: 1 },
      { memberId: null },
      { memberId: 2 },
      { memberId: 3 },
      ...Array.from({ length: 7 }, () => ({ memberId: null })),
      { memberId: 4 },
    ],
    captainMemberId: 1,
    keeperMemberId: 1,
  };

  it("lists the side in order, closes open slots, and puts the 12th last", () => {
    const players = teamSheetPlayers({
      side,
      members: MEMBERS,
      shirtNumberOf: (m) => (m.id === 3 ? "7" : null),
      juniorLimitOf: null,
    });
    expect(players.map((p) => [p.order, p.name, p.role, p.shirtNumber])).toEqual([
      [1, "Ava Hill", "C/WK", null],
      [2, "Ben Cole", null, null],
      [3, "Cal Dunn", null, "7"],
      [12, "Dan Ford", null, null],
    ]);
  });

  it("marks overseas players from the side's finalise snapshot only", () => {
    const players = teamSheetPlayers({
      side: { ...side, slots: side.slots.map((s, i) => (i === 2 ? { ...s, overseas: true } : s)) },
      members: MEMBERS,
      shirtNumberOf: () => null,
      juniorLimitOf: null,
    });
    expect(players.map((p) => p.overseas)).toEqual([false, true, false, false]);
  });

  it("never tags the 12th player as captain or keeper", () => {
    const players = teamSheetPlayers({
      side: { ...side, captainMemberId: 4, keeperMemberId: 4 },
      members: MEMBERS,
      shirtNumberOf: () => null,
      juniorLimitOf: null,
    });
    expect(players.find((p) => p.order === 12)?.role).toBeNull();
  });

  it("adds Junior Aged Player limits only when rules are given", () => {
    const players = teamSheetPlayers({
      side,
      members: MEMBERS,
      shirtNumberOf: () => null,
      juniorLimitOf: (m) => juniorBowlingLimit(PCA_BYLAW_5_9, m.dateOfBirth, 2026),
    });
    expect(players[1].junior).toEqual({ age: 14, band: "14–15", maxOversPerDay: 12, maxSpell: 5 });
    expect(players[0].junior).toBeNull();
  });
});

describe("normaliseOvers", () => {
  it("keeps the number from '50', '50 overs' or ' 40 '", () => {
    expect(normaliseOvers("50")).toBe("50");
    expect(normaliseOvers("50 overs")).toBe("50");
    expect(normaliseOvers(" 40 ")).toBe("40");
    expect(normaliseOvers(20)).toBe("20");
  });

  it("keeps short free text and drops blanks", () => {
    expect(normaliseOvers("80 per day")).toBe("80 per day");
    expect(normaliseOvers("   ")).toBeNull();
    expect(normaliseOvers(null)).toBeNull();
  });
});

describe("absoluteLogoUrl", () => {
  it("keeps http(s) URLs and roots same-origin paths at the request origin", () => {
    expect(absoluteLogoUrl("https://cdn/logo.png", null)).toBe("https://cdn/logo.png");
    expect(absoluteLogoUrl("/api/storage/logo.png", "https://hh.example")).toBe(
      "https://hh.example/api/storage/logo.png",
    );
  });

  it("drops other schemes and protocol-relative URLs", () => {
    expect(absoluteLogoUrl("file:///etc/passwd", "https://hh.example")).toBeNull();
    expect(absoluteLogoUrl("//evil/logo.png", "https://hh.example")).toBeNull();
    expect(absoluteLogoUrl("/logo.png", null)).toBeNull();
  });
});

describe("formatSheetDate", () => {
  it("prints the Perth date and start time", () => {
    // 04:00Z = 12:00 in Perth.
    const { date, startTime } = formatSheetDate(new Date("2026-10-17T04:00:00Z"));
    expect(date).toBe("Saturday 17 October 2026");
    expect(startTime).toBe("12:00 pm");
  });
});

describe("renderTeamSheetHtml", () => {
  const sheet: TeamSheet = {
    section: "senior",
    clubName: "Halls Head <CC>",
    logoUrl: null,
    homeTeam: "Halls Head A Grade",
    awayTeam: "SBCC A Grade",
    grade: "A Grade",
    round: "Round 2",
    date: "Saturday 17 October 2026",
    startTime: "12:00 pm",
    format: "One Day",
    overs: "50",
    venue: "Rushton Park",
    competition: "A Grade Wyllie Cup",
    bowlingRulesSource: "PCA Bylaw 5.9",
    ruleNotes: ["All 12 named players may bowl."],
    players: [
      { order: 1, name: "Ava Hill", role: "C", shirtNumber: "9", junior: null },
      {
        order: 2,
        name: "Ben Cole",
        role: null,
        shirtNumber: null,
        junior: { age: 14, band: "14–15", maxOversPerDay: 12, maxSpell: 5 },
      },
    ],
    generatedAt: "Wednesday 14 October 2026",
  };

  it("prints the match, the roles, the limits and the competition's notes, escaped", () => {
    const html = renderTeamSheetHtml(sheet, null);
    expect(html).toContain("Halls Head &lt;CC&gt;");
    expect(html).toContain("A Grade Wyllie Cup");
    expect(html).toContain('Ava Hill <b class="role">(C)</b>');
    expect(html).toContain("Junior Aged Players only");
    expect(html).toContain("14–15");
    expect(html).toContain("under PCA Bylaw 5.9");
    expect(html).toContain("All 12 named players may bowl.");
    expect(html).not.toContain("<script");
    // Always 12 rows, so blanks can be written in.
    expect(html.match(/<td class="c no">/g)).toHaveLength(12);
  });

  it("prints OS after an overseas player's name, with the key only when one is listed", () => {
    expect(renderTeamSheetHtml(sheet, null)).not.toContain("OS overseas player");
    const html = renderTeamSheetHtml(
      { ...sheet, players: sheet.players.map((p, i) => (i === 0 ? { ...p, overseas: true } : p)) },
      null,
    );
    expect(html).toContain(
      'Ava Hill <b class="role">(C)</b> <b class="os" title="Overseas player">OS</b>',
    );
    expect(html).toContain("OS overseas player");
  });

  it("leaves the bowling columns off a junior sheet and labels the age group", () => {
    const html = renderTeamSheetHtml(
      {
        ...sheet,
        section: "junior",
        grade: "Year 7 Boys",
        bowlingRulesSource: null,
        ruleNotes: [],
      },
      null,
    );
    expect(html).not.toContain("Junior Aged Players");
    expect(html).toContain("Age group");
    expect(html).not.toContain("All 12 named players may bowl.");
  });

  it("tells the captain to check the rules when the competition's aren't known", () => {
    const html = renderTeamSheetHtml({ ...sheet, bowlingRulesSource: null, ruleNotes: [] }, null);
    expect(html).toContain("Check your competition's rules for the limits.");
  });
});
