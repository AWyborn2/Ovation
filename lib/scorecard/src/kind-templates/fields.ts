/**
 * The live data fields each card kind offers (plan KTD4, U3): the text
 * fields a template's text boxes can insert as {{key}} tokens, the image
 * slots, and the repeat rows a rows layer can bind to.
 *
 * Static data so the API and set planner can read it. Derived from the
 * reference design pack (Broadcast Dark) plus any field only Club Kit shows,
 * and from Club Kit alone for the three kinds Broadcast Dark has no design for; the web parity test
 * (artifacts/cricket-club/src/lib/kind-templates/fields-parity.test.ts)
 * fails when the packs and this list drift apart.
 */

export type KindField = { key: string; label: string };
export type KindImage = { key: string; label: string; type: "photo" | "logo" };
export type KindRepeat = { key: string; label: string; variants: string[]; fields: KindField[] };
export type KindFieldCatalogue = {
  /** Which pack the fields were taken from. */
  source: "broadcast-dark-v1" | "club-kit-v1";
  fields: KindField[];
  images: KindImage[];
  repeats: KindRepeat[];
};

/** Every card kind, in the Studio's order. */
export const TEMPLATE_CARD_KINDS = [
  "milestone",
  "player",
  "record",
  "gradeLeader",
  "premiership",
  "debut",
  "century",
  "fiveFor",
  "matchSummary",
  "matchDay",
  "teamList",
  "weekendWrap",
  "ladder",
  "bigMoment",
  "newSigning",
  "countdown",
  "clubLeaderboard",
  "roundFixtures",
  "tradingCard",
  "juniorHighlights",
  "teamListRound",
  "announcement",
  "sponsor",
  "resultsSummary",
  "teamOfWeek",
] as const;

export type TemplateCardKind = (typeof TEMPLATE_CARD_KINDS)[number];

/** Kinds with no Broadcast Dark design, whose fields come from Club Kit. */
export const CLUB_KIT_ONLY_KINDS: readonly TemplateCardKind[] = [
  "roundFixtures",
  "tradingCard",
  "juniorHighlights",
  "announcement",
  "sponsor",
  "resultsSummary",
  "teamOfWeek",
];

export const KIND_FIELDS: Record<TemplateCardKind, KindFieldCatalogue> = {
  milestone: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "tierLabel",
        label: "Tier label",
      },
      {
        key: "currentValue",
        label: "Milestone value",
      },
      {
        key: "milestoneLabel",
        label: "Milestone label",
      },
      {
        key: "playerName",
        label: "Player name",
      },
      {
        key: "shirtNumber",
        label: "Shirt number",
      },
      {
        key: "headline",
        label: "Tribute line",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Player photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  player: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "season",
        label: "Season",
      },
      {
        key: "playerName",
        label: "Player name",
      },
      {
        key: "shirtNumber",
        label: "Shirt number",
      },
      {
        key: "stat1Value",
        label: "Stat 1 value",
      },
      {
        key: "stat1Label",
        label: "Stat 1 label",
      },
      {
        key: "stat2Value",
        label: "Stat 2 value",
      },
      {
        key: "stat2Label",
        label: "Stat 2 label",
      },
      {
        key: "stat3Value",
        label: "Stat 3 value",
      },
      {
        key: "stat3Label",
        label: "Stat 3 label",
      },
      {
        key: "headline",
        label: "Headline",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Player photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  record: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "title",
        label: "Record title",
      },
      {
        key: "value",
        label: "Record value",
      },
      {
        key: "playerName",
        label: "Record holder",
      },
      {
        key: "grade",
        label: "Grade",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "sponsorPresentedBy",
        label: "Records sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Record holder photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  gradeLeader: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "grade",
        label: "Grade",
      },
      {
        key: "titleTop",
        label: "Heading line 1",
      },
      {
        key: "titleBottom",
        label: "Heading line 2",
      },
      {
        key: "category",
        label: "Category",
      },
      {
        key: "value",
        label: "Leading value",
      },
      {
        key: "playerName",
        label: "Leader",
      },
      {
        key: "season",
        label: "Season",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "sponsorPresentedBy",
        label: "Stats source",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Player photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  premiership: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "grade",
        label: "Grade",
      },
      {
        key: "season",
        label: "Season",
      },
      {
        key: "competition",
        label: "Competition",
      },
      {
        key: "result",
        label: "Result",
      },
      {
        key: "mom",
        label: "Player of the match",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "sponsorPresentedBy",
        label: "Season sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "teamPhoto",
        label: "Team photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  debut: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "grade",
        label: "Grade",
      },
      {
        key: "season",
        label: "Season",
      },
      {
        key: "playerName",
        label: "Player name",
      },
      {
        key: "round",
        label: "Round",
      },
      {
        key: "opponent",
        label: "Opponent",
      },
      {
        key: "tributeLine",
        label: "Tribute line",
      },
      {
        key: "capNumber",
        label: "Cap number",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Debut photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  century: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "playerName",
        label: "Player name",
      },
      {
        key: "shirtNumber",
        label: "Shirt number",
      },
      {
        key: "grade",
        label: "Grade",
      },
      {
        key: "runs",
        label: "Runs",
      },
      {
        key: "balls",
        label: "Balls",
      },
      {
        key: "opponent",
        label: "Opponent",
      },
      {
        key: "round",
        label: "Round",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Batter photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  fiveFor: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "playerName",
        label: "Player name",
      },
      {
        key: "shirtNumber",
        label: "Shirt number",
      },
      {
        key: "grade",
        label: "Grade",
      },
      {
        key: "wickets",
        label: "Wickets",
      },
      {
        key: "figures",
        label: "Figures",
      },
      {
        key: "overs",
        label: "Overs",
      },
      {
        key: "opponent",
        label: "Opponent",
      },
      {
        key: "round",
        label: "Round",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Bowler photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  matchSummary: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "matchTitle",
        label: "Match title",
      },
      {
        key: "result",
        label: "Result banner",
      },
      {
        key: "resultVerb",
        label: "Result verb (divider)",
      },
      {
        key: "resultVerbShort",
        label: "Result verb (landscape, abbreviated)",
      },
      {
        key: "club.name",
        label: "Club side name",
      },
      {
        key: "club.score",
        label: "Club score",
      },
      {
        key: "club.oversLabel",
        label: "Club overs label",
      },
      {
        key: "club.performers",
        label: "Club top performers",
      },
      {
        key: "opposition.name",
        label: "Opposition name",
      },
      {
        key: "opposition.score",
        label: "Opposition score",
      },
      {
        key: "opposition.oversLabel",
        label: "Opposition overs label",
      },
      {
        key: "opposition.performers",
        label: "Opposition top performers",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "resultWord",
        label: "Result headline",
      },
      {
        key: "club.barName",
        label: "Club name on score bar",
      },
      {
        key: "opposition.barName",
        label: "Opposition name on score bar",
      },
      {
        key: "club.logoDisplay",
        label: "Club logo shown",
      },
      {
        key: "opposition.logoDisplay",
        label: "Opposition logo shown",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "club.logo",
        label: "Club side logo",
        type: "logo",
      },
      {
        key: "opposition.logo",
        label: "Opposition logo",
        type: "logo",
      },
      {
        key: "sponsor1",
        label: "Sponsor logo 1",
        type: "logo",
      },
      {
        key: "sponsor2",
        label: "Sponsor logo 2",
        type: "logo",
      },
      {
        key: "sponsor3",
        label: "Sponsor logo 3",
        type: "logo",
      },
      {
        key: "photo",
        label: "Team or action photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  matchDay: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "grade",
        label: "Grade / team",
      },
      {
        key: "roundLabel",
        label: "Round label",
      },
      {
        key: "opposition.name",
        label: "Opposition name",
      },
      {
        key: "homeAway",
        label: "Club home/away label",
      },
      {
        key: "oppositionHomeAway",
        label: "Opposition home/away label",
      },
      {
        key: "venue",
        label: "Ground",
      },
      {
        key: "date",
        label: "Date",
      },
      {
        key: "startTime",
        label: "Start time",
      },
      {
        key: "note.title",
        label: "Note title",
      },
      {
        key: "note.body",
        label: "Note body",
      },
      {
        key: "ladder.club",
        label: "Club ladder position",
      },
      {
        key: "ladder.opposition",
        label: "Opposition ladder position",
      },
      {
        key: "lastMeeting",
        label: "Last meeting",
      },
      {
        key: "milestoneWatch",
        label: "Milestone watch",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "opposition.logo",
        label: "Opposition logo",
        type: "logo",
      },
      {
        key: "sponsor1",
        label: "Sponsor logo 1",
        type: "logo",
      },
      {
        key: "sponsor2",
        label: "Sponsor logo 2",
        type: "logo",
      },
      {
        key: "sponsor3",
        label: "Sponsor logo 3",
        type: "logo",
      },
      {
        key: "photo",
        label: "Frame photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  teamList: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "setMarker",
        label: 'Set page marker (e.g. " · 2/3")',
      },
      {
        key: "gradeRound",
        label: "Grade + round",
      },
      {
        key: "gradeHeading",
        label: "Team grade heading",
      },
      {
        key: "broadcastRoundLabel",
        label: "Round label (explicit round only)",
      },
      {
        key: "venueDateTime",
        label: "Venue / date / time",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
      {
        key: "competitionLine",
        label: "Competition line",
      },
      {
        key: "roundLabel",
        label: "Round",
      },
      {
        key: "opponent",
        label: "Opponent",
      },
      {
        key: "venue",
        label: "Venue",
      },
      {
        key: "date",
        label: "Date",
      },
      {
        key: "startTime",
        label: "Start time",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "squadPhoto",
        label: "Squad photo",
        type: "photo",
      },
      {
        key: "sponsor1",
        label: "Sponsor logo 1",
        type: "logo",
      },
      {
        key: "sponsor2",
        label: "Sponsor logo 2",
        type: "logo",
      },
      {
        key: "sponsor3",
        label: "Sponsor logo 3",
        type: "logo",
      },
    ],
    repeats: [
      {
        key: "players",
        label: "Player rows",
        variants: [],
        fields: [
          {
            key: "number",
            label: "Order",
          },
          {
            key: "broadcastName",
            label: "Initial + surname",
          },
          {
            key: "role",
            label: "Role (C/WK)",
          },
          {
            key: "os",
            label: "Overseas (OS)",
          },
          {
            key: "surname",
            label: "Surname",
          },
          {
            key: "debut",
            label: "Debut badge",
          },
        ],
      },
    ],
  },
  weekendWrap: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "setMarker",
        label: 'Set page marker (e.g. " · 2/3")',
      },
      {
        key: "roundLabel",
        label: "Round label",
      },
      {
        key: "dateRange",
        label: "Date range",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "hashtagsExtra",
        label: "Secondary hashtag",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
      {
        key: "coverDate",
        label: "Date",
      },
      {
        key: "coverCount",
        label: "Headline number",
      },
      {
        key: "coverLabel",
        label: "Headline label",
      },
      {
        key: "coverList",
        label: "Summary line",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
      {
        key: "rowScale",
        label: "Set row size",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Cover photo",
        type: "photo",
      },
    ],
    repeats: [
      {
        key: "matches",
        label: "Per-grade result rows",
        variants: ["lost"],
        fields: [
          {
            key: "gradeLabel",
            label: "Grade",
          },
          {
            key: "gradeSub",
            label: "Grade sub-label",
          },
          {
            key: "resultLine",
            label: "Result line",
          },
          {
            key: "performers",
            label: "Top performers",
          },
          {
            key: "outcome",
            label: "Outcome",
          },
        ],
      },
    ],
  },
  ladder: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "competitionName",
        label: "Competition name",
      },
      {
        key: "gradeLabel",
        label: "Grade label",
      },
      {
        key: "asOfLabel",
        label: "As-of label",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "hashtagsExtra",
        label: "Secondary hashtag",
      },
      {
        key: "sponsorPresentedBy",
        label: "Ladder source",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Frame photo",
        type: "photo",
      },
    ],
    repeats: [
      {
        key: "rows",
        label: "Ladder rows",
        variants: ["club"],
        fields: [
          {
            key: "pos",
            label: "Position",
          },
          {
            key: "team",
            label: "Team",
          },
          {
            key: "played",
            label: "Played",
          },
          {
            key: "won",
            label: "Won",
          },
          {
            key: "lost",
            label: "Lost",
          },
          {
            key: "points",
            label: "Points",
          },
        ],
      },
    ],
  },
  bigMoment: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "oppositionName",
        label: "Opposition name",
      },
      {
        key: "momentLabel",
        label: "Moment label",
      },
      {
        key: "playerName",
        label: "Player name",
      },
      {
        key: "runs",
        label: "Runs",
      },
      {
        key: "balls",
        label: "Balls faced",
      },
      {
        key: "boundaryDetail",
        label: "Boundary detail",
      },
      {
        key: "inningsLabel",
        label: "Innings label",
      },
      {
        key: "liveScore",
        label: "Live score",
      },
      {
        key: "oversChaseLine",
        label: "Overs / chase line",
      },
      {
        key: "equation",
        label: "Equation",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "hashtagsExtra",
        label: "Secondary footer tag",
      },
      {
        key: "sponsorPresentedBy",
        label: "Live scoring sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Frame photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  newSigning: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "season",
        label: "Season",
      },
      {
        key: "playerFirstName",
        label: "Player first name",
      },
      {
        key: "playerLastName",
        label: "Player last name",
      },
      {
        key: "role",
        label: "Role",
      },
      {
        key: "formerClub",
        label: "Former club",
      },
      {
        key: "headline",
        label: "Headline",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "sponsorPresentedBy",
        label: "Recruitment sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Player photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  countdown: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "eventLabel",
        label: "Event label",
      },
      {
        key: "daysToGo",
        label: "Days to go",
      },
      {
        key: "hypeLine1",
        label: "Hype line 1",
      },
      {
        key: "hypeLine2",
        label: "Hype line 2",
      },
      {
        key: "dateVenue",
        label: "Date / venue",
      },
      {
        key: "fixtureLine",
        label: "Fixture line",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "hashtagsExtra",
        label: "Secondary hashtag",
      },
      {
        key: "sponsorPresentedBy",
        label: "Season launch sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Frame photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  clubLeaderboard: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "category",
        label: "Category chip",
      },
      {
        key: "season",
        label: "Season",
      },
      {
        key: "subtitle",
        label: "Subtitle",
      },
      {
        key: "title",
        label: "Title",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "hashtags",
        label: "Hashtag footer",
      },
      {
        key: "hashtagsExtra",
        label: "Secondary hashtag",
      },
      {
        key: "sponsorPresentedBy",
        label: "Stats source",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Frame photo",
        type: "photo",
      },
    ],
    repeats: [
      {
        key: "leaders",
        label: "Per-grade leader rows",
        variants: [],
        fields: [
          {
            key: "gradeLabel",
            label: "Grade",
          },
          {
            key: "gradeSub",
            label: "Grade sub-label",
          },
          {
            key: "playerName",
            label: "Leader",
          },
          {
            key: "value",
            label: "Value",
          },
          {
            key: "barPct",
            label: "Bar length (%)",
          },
        ],
      },
    ],
  },
  roundFixtures: {
    source: "club-kit-v1",
    fields: [
      {
        key: "date",
        label: "Date",
      },
      {
        key: "roundLabel",
        label: "Round",
      },
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
      {
        key: "setMarker",
        label: "Set page marker",
      },
      {
        key: "rowScale",
        label: "Set row size",
      },
      {
        key: "coverDate",
        label: "Date",
      },
      {
        key: "coverCount",
        label: "Headline number",
      },
      {
        key: "coverLabel",
        label: "Headline label",
      },
      {
        key: "coverList",
        label: "Summary line",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Frame photo",
        type: "photo",
      },
    ],
    repeats: [
      {
        key: "fixtures",
        label: "Grades playing",
        variants: [],
        fields: [
          {
            key: "grade",
            label: "Grade",
          },
          {
            key: "opponent",
            label: "Opponent",
          },
          {
            key: "venue",
            label: "Venue",
          },
          {
            key: "startTime",
            label: "Start",
          },
        ],
      },
    ],
  },
  tradingCard: {
    source: "club-kit-v1",
    fields: [
      {
        key: "playerName",
        label: "Player name",
      },
      {
        key: "role",
        label: "Role",
      },
      {
        key: "capNumber",
        label: "Cap number",
      },
      {
        key: "shirtNumber",
        label: "Shirt number",
      },
      {
        key: "stat1Value",
        label: "Stat 1 value",
      },
      {
        key: "stat1Label",
        label: "Stat 1 label",
      },
      {
        key: "stat2Value",
        label: "Stat 2 value",
      },
      {
        key: "stat2Label",
        label: "Stat 2 label",
      },
      {
        key: "stat3Value",
        label: "Stat 3 value",
      },
      {
        key: "stat3Label",
        label: "Stat 3 label",
      },
      {
        key: "stat4Value",
        label: "Stat 4 value",
      },
      {
        key: "stat4Label",
        label: "Stat 4 label",
      },
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "cardPhoto",
        label: "Card photo",
        type: "photo",
      },
      {
        key: "photo",
        label: "Frame photo",
        type: "photo",
      },
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
    ],
    repeats: [],
  },
  juniorHighlights: {
    source: "club-kit-v1",
    fields: [
      {
        key: "grade",
        label: "Grade",
      },
      {
        key: "roundLabel",
        label: "Round",
      },
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "photo",
        label: "Club photo (no identifiable child)",
        type: "photo",
      },
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
    ],
    repeats: [
      {
        key: "highlights",
        label: "Highlights",
        variants: [],
        fields: [
          {
            key: "name",
            label: "Name",
          },
          {
            key: "note",
            label: "Note",
          },
          {
            key: "figure",
            label: "Figure",
          },
        ],
      },
    ],
  },
  teamListRound: {
    source: "broadcast-dark-v1",
    fields: [
      {
        key: "clubName",
        label: "Club name",
      },
      {
        key: "clubTagline",
        label: "Club tagline",
      },
      {
        key: "roundLabel",
        label: "Round",
      },
      {
        key: "coverDate",
        label: "Date",
      },
      {
        key: "coverCount",
        label: "Headline number",
      },
      {
        key: "coverLabel",
        label: "Headline label",
      },
      {
        key: "coverList",
        label: "Summary line",
      },
      {
        key: "clubHashtag",
        label: "Club hashtag",
      },
      {
        key: "sponsorPresentedBy",
        label: "Presented-by sponsor",
      },
      {
        key: "clubMonogram",
        label: "Club monogram (no crest)",
      },
    ],
    images: [
      {
        key: "clubLogo",
        label: "Club logo",
        type: "logo",
      },
      {
        key: "photo",
        label: "Cover photo",
        type: "photo",
      },
    ],
    repeats: [],
  },
  announcement: {
    source: "club-kit-v1",
    fields: [
      { key: "eyebrow", label: "Small line above" },
      { key: "headline", label: "Headline" },
      { key: "subline", label: "Supporting line" },
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
      { key: "clubMonogram", label: "Club monogram (no crest)" },
    ],
    images: [
      { key: "photo", label: "Frame photo", type: "photo" },
      { key: "clubLogo", label: "Club logo", type: "logo" },
    ],
    repeats: [],
  },
  sponsor: {
    source: "club-kit-v1",
    fields: [
      { key: "seasonLabel", label: "Season" },
      { key: "sponsorName", label: "Sponsor name" },
      { key: "tagline", label: "About them" },
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
      { key: "clubMonogram", label: "Club monogram (no crest)" },
    ],
    images: [
      { key: "sponsorArt", label: "Sponsor artwork", type: "logo" },
      { key: "photo", label: "Frame photo", type: "photo" },
      { key: "clubLogo", label: "Club logo", type: "logo" },
    ],
    repeats: [],
  },
  resultsSummary: {
    source: "club-kit-v1",
    fields: [
      { key: "dateLabel", label: "Date" },
      { key: "roundLabel", label: "Round" },
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
      { key: "clubMonogram", label: "Club monogram (no crest)" },
      { key: "setMarker", label: "Set page marker" },
      { key: "rowScale", label: "Set row size" },
      { key: "coverDate", label: "Date" },
      { key: "coverCount", label: "Headline number" },
      { key: "coverLabel", label: "Headline label" },
      { key: "coverList", label: "Summary line" },
    ],
    images: [
      { key: "photo", label: "Frame photo", type: "photo" },
      { key: "clubLogo", label: "Club logo", type: "logo" },
    ],
    repeats: [
      {
        key: "results",
        label: "Grades",
        variants: ["lost", "noResult"],
        fields: [
          { key: "grade", label: "Grade" },
          { key: "clubName", label: "Club" },
          { key: "clubScore", label: "Club score" },
          { key: "verb", label: "Result word" },
          { key: "oppName", label: "Opposition" },
          { key: "oppScore", label: "Opposition score" },
          { key: "note", label: "No-result note" },
          { key: "batLabel", label: "Batters heading" },
          { key: "bat1", label: "Batter 1" },
          { key: "bat1Figure", label: "Batter 1 score" },
          { key: "bat2", label: "Batter 2" },
          { key: "bat2Figure", label: "Batter 2 score" },
          { key: "bowlLabel", label: "Bowlers heading" },
          { key: "bowl1", label: "Bowler 1" },
          { key: "bowl1Figure", label: "Bowler 1 figures" },
          { key: "bowl2", label: "Bowler 2" },
          { key: "bowl2Figure", label: "Bowler 2 figures" },
        ],
      },
    ],
  },
  teamOfWeek: {
    source: "club-kit-v1",
    fields: [
      { key: "title", label: "Title" },
      { key: "dateLabel", label: "Date" },
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
      { key: "clubMonogram", label: "Club monogram (no crest)" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "photo", label: "Frame photo", type: "photo" },
    ],
    repeats: [
      {
        key: "players",
        label: "Players",
        variants: [],
        fields: [
          { key: "photo", label: "Photo" },
          { key: "figure", label: "Figure" },
          { key: "name", label: "Name" },
          { key: "role", label: "Role" },
          { key: "grade", label: "Grade" },
        ],
      },
    ],
  },
};

/** A kind's catalogue, or null for an unknown kind. */
export function kindFields(kind: string): KindFieldCatalogue | null {
  return (KIND_FIELDS as Record<string, KindFieldCatalogue>)[kind] ?? null;
}

/** Every token key a text box may use for a kind (text fields only). */
export function kindTokenKeys(kind: string): Set<string> {
  return new Set((kindFields(kind)?.fields ?? []).map((f) => f.key));
}

/** Whether a kind offers a repeat with this key (for rows layers). */
export function kindHasRepeat(kind: string, repeat: string): boolean {
  return (kindFields(kind)?.repeats ?? []).some((r) => r.key === repeat);
}

// ── Card content fields (ADR-010) ───────────────────────────────────────────
//
// What a club can switch on and off on the cards the content pipeline builds.
// These are content fields, not template tokens: one content field can feed
// several tokens ("fixture.opposition" → `opposition.name`, its monogram).
// Core fields are always shown. Optional fields follow the club's preset, then
// its own per-field choices, then a single carousel's override.

/** How much a card shows: core fields only, today's cards, or everything. */
export const CONTENT_PRESETS = ["minimal", "standard", "full"] as const;
export type ContentPreset = (typeof CONTENT_PRESETS)[number];

export const CONTENT_PRESET_LABELS: Record<ContentPreset, string> = {
  minimal: "Minimal",
  standard: "Standard",
  full: "Full",
};

/**
 * The card kinds built from content (ADR-010): Match Day (P2), then results,
 * match summaries and team lists (P7). Each serves its carousel set and its
 * single card alike.
 */
export const CONTENT_KINDS = ["matchDay", "results", "matchSummary", "teamList"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** The slides a content kind is made of: each result or team list is one card. */
export type ContentSlide = "title" | "fixture" | "sponsors" | "result" | "team";

export type ContentFieldDef = {
  /** `<slide>.<field>`, stable: saved settings and carousels key on it. */
  key: string;
  label: string;
  slide: ContentSlide;
  /** Core fields are always shown; optional ones follow the preset and toggles. */
  tier: "core" | "optional";
  /** The presets an optional field is on in. Core fields list every preset. */
  presets: readonly ContentPreset[];
};

const ALL_PRESETS: readonly ContentPreset[] = CONTENT_PRESETS;
const STANDARD_UP: readonly ContentPreset[] = ["standard", "full"];
const FULL_ONLY: readonly ContentPreset[] = ["full"];

/**
 * A result card (P7): the results set and the match summary share these; a
 * match summary adds its top performers. Standard is every field, so the
 * cards are as they were.
 */
const RESULT_FIELDS: readonly ContentFieldDef[] = [
  { key: "result.grade", label: "Grade", slide: "result", tier: "core", presets: ALL_PRESETS },
  {
    key: "result.scores",
    label: "Teams and scores",
    slide: "result",
    tier: "core",
    presets: ALL_PRESETS,
  },
  { key: "result.result", label: "Result", slide: "result", tier: "core", presets: ALL_PRESETS },
  { key: "result.round", label: "Round", slide: "result", tier: "optional", presets: STANDARD_UP },
  {
    key: "result.oppositionCrest",
    label: "Opposition crest",
    slide: "result",
    tier: "optional",
    presets: STANDARD_UP,
  },
  { key: "result.photo", label: "Photo", slide: "result", tier: "optional", presets: STANDARD_UP },
  {
    key: "result.teamSponsor",
    label: "Team sponsor",
    slide: "result",
    tier: "optional",
    presets: STANDARD_UP,
  },
];

/**
 * Standard is the cards as they were before presets existed, so a club that
 * never opens the settings sees no change. Full adds the optional data fields
 * (P5): the livestream link on the title page, and ladder positions, the last
 * meeting and milestone watch on each fixture. Each data field is loaded only
 * when it is visible and hides itself when its data is missing.
 */
export const CONTENT_FIELDS: Record<ContentKind, readonly ContentFieldDef[]> = {
  matchDay: [
    { key: "title.heading", label: "Title", slide: "title", tier: "core", presets: ALL_PRESETS },
    { key: "title.dates", label: "Dates", slide: "title", tier: "core", presets: ALL_PRESETS },
    {
      key: "title.round",
      label: "Round",
      slide: "title",
      tier: "optional",
      presets: STANDARD_UP,
    },
    {
      key: "title.coverPhoto",
      label: "Cover photo",
      slide: "title",
      tier: "optional",
      presets: STANDARD_UP,
    },
    {
      key: "title.presentingSponsor",
      label: "Presenting sponsor",
      slide: "title",
      tier: "optional",
      presets: STANDARD_UP,
    },
    {
      key: "title.livestream",
      label: "Livestream link",
      slide: "title",
      tier: "optional",
      presets: FULL_ONLY,
    },
    { key: "fixture.grade", label: "Grade", slide: "fixture", tier: "core", presets: ALL_PRESETS },
    {
      key: "fixture.opposition",
      label: "Opposition",
      slide: "fixture",
      tier: "core",
      presets: ALL_PRESETS,
    },
    {
      key: "fixture.homeAway",
      label: "Home or away",
      slide: "fixture",
      tier: "core",
      presets: ALL_PRESETS,
    },
    { key: "fixture.date", label: "Date", slide: "fixture", tier: "core", presets: ALL_PRESETS },
    {
      key: "fixture.startTime",
      label: "Start time",
      slide: "fixture",
      tier: "core",
      presets: ALL_PRESETS,
    },
    { key: "fixture.venue", label: "Ground", slide: "fixture", tier: "core", presets: ALL_PRESETS },
    {
      key: "fixture.round",
      label: "Round",
      slide: "fixture",
      tier: "optional",
      presets: STANDARD_UP,
    },
    {
      key: "fixture.oppositionCrest",
      label: "Opposition crest",
      slide: "fixture",
      tier: "optional",
      presets: STANDARD_UP,
    },
    {
      key: "fixture.teamSponsor",
      label: "Team sponsor",
      slide: "fixture",
      tier: "optional",
      presets: STANDARD_UP,
    },
    {
      key: "fixture.photo",
      label: "Photo",
      slide: "fixture",
      tier: "optional",
      presets: STANDARD_UP,
    },
    {
      key: "fixture.ladder",
      label: "Ladder positions",
      slide: "fixture",
      tier: "optional",
      presets: FULL_ONLY,
    },
    {
      key: "fixture.lastMeeting",
      label: "Last meeting",
      slide: "fixture",
      tier: "optional",
      presets: FULL_ONLY,
    },
    {
      key: "fixture.milestoneWatch",
      label: "Milestone watch",
      slide: "fixture",
      tier: "optional",
      presets: FULL_ONLY,
    },
    {
      key: "sponsors.logos",
      label: "Sponsor logos",
      slide: "sponsors",
      tier: "core",
      presets: ALL_PRESETS,
    },
    // Sponsors page options (P6). Full only, so Standard stays the page as it was.
    {
      key: "sponsors.tiers",
      label: "Major sponsors larger",
      slide: "sponsors",
      tier: "optional",
      presets: FULL_ONLY,
    },
    {
      key: "sponsors.teamSponsors",
      label: "Team sponsors too",
      slide: "sponsors",
      tier: "optional",
      presets: FULL_ONLY,
    },
    {
      key: "sponsors.thankYou",
      label: "Thank-you line",
      slide: "sponsors",
      tier: "optional",
      presets: FULL_ONLY,
    },
    {
      key: "sponsors.nextHomeGame",
      label: "Next home game and socials",
      slide: "sponsors",
      tier: "optional",
      presets: FULL_ONLY,
    },
    {
      key: "sponsors.background",
      label: "Background photo",
      slide: "sponsors",
      tier: "optional",
      presets: FULL_ONLY,
    },
  ],
  results: RESULT_FIELDS,
  matchSummary: [
    ...RESULT_FIELDS.slice(0, 3),
    {
      key: "result.performers",
      label: "Top performers",
      slide: "result",
      tier: "core",
      presets: ALL_PRESETS,
    },
    ...RESULT_FIELDS.slice(3),
  ],
  // Team lists (P7). The side's size and overseas marks (ADR-009) always print.
  teamList: [
    { key: "team.grade", label: "Grade", slide: "team", tier: "core", presets: ALL_PRESETS },
    { key: "team.players", label: "Players", slide: "team", tier: "core", presets: ALL_PRESETS },
    {
      key: "team.match",
      label: "Opposition, date and ground",
      slide: "team",
      tier: "core",
      presets: ALL_PRESETS,
    },
    { key: "team.round", label: "Round", slide: "team", tier: "optional", presets: STANDARD_UP },
    {
      key: "team.oppositionCrest",
      label: "Opposition crest",
      slide: "team",
      tier: "optional",
      presets: STANDARD_UP,
    },
    {
      key: "team.shirtNumbers",
      label: "Shirt numbers",
      slide: "team",
      tier: "optional",
      presets: STANDARD_UP,
    },
    {
      key: "team.debuts",
      label: "Debut badges",
      slide: "team",
      tier: "optional",
      presets: STANDARD_UP,
    },
    { key: "team.photo", label: "Photo", slide: "team", tier: "optional", presets: STANDARD_UP },
    {
      key: "team.teamSponsor",
      label: "Team sponsor",
      slide: "team",
      tier: "optional",
      presets: STANDARD_UP,
    },
  ],
};

/**
 * The fixture fields whose data the server loads only when they are visible
 * (P5): the Weekend Carousel asks for the visible ones by key.
 */
export const MATCH_DAY_DATA_FIELDS = [
  "fixture.ladder",
  "fixture.lastMeeting",
  "fixture.milestoneWatch",
] as const;
export type MatchDayDataField = (typeof MATCH_DAY_DATA_FIELDS)[number];

export function isMatchDayDataField(key: unknown): key is MatchDayDataField {
  return typeof key === "string" && (MATCH_DAY_DATA_FIELDS as readonly string[]).includes(key);
}

export function isContentKind(kind: unknown): kind is ContentKind {
  return typeof kind === "string" && (CONTENT_KINDS as readonly string[]).includes(kind);
}

export function isContentPreset(preset: unknown): preset is ContentPreset {
  return typeof preset === "string" && (CONTENT_PRESETS as readonly string[]).includes(preset);
}

/** A content kind's field catalogue (empty for a kind not on the content pipeline yet). */
export function contentFields(kind: string): readonly ContentFieldDef[] {
  return isContentKind(kind) ? CONTENT_FIELDS[kind] : [];
}
