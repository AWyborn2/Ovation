import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CARD_KINDS } from "@/lib/share-card";
import { renderPackCard, type PackTokens } from "@/lib/pack-render";
import { GenericCardForm } from "./fields";
import { DESCRIPTORS } from "./descriptors";
import {
  initialCardState,
  buildCardInput,
  JUNIOR_CAPABLE,
  ROW_CAPS,
} from "./logic";
import {
  ladderRowsToState,
  teamListPlayersToState,
  clubSeasonTotalsToState,
  weekendWrapToState,
  fixtureToMatchDayState,
} from "./prefill";
import type {
  LadderCardRow,
  ClubSeasonGradeLeaders,
  WeekendWrap,
  TeamListPlayer as TeamListPlayerDto,
  Fixture,
} from "@workspace/api-client-react";

const TOKENS: PackTokens = {
  accent: "#FBAC27",
  panel: "#42342B",
  ink: "#101216",
  textLight: "#F5F2E8",
  displayFont: "anton",
};

const SIZES = ["square", "portrait", "story"] as const;
const hasUnresolved = (html: string) => /\{\{/.test(html);

describe("card-forms: every kind builds a renderable input", () => {
  for (const kind of CARD_KINDS) {
    it(`${kind}: initial state → valid input, renders every size with no unresolved fields`, () => {
      const state = initialCardState(kind);
      const input = buildCardInput(kind, state, false);
      expect(input.kind).toBe(kind);
      for (const size of SIZES) {
        const html = renderPackCard(input, size, true, TOKENS, false);
        expect(html.length).toBeGreaterThan(0);
        expect(hasUnresolved(html)).toBe(false);
      }
    });
  }
});

describe("card-forms: editing a field flows into the built input + preview", () => {
  it("century runs/name edits reach the input and the rendered card", () => {
    const state = {
      ...initialCardState("century"),
      runs: 150,
      playerName: "Edited Name",
    };
    const input = buildCardInput("century", state, false) as Extract<
      ReturnType<typeof buildCardInput>,
      { kind: "century" }
    >;
    expect(input.runs).toBe(150);
    expect(input.playerName).toBe("Edited Name");
    const html = renderPackCard(input, "square", true, TOKENS, false);
    expect(html).toContain("Edited Name");
  });

  it("a prefilled ladder field stays editable after prefill", () => {
    const patch = ladderRowsToState("A Grade", [
      { pos: 1, team: "Halls Head", played: 8, won: 7, lost: 1, points: 42, isClub: true },
    ]);
    // Simulate the admin editing the prefilled team name.
    const edited = {
      ...patch,
      rows: (patch.rows ?? []).map((r) => ({ ...r, team: "Renamed" })),
    };
    expect(edited.rows[0].team).toBe("Renamed");
    const input = buildCardInput("ladder", { ...initialCardState("ladder"), ...edited }, false);
    const html = renderPackCard(input, "square", true, TOKENS, false);
    expect(html).toContain("Renamed");
  });
});

describe("card-forms: image field type (team/squad photo upload)", () => {
  it("premiership carries teamPhotoUrl from form state into the built input", () => {
    const url = "/api/storage/objects/premiers-2024.jpg";
    const state = { ...initialCardState("premiership"), teamPhotoUrl: url };
    const input = buildCardInput("premiership", state, false) as Extract<
      ReturnType<typeof buildCardInput>,
      { kind: "premiership" }
    >;
    expect(input.teamPhotoUrl).toBe(url);
    // And it renders into the teamPhoto slot as an <img> (not left as a placeholder).
    const html = renderPackCard(input, "square", true, TOKENS, false);
    expect(html).toContain(`<img src="${url}"`);
  });

  it("teamList carries squadPhotoUrl from form state into the built input", () => {
    const url = "/api/storage/objects/squad-a-grade.jpg";
    const state = { ...initialCardState("teamList"), squadPhotoUrl: url };
    const input = buildCardInput("teamList", state, false) as Extract<
      ReturnType<typeof buildCardInput>,
      { kind: "teamList" }
    >;
    expect(input.squadPhotoUrl).toBe(url);
  });

  it("descriptors mark the team/squad photo fields as image (not free-text)", () => {
    const prem = DESCRIPTORS.premiership.fields.find((f) => f.key === "teamPhotoUrl");
    expect(prem?.type).toBe("image");
    const squad = DESCRIPTORS.teamList.fields.find((f) => f.key === "squadPhotoUrl");
    expect(squad?.type).toBe("image");
  });

  it("(B1) converts the remaining URL slots — player photo + opposition logo — to image", () => {
    // Every kind that used the shared `photo()` descriptor now exposes an upload
    // control, not a free-text "…URL" box.
    for (const kind of [
      "milestone",
      "player",
      "record",
      "gradeLeader",
      "debut",
      "newCap",
      "century",
      "fiveFor",
      "bigMoment",
      "newSigning",
    ] as const) {
      const f = DESCRIPTORS[kind].fields.find((x) => x.key === "photoUrl");
      expect(f?.type, kind).toBe("image");
    }
    // The match-day opposition logo is likewise an image slot now.
    const oppLogo = DESCRIPTORS.matchDay.fields.find((f) => f.key === "oppositionLogoUrl");
    expect(oppLogo?.type).toBe("image");
    // No descriptor keeps a free-text "...Url" field any more.
    for (const desc of Object.values(DESCRIPTORS)) {
      for (const f of desc.fields) {
        if (f.key.endsWith("Url")) expect(f.type, f.key).toBe("image");
      }
    }
  });

  it("(B1) ScalarControl routes the converted opposition-logo field to the upload control", () => {
    // matchDay's oppositionLogoUrl was a free-text URL box; it is now an image
    // slot. (matchDay has no player typeahead, so it renders standalone.)
    const { container, getByText } = render(
      createElement(GenericCardForm, {
        kind: "matchDay",
        descriptor: DESCRIPTORS.matchDay,
        state: initialCardState("matchDay"),
        setState: () => {},
      }),
    );
    // The image field renders ImageControl's hidden file input + upload button.
    const fileInput = container.querySelector('input[type="file"][accept="image/*"]');
    expect(fileInput).not.toBeNull();
    expect(getByText("Upload image")).toBeTruthy();
    expect(getByText("Opposition logo")).toBeTruthy();
  });

  it("ScalarControl routes an image field to the upload control (file input + upload button)", () => {
    const { container, getByText } = render(
      createElement(GenericCardForm, {
        kind: "premiership",
        descriptor: DESCRIPTORS.premiership,
        state: initialCardState("premiership"),
        setState: () => {},
      }),
    );
    // ImageControl renders a hidden image file input — unique to the image type.
    const fileInput = container.querySelector('input[type="file"][accept="image/*"]');
    expect(fileInput).not.toBeNull();
    // …and the upload affordance (no value yet → "Upload image").
    expect(getByText("Upload image")).toBeTruthy();
    // The Team photo label is present; a plain text field (Competition) is not a file input.
    expect(getByText("Team photo")).toBeTruthy();
  });

  it("with a value set, the URL input stays present (editable in place) and shows Replace/preview", () => {
    const url = "/api/storage/objects/premiers-2024.jpg";
    const { container, getByText } = render(
      createElement(GenericCardForm, {
        kind: "premiership",
        descriptor: DESCRIPTORS.premiership,
        state: { ...initialCardState("premiership"), teamPhotoUrl: url },
        setState: () => {},
      }),
    );
    // The URL text input remains mounted even with a value → typing/legacy edits
    // work (the fix for the "unmounts after first keystroke" regression). Match on
    // the live DOM value property, not the attribute (controlled inputs).
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>("input"));
    expect(inputs.some((el) => el.value === url)).toBe(true);
    // Preview image (alt = "<label> preview") and the Replace affordance both show.
    expect(container.querySelector('img[alt="Team photo preview"]')).not.toBeNull();
    expect(getByText("Replace image")).toBeTruthy();
  });
});

describe("card-forms: junior forces junior:true only for capable kinds", () => {
  it("teamList (junior-capable) gets junior:true", () => {
    const input = buildCardInput("teamList", initialCardState("teamList"), true) as {
      junior?: boolean;
    };
    expect(input.junior).toBe(true);
    expect(JUNIOR_CAPABLE.has("teamList")).toBe(true);
  });

  it("century (not junior-capable) never carries a junior flag", () => {
    const input = buildCardInput("century", initialCardState("century"), true) as {
      junior?: boolean;
    };
    expect(input.junior).toBeUndefined();
    expect(JUNIOR_CAPABLE.has("century")).toBe(false);
  });
});

describe("card-forms: repeat-row editors respect template row caps", () => {
  it("ladder caps at 7 rows", () => {
    const rows: LadderCardRow[] = Array.from({ length: 12 }, (_, i) => ({
      pos: i + 1,
      team: `Team ${i + 1}`,
      played: 8,
      won: 4,
      lost: 4,
      points: 24,
      isClub: false,
    }));
    const state = { ...initialCardState("ladder"), rows };
    const input = buildCardInput("ladder", state, false) as { rows: unknown[] };
    expect(input.rows).toHaveLength(7);
    expect(ROW_CAPS.ladder?.cap).toBe(7);
  });

  it("teamList caps at 12 players", () => {
    const players = Array.from({ length: 15 }, (_, i) => ({
      order: i + 1,
      surname: `PLAYER${i + 1}`,
    }));
    const state = { ...initialCardState("teamList"), players };
    const input = buildCardInput("teamList", state, false) as { players: unknown[] };
    expect(input.players).toHaveLength(12);
    expect(ROW_CAPS.teamList?.cap).toBe(12);
  });

  it("clubLeaderboard caps at 4 leaders", () => {
    const leaders = Array.from({ length: 6 }, (_, i) => ({
      gradeLabel: `G${i + 1}`,
      playerName: `P${i + 1}`,
      value: String(i),
    }));
    const state = { ...initialCardState("clubLeaderboard"), leaders };
    const input = buildCardInput("clubLeaderboard", state, false) as { leaders: unknown[] };
    expect(input.leaders).toHaveLength(4);
    expect(ROW_CAPS.clubLeaderboard?.cap).toBe(4);
  });

  it("weekendWrap caps at 4 matches", () => {
    const matches = Array.from({ length: 6 }, (_, i) => ({
      gradeLabel: `G${i + 1}`,
      resultLine: "won",
      performers: "",
      outcome: "won" as const,
    }));
    const state = { ...initialCardState("weekendWrap"), matches };
    const input = buildCardInput("weekendWrap", state, false) as { matches: unknown[] };
    expect(input.matches).toHaveLength(4);
    expect(ROW_CAPS.weekendWrap?.cap).toBe(4);
  });
});

describe("card-forms: prefill mappers", () => {
  it("clubSeasonTotalsToState picks the category leader per grade", () => {
    const grades: ClubSeasonGradeLeaders[] = [
      {
        gradeLabel: "A Grade",
        topRunScorer: { playerName: "Jack Manuel", value: 428 },
        topWicketTaker: { playerName: "Tom Burrage", value: 24 },
      },
      { gradeLabel: "B Grade", topRunScorer: null, topWicketTaker: null },
    ];
    const runs = clubSeasonTotalsToState(2024, "Runs", grades);
    expect(runs.category).toBe("Runs");
    expect(runs.season).toBe("2024/25");
    expect(runs.leaders?.[0]).toMatchObject({ gradeLabel: "A GRADE", playerName: "Jack Manuel", value: "428" });
    const wickets = clubSeasonTotalsToState(2024, "Wickets", grades);
    expect(wickets.leaders?.[0]).toMatchObject({ playerName: "Tom Burrage", value: "24" });
    // Empty grade renders as a blank-but-present row (still editable).
    expect(wickets.leaders?.[1]).toMatchObject({ gradeLabel: "B GRADE", playerName: "", value: "" });
  });

  it("teamListPlayersToState excludes fill-in ids (>= 90000)", () => {
    const dto: TeamListPlayerDto[] = [
      { order: 1, displayName: "Jack Manuel", playerId: 12 },
      { order: 2, displayName: "Sam Rudge", playerId: 90001 },
      { order: 3, displayName: "Free Text", role: "C" },
    ];
    const patch = teamListPlayersToState(dto);
    // The fill-in id (90001, "Sam Rudge") is dropped; surnames use the bundle's upper-case style.
    expect(patch.players).toHaveLength(2);
    expect(patch.players?.map((p) => p.surname)).toEqual(["MANUEL", "TEXT"]);
    expect(patch.players?.[1].role).toBe("C");
  });

  it("weekendWrapToState maps the outcome enum to the card union", () => {
    const wrap: WeekendWrap = {
      roundLabel: "ROUND 8 WRAP",
      dateRange: "13–14 DEC",
      matches: [
        { gradeLabel: "A", resultLine: "won", performers: "", outcome: "WON" },
        { gradeLabel: "B", resultLine: "lost", performers: "", outcome: "LOST" },
        { gradeLabel: "C", resultLine: "drew", performers: "", outcome: "" },
      ],
    };
    const patch = weekendWrapToState(wrap);
    expect(patch.roundLabel).toBe("ROUND 8 WRAP");
    expect(patch.matches?.map((m) => m.outcome)).toEqual(["won", "lost", "draw"]);
  });

  it("fixtureToMatchDayState derives home/away and opposition", () => {
    const fixture: Fixture = {
      id: 1,
      grade: "A Grade",
      roundLabel: "ROUND 8",
      opponentName: "Baldivis",
      opponentLogoUrl: "https://logo",
      venue: "Sample Oval",
      startAt: "2024-12-14T04:00:00.000Z",
      isHome: true,
      source: "manual",
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const patch = fixtureToMatchDayState(fixture);
    expect(patch.oppositionName).toBe("Baldivis");
    expect(patch.homeAway).toBe("HOME");
    expect(patch.roundLabel).toBe("ROUND 8");
    expect(patch.oppositionLogoUrl).toBe("https://logo");
  });
});
