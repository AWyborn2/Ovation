import { describe, it, expect } from "vitest";
import {
  absoluteLogoUrl,
  formatSheetDate,
  normaliseOvers,
  renderTeamSheetHtml,
  renderTeamSheetsHtml,
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

describe("team sheet side size (ADR-009)", () => {
  const big = (n: number) =>
    Array.from({ length: n }, (_, i) => member(i + 1, `P${i + 1}`, "Lee", null));

  const sheet: TeamSheet = {
    section: "senior",
    clubName: "Halls Head",
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
    ruleNotes: [],
    players: [],
    generatedAt: "Wednesday 14 October 2026",
  };

  /** The printed rows as "label|class|name" lines: the sheet's snapshot. */
  const rowsOf = (html: string) =>
    [
      ...html.matchAll(
        /<tr class="(twelfth|)">\s*<td class="c no">([^<]*)<\/td>\s*<td class="c shirt">[^<]*<\/td>\s*<td class="name">([^<]*)/g,
      ),
    ].map(([, cls, label, name]) => `${label}|${cls}|${name.trim()}`);

  it("a side of 12 prints exactly as before: 11 rows, a shaded 12th, 9.2 mm rows", () => {
    const players = teamSheetPlayers({
      side: {
        slots: big(12).map((m) => ({ memberId: m.id })),
        captainMemberId: 1,
        keeperMemberId: 12,
        sideSize: 12,
      },
      members: big(12),
      shirtNumberOf: () => null,
      juniorLimitOf: null,
    });
    expect(players.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // The 12th never holds a role.
    expect(players[11].role).toBeNull();
    const html = renderTeamSheetHtml({ ...sheet, sideSize: 12, players }, null);
    // Unchanged from a sheet that predates side sizes.
    expect(html).toBe(renderTeamSheetHtml({ ...sheet, players }, null));
    expect(rowsOf(html)).toEqual([
      "1||P1 Lee",
      "2||P2 Lee",
      "3||P3 Lee",
      "4||P4 Lee",
      "5||P5 Lee",
      "6||P6 Lee",
      "7||P7 Lee",
      "8||P8 Lee",
      "9||P9 Lee",
      "10||P10 Lee",
      "11||P11 Lee",
      "12th|twelfth|P12 Lee",
    ]);
    expect(html).toContain("height: 9.2mm;");
  });

  it("a side of 12 that all play prints 1–12 with no 12th row, and slot 12 can hold a role", () => {
    const players = teamSheetPlayers({
      side: {
        slots: big(12).map((m) => ({ memberId: m.id })),
        captainMemberId: 1,
        keeperMemberId: 12,
        sideSize: 12,
        allPlay: true,
      },
      members: big(12),
      shirtNumberOf: () => null,
      juniorLimitOf: null,
    });
    expect(players.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(players[11].role).toBe("WK");
    const html = renderTeamSheetHtml({ ...sheet, sideSize: 12, allPlay: true, players }, null);
    const rows = rowsOf(html);
    expect(rows).toHaveLength(12);
    expect(rows[11]).toBe("12||P12 Lee");
    expect(html).not.toContain(">12th<");
    expect(html).toContain("height: 9.2mm;");
  });

  it("a side of 14 prints 14 numbered rows, no 12th, sized to stay on one A4 page", () => {
    const players = teamSheetPlayers({
      side: {
        slots: big(14).map((m) => ({ memberId: m.id })),
        captainMemberId: 13,
        keeperMemberId: 14,
        sideSize: 14,
      },
      members: big(14),
      shirtNumberOf: () => null,
      juniorLimitOf: null,
    });
    expect(players.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    // Above 12 any player can be captain or keeper.
    expect(players[12].role).toBe("C");
    expect(players[13].role).toBe("WK");
    const html = renderTeamSheetHtml({ ...sheet, sideSize: 14, players }, null);
    expect(rowsOf(html)).toEqual([
      "1||P1 Lee",
      "2||P2 Lee",
      "3||P3 Lee",
      "4||P4 Lee",
      "5||P5 Lee",
      "6||P6 Lee",
      "7||P7 Lee",
      "8||P8 Lee",
      "9||P9 Lee",
      "10||P10 Lee",
      "11||P11 Lee",
      "12||P12 Lee",
      "13||P13 Lee",
      "14||P14 Lee",
    ]);
    expect(html).not.toContain("12th");
    expect(html).not.toContain('class="twelfth"');
    // 14 rows take the height 12 rows did (12 × 9.2 mm), with the junior columns.
    expect(html).toContain("height: 7.9mm;");
    expect(html).toContain("Junior Aged Players only");
    expect(html.match(/<td class="c no">/g)).toHaveLength(14);
  });

  it("closes open slots above 12 and numbers the side 1–N", () => {
    const slots = big(14).map((m) => ({ memberId: m.id as number | null }));
    slots[3] = { memberId: null };
    const players = teamSheetPlayers({
      side: { slots, captainMemberId: null, keeperMemberId: null, sideSize: 14 },
      members: big(14),
      shirtNumberOf: () => null,
      juniorLimitOf: null,
    });
    expect(players.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(players[12].name).toBe("P14 Lee");
  });
});

describe("renderTeamSheetsHtml", () => {
  const sheet: TeamSheet = {
    section: "senior",
    clubName: "Halls Head",
    logoUrl: null,
    homeTeam: "Halls Head A Grade",
    awayTeam: "SBCC A Grade",
    grade: "A Grade",
    round: "Round 2",
    date: "Saturday 17 October 2026",
    startTime: "12:00 pm",
    format: null,
    overs: null,
    venue: null,
    competition: null,
    bowlingRulesSource: null,
    ruleNotes: [],
    players: [{ order: 1, name: "Ava Hill", role: "C", shirtNumber: "9", junior: null }],
    generatedAt: "Wednesday 14 October 2026",
  };

  it("puts each sheet on its own page with its own row height, in one document", () => {
    const base = renderTeamSheetHtml(sheet, null);
    const html = renderTeamSheetsHtml([
      { sheet, logoSrc: null },
      { sheet: { ...sheet, sideSize: 14 }, logoSrc: null },
    ]);
    expect(html.match(/<!doctype html>/g)).toHaveLength(1);
    expect(html.match(/<section class="page /g)).toHaveLength(2);
    expect(html).toContain(".page + .page { break-before: page; }");
    expect(html).toContain(".p0 .players td { height: 9.2mm; }");
    expect(html).toContain(".p1 .players td { height: 7.9mm; }");
    expect(html).toContain("<title>Team sheets</title>");
    expect(base).toContain("<title>Team sheet</title>");
  });
});
