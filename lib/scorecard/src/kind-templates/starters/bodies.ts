import type { TemplateSize } from "../document";
import type { TemplateCardKind } from "../fields";
import { tall, type Design, type Kit } from "./kit";

/**
 * Each card kind's body (plan U6), shared by every look: the blocks down the
 * card's body column, after the Club Kit pack's body for the kind (Club
 * Colours handoff §5). Text carries `{{field}}` tokens for everything that
 * holds data, so an empty field disappears instead of showing sample wording.
 *
 * `plain` marks a card whose look may drop the photo to give the data the
 * room (Broadcast plays lists and live cards on its plain stage).
 */

export type Body = Design & { plain?: boolean };

const heroSize = (flat: number, tallSize: number) => (s: TemplateSize) =>
  tall(s) ? tallSize : flat;
const MATCH_LINE = "{{grade}} · vs {{opponent}} · RD {{round}}";

export const BODIES: Record<TemplateCardKind, (k: Kit) => Body> = {
  matchSummary: (k) => ({
    chip: "SCORECARD",
    blocks: [
      k.eyebrow("match-title", "{{matchTitle}}"),
      k.hero(
        "result-word",
        "Result word",
        "{{resultWord}}",
        (s) => (s === "square" ? 16 : s === "landscape" ? 18 : 24),
        1,
      ),
      k.scoreBars("scores"),
      {
        key: "result",
        h: () => 9.4,
        gap: () => 2.4,
        make: (b) =>
          k
            .displayLine("result", "Result", "{{result}}", 4.2)
            .make(b)
            .map((l) => ({
              ...l,
              style: { ...(l.style as object), fontFamily: k.F.cond, fontWeight: 700 },
            })),
      },
      k.metaLine("performers", "{{club.performers}}", 1, "Top performers"),
    ],
  }),

  milestone: (k) => ({
    chip: "MILESTONE",
    blocks: [
      k.eyebrow("tier", "{{tierLabel}}"),
      k.hero("value", "Milestone number", "{{currentValue}}", heroSize(23, 30)),
      k.dashLabel("label", "{{milestoneLabel}}"),
      k.displayLine("player", "Player name", "{{playerName}}", 9),
      k.metaLine("headline", "{{headline}}"),
    ],
  }),

  century: (k) => ({
    chip: "CENTURY",
    blocks: [
      k.eyebrow("raised", "RAISED THE BAT"),
      k.heroWithAside("runs", "Runs", "{{runs}}", "({{balls}})", heroSize(23, 30), 3.4),
      k.dashLabel("label", "CENTURY"),
      k.displayLine("player", "Player name", "{{playerName}}", 9),
      k.eyebrow("match", MATCH_LINE, k.C.muted, 1.4),
    ],
  }),

  fiveFor: (k) => ({
    chip: "FIVE-FOR",
    blocks: [
      k.eyebrow("wickets", "{{wickets}} WICKETS"),
      k.heroWithAside("figures", "Figures", "{{figures}}", "({{overs}})", heroSize(20, 26), 4.8),
      k.dashLabel("label", "FIVE-FOR"),
      k.displayLine("player", "Player name", "{{playerName}}", 9),
      k.eyebrow("match", MATCH_LINE, k.C.muted, 1.4),
    ],
  }),

  debut: (k) => ({
    chip: "DEBUT",
    blocks: [
      k.eyebrow("debut", "FIRST GRADE DEBUT · {{grade}} · {{season}}"),
      k.displayLine("player", "Player name", "{{playerName}}", 10, 2, 1.4),
      k.metaLine("tribute", "Round {{round}} · vs {{opponent}} — {{tributeLine}}"),
      k.badge("cap", "CAP {{capNumber}}"),
    ],
  }),

  ladder: (k) => {
    const cols = [
      { field: "pos", x: 0, w: 9, head: "#" },
      { field: "team", x: 9, w: 47, head: "TEAM" },
      { field: "played", x: 56, w: 11, head: "P" },
      { field: "won", x: 67, w: 11, head: "W" },
      { field: "lost", x: 78, w: 11, head: "L" },
      { field: "points", x: 89, w: 11, head: "PTS" },
    ];
    const base = { fontFamily: k.F.sans, fontWeight: 600, fontSize: 2.1, background: k.C.panel };
    const cell = (field: string) => {
      if (field === "pos")
        return {
          ...base,
          fontFamily: k.F.cond,
          fontWeight: 900,
          fontSize: 2.8,
          color: k.C.accent,
          align: "center" as const,
        };
      if (field === "team") return { ...base, color: k.C.ink, align: "left" as const };
      if (field === "points")
        return {
          ...base,
          fontFamily: k.F.cond,
          fontWeight: 900,
          fontSize: 2.8,
          color: k.C.ink,
          align: "center" as const,
        };
      return { ...base, color: k.C.muted, align: "center" as const };
    };
    return {
      chip: "LADDER",
      depth: "list",
      plain: true,
      blocks: [
        k.eyebrow("competition", "{{competitionName}} · {{asOfLabel}}"),
        k.displayLine(
          "title",
          "Title",
          "{{gradeLabel}} LADDER",
          9,
          (s) => (s === "square" ? 2 : 1),
          1,
        ),
        k.headings(
          "table-head",
          cols.map((c) => ({
            x: c.x,
            w: c.w,
            label: c.head,
            align: c.field === "team" ? ("left" as const) : ("center" as const),
          })),
        ),
        k.list(
          "ladder-rows",
          "Ladder rows",
          "rows",
          (s) => (s === "landscape" ? 5 : s === "story" ? 10 : 8),
          4.6,
          0.6,
          cols.map((c) => ({ field: c.field, x: c.x, w: c.w, style: cell(c.field) })),
          {
            gap: 0.6,
            // The club's own row, in its colours.
            variants: {
              club: Object.fromEntries(
                cols.map((c) => [c.field, { background: k.C.fill, color: k.C.onFill }]),
              ),
            },
          },
        ),
      ],
    };
  },

  player: (k) => ({
    chip: "SPOTLIGHT",
    blocks: [
      k.eyebrow("eyebrow", "PLAYER SPOTLIGHT · {{season}}"),
      k.displayLine("player", "Player name", "{{playerName}}", 9, 2, 1.2),
      k.statCells(
        "stats",
        [1, 2, 3].map((n) => ({ value: `{{stat${n}Value}}`, label: `{{stat${n}Label}}` })),
      ),
      k.metaLine("headline", "{{headline}}", 2, "Headline"),
    ],
  }),

  record: (k) => ({
    chip: "RECORD",
    blocks: [
      k.eyebrow("eyebrow", "CLUB RECORD · {{grade}}"),
      k.displayLine("title", "Record title", "{{title}}", 6, 2, 1),
      k.hero("value", "Record value", "{{value}}", heroSize(23, 30), 1),
      k.displayLine("holder", "Record holder", "{{playerName}}", 7, 2, 1.6),
    ],
  }),

  gradeLeader: (k) => ({
    chip: "LEADER",
    blocks: [
      k.eyebrow("eyebrow", "{{grade}} · {{season}}"),
      ...k.twoLine("title", "{{titleTop}}", "{{titleBottom}}", 7),
      k.hero("value", "Leading value", "{{value}}", heroSize(22, 28), 1.6),
      k.dashLabel("category", "{{category}}", 1.4, 5),
      k.displayLine("player", "Leader", "{{playerName}}", 8, 2, 2),
    ],
  }),

  premiership: (k) => ({
    chip: "PREMIERS",
    blocks: [
      k.eyebrow("eyebrow", "{{competition}}"),
      k.hero("word", "Premiers", "PREMIERS", heroSize(14.5, 19), 1),
      k.displayLine("season", "Season and grade", "{{season}} {{grade}}", 6, 1, 1),
      k.panel("final", "Grand final", [
        { key: "result", name: "Result", content: "{{result}}", font: "cond", size: 3.6, h: 5 },
        {
          key: "mom",
          name: "Player of the final",
          content: "Player of the final · {{mom}}",
          font: "sans",
          size: 2,
          h: 3.6,
          gap: 0.6,
        },
      ]),
    ],
  }),

  matchDay: (k) => ({
    chip: "GAME DAY",
    depth: "list",
    plain: true,
    blocks: [
      k.eyebrow("eyebrow", "{{date}} · {{roundLabel}}"),
      k.displayLine(
        "grade",
        "Grade",
        "{{grade}}",
        (s) => (s === "portrait" ? 12 : 14),
        (s) => (s === "square" ? 2 : 1),
        1,
      ),
      k.panel("fixture", "Fixture", [
        {
          key: "home-away",
          name: "Home or away",
          content: "{{homeAway}}",
          font: "mono",
          size: 1.6,
          h: 3.4,
        },
        {
          key: "start",
          name: "Start time",
          content: "{{startTime}}",
          font: "cond",
          size: 3.2,
          h: 3.4,
          color: k.C.accent,
          right: true,
        },
        {
          key: "opposition",
          name: "Opposition",
          content: "v {{opposition.name}}",
          font: "cond",
          size: 3.8,
          h: 5,
          gap: 0.8,
          weight: 800,
        },
        {
          key: "venue",
          name: "Ground",
          content: "{{venue}}",
          font: "sans",
          size: 2,
          h: 3.4,
          gap: 0.6,
        },
      ]),
      k.metaLine("note", "{{note.title}} {{note.body}}", 1.6, "Note"),
    ],
  }),

  teamList: (k) => ({
    chip: "TEAM LIST",
    depth: "list",
    plain: true,
    blocks: [
      k.eyebrow("eyebrow", "{{gradeRound}} · {{competitionLine}}"),
      k.hero("grade", "Team grade", "{{gradeHeading}}", heroSize(10, 12), 1),
      k.metaLine("when", "{{venueDateTime}}", 0.8, "Venue, date and time"),
      k.list(
        "players",
        "Players",
        "players",
        () => 12,
        2.9,
        0.3,
        [
          {
            field: "number",
            x: 0,
            w: 8,
            style: { fontSize: 2.4, fontWeight: 900, color: k.C.accent, align: "center" },
          },
          {
            field: "surname",
            x: 10,
            w: 60,
            style: { fontSize: 2.6, fontWeight: 800, uppercase: true },
          },
          {
            field: "role",
            x: 71,
            w: 12,
            style: { fontSize: 2.2, fontWeight: 800, color: k.C.accent },
          },
          {
            field: "debut",
            x: 83,
            w: 17,
            style: {
              fontFamily: k.F.mono,
              fontSize: 1.3,
              fontWeight: 600,
              uppercase: true,
              color: k.C.muted,
              align: "right",
            },
          },
        ],
        {
          gap: 1.6,
          // Kept narrow so the role and debut tags sit near the name.
          maxW: 64,
          scale: (s) => (s === "portrait" ? 1.2 : s === "story" ? 1.28 : 1),
        },
      ),
    ],
  }),

  weekendWrap: (k) => ({
    chip: "ROUND WRAP",
    depth: "list",
    plain: true,
    blocks: [
      k.eyebrow("eyebrow", "{{roundLabel}} · {{dateRange}}"),
      ...k.twoLine("title", "WEEKEND", "WRAP", (s) =>
        s === "square" ? 9 : s === "portrait" ? 10 : 12,
      ),
      k.list(
        "matches",
        "Results",
        "matches",
        (s) => (s === "square" || s === "landscape" ? 4 : 5),
        7.4,
        0.8,
        [
          {
            field: "gradeLabel",
            x: 0,
            w: 13,
            style: {
              fontSize: 3,
              fontWeight: 900,
              color: k.C.onFill,
              background: k.C.fill,
              align: "center",
            },
          },
          {
            field: "outcome",
            x: 15,
            w: 85,
            style: {
              fontSize: 3,
              fontWeight: 900,
              color: k.C.accent,
              background: k.C.panel,
              align: "right",
              uppercase: true,
            },
          },
          {
            field: "resultLine",
            x: 17,
            w: 66,
            line: 1,
            style: { fontSize: 2.6, fontWeight: 800, uppercase: true },
          },
          {
            field: "performers",
            x: 17,
            w: 66,
            line: 2,
            style: { fontFamily: k.F.sans, fontSize: 1.6, fontWeight: 500, color: k.C.muted },
          },
        ],
        {
          variants: {
            lost: {
              gradeLabel: { background: k.C.panel, color: k.C.ink },
              outcome: { color: k.C.muted },
            },
          },
        },
      ),
    ],
  }),

  bigMoment: (k) => ({
    chip: "LIVE",
    plain: true,
    blocks: [
      k.eyebrow("eyebrow", "{{inningsLabel}} · vs {{oppositionName}}"),
      k.displayLine(
        "moment",
        "Moment",
        "{{momentLabel}}",
        (s) => (s === "square" ? 9 : s === "landscape" ? 10 : 14),
        2,
        1,
        k.C.accent,
      ),
      k.displayLine("player", "Player name", "{{playerName}}", 5.6, 2, 1.4),
      k.metaLine("innings", "{{runs}} ({{balls}}) · {{boundaryDetail}}", 0.6, "Innings"),
      k.panel(
        "live",
        "Live score",
        [
          {
            key: "score",
            name: "Live score",
            content: "{{liveScore}}",
            font: "display",
            size: 5,
            h: 5.6,
          },
          {
            key: "chase",
            name: "Overs and chase",
            content: "{{oversChaseLine}}",
            font: "sans",
            size: 2,
            h: 3.6,
            gap: 0.6,
          },
        ],
        2,
      ),
      k.pill("equation", "Equation", "{{equation}}", 1.2, 0.8),
    ],
  }),

  newSigning: (k) => ({
    chip: "NEW SIGNING",
    blocks: [
      k.eyebrow("eyebrow", "WELCOME TO THE CLUB · {{season}}"),
      k.displayLine(
        "name",
        "Player name",
        "{{playerFirstName}} {{playerLastName}}",
        (s) => (s === "square" ? 8 : 10),
        2,
        1,
      ),
      k.dashLabel("role", "{{role}}", 1.8, 4.4),
      k.metaLine("from", "From {{formerClub}}", 1.2, "Former club"),
      k.metaLine("headline", "{{headline}}", 0.4, "Headline"),
    ],
  }),

  countdown: (k) => ({
    chip: "COUNTDOWN",
    plain: true,
    blocks: [
      k.eyebrow("event", "{{eventLabel}}"),
      ...k.twoLine("hype", "{{hypeLine1}}", "{{hypeLine2}}", (s) => (s === "square" ? 5.6 : 8)),
      k.heroWithAside("days", "Days to go", "{{daysToGo}}", "DAYS TO GO", heroSize(20, 26), 2, 1.6),
      k.displayLine("when", "Date and venue", "{{dateVenue}}", 4.2, 1, 1.6),
      k.metaLine("fixture", "{{fixtureLine}}", 0.6, "Fixture"),
    ],
  }),

  clubLeaderboard: (k) => ({
    chip: "LEADERS",
    depth: "list",
    plain: true,
    blocks: [
      k.eyebrow("eyebrow", "{{subtitle}} · {{season}}", k.C.muted),
      k.displayLine("title", "Title", "{{title}}", 10, (s) => (s === "square" ? 2 : 1), 1),
      k.dashLabel("category", "{{category}}", 1.2, 4.4),
      k.list(
        "leaders",
        "Leaders",
        "leaders",
        (s) => (s === "story" ? 8 : s === "portrait" ? 6 : 5),
        5,
        0.6,
        [
          {
            field: "gradeLabel",
            x: 0,
            w: 14,
            style: {
              fontSize: 2.2,
              fontWeight: 900,
              color: k.C.onFill,
              background: k.C.fill,
              align: "center",
              uppercase: true,
            },
          },
          {
            field: "value",
            x: 16,
            w: 84,
            style: {
              fontFamily: k.F.display,
              fontWeight: k.F.displayWeight,
              fontSize: 3.4,
              color: k.C.accent,
              background: k.C.panel,
              align: "right",
            },
          },
          {
            field: "playerName",
            x: 18,
            w: 62,
            style: { fontSize: 2.8, fontWeight: 800, uppercase: true },
          },
        ],
      ),
    ],
  }),

  roundFixtures: (k) => ({
    chip: "GAME DAY",
    depth: "list",
    plain: true,
    blocks: [
      k.eyebrow("eyebrow", "{{date}} · {{roundLabel}}"),
      ...k.twoLine("title", "GAME", "DAY", (s) =>
        s === "portrait" ? 11 : s === "story" ? 14 : 12,
      ),
      k.list(
        "fixtures",
        "Grades playing",
        "fixtures",
        (s) => (s === "square" || s === "landscape" ? 4 : 5),
        7.4,
        0.8,
        [
          {
            field: "grade",
            x: 0,
            w: 13,
            style: {
              fontSize: 3,
              fontWeight: 900,
              color: k.C.onFill,
              background: k.C.fill,
              align: "center",
              uppercase: true,
            },
          },
          {
            field: "startTime",
            x: 15,
            w: 85,
            style: {
              fontSize: 3,
              fontWeight: 900,
              color: k.C.accent,
              background: k.C.panel,
              align: "right",
            },
          },
          {
            field: "opponent",
            x: 17,
            w: 64,
            line: 1,
            style: { fontSize: 2.6, fontWeight: 800, uppercase: true },
          },
          {
            field: "venue",
            x: 17,
            w: 64,
            line: 2,
            style: { fontFamily: k.F.sans, fontSize: 1.6, fontWeight: 500, color: k.C.muted },
          },
        ],
      ),
    ],
  }),

  tradingCard: (k) => ({
    chip: "COLLECTABLE",
    blocks: [
      k.eyebrow("cap", "CAP {{capNumber}}"),
      k.displayLine("player", "Player name", "{{playerName}}", 9, 2, 1.2),
      k.dashLabel("role", "{{role}}", 1.4, 4.4),
      k.statCells(
        "stats",
        [1, 2, 3, 4].map((n) => ({ value: `{{stat${n}Value}}`, label: `{{stat${n}Label}}` })),
        2.4,
        10,
      ),
    ],
  }),

  juniorHighlights: (k) => ({
    chip: "JUNIORS",
    depth: "list",
    plain: true,
    blocks: [
      k.eyebrow("eyebrow", "{{grade}} · {{roundLabel}}"),
      ...k.twoLine("title", "JUNIORS", "SHINE", (s) => (tall(s) ? 14 : 12)),
      k.list(
        "highlights",
        "Highlights",
        "highlights",
        () => 3,
        6,
        0.8,
        [
          {
            field: "figure",
            x: 0,
            w: 100,
            style: {
              fontFamily: k.F.display,
              fontWeight: k.F.displayWeight,
              fontSize: 3.6,
              color: k.C.accent,
              background: k.C.panel,
              align: "right",
            },
          },
          {
            field: "name",
            x: 3,
            w: 40,
            style: { fontSize: 3, fontWeight: 800, uppercase: true },
          },
          {
            field: "note",
            x: 44,
            w: 38,
            style: { fontFamily: k.F.sans, fontSize: 1.8, fontWeight: 500, color: k.C.muted },
          },
        ],
        { gap: 1.8 },
      ),
      k.metaLine(
        "privacy",
        "First names and initials only · photos with parent consent",
        1.4,
        "Privacy note",
      ),
    ],
  }),

  teamListRound: (k) => ({
    chip: "TEAM LISTS",
    blocks: [
      k.eyebrow("eyebrow", "{{coverDate}} · SWIPE FOR YOUR TEAM"),
      ...k.twoLine("title", "SELECTED", "SIDES", (s) =>
        s === "portrait" ? 12 : s === "story" ? 15 : 12,
      ),
      k.hero(
        "count",
        "Headline number",
        "{{coverCount}}",
        (s) => (s === "square" ? 16 : tall(s) ? 22 : 18),
        2.2,
      ),
      k.dashLabel("label", "{{coverLabel}}", 1, 4.6),
      k.metaLine("list", "{{coverList}}", 2, "Summary line"),
    ],
  }),
};
