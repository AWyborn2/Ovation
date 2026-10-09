/**
 * The live data fields each card kind offers (plan KTD4, U3): the text
 * fields a template's text boxes can insert as {{key}} tokens, the image
 * slots, and the repeat rows a rows layer can bind to.
 *
 * Static data so the API and set planner can read it. Derived from the
 * reference design pack (Broadcast Dark), and from Club Kit for the three
 * kinds Broadcast Dark has no design for; the web parity test
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
] as const;

export type TemplateCardKind = (typeof TEMPLATE_CARD_KINDS)[number];

/** Kinds with no Broadcast Dark design, whose fields come from Club Kit. */
export const CLUB_KIT_ONLY_KINDS: readonly TemplateCardKind[] = [
  "roundFixtures",
  "tradingCard",
  "juniorHighlights",
];

export const KIND_FIELDS: Record<TemplateCardKind, KindFieldCatalogue> = {
  milestone: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "tierLabel", label: "Tier label" },
      { key: "currentValue", label: "Milestone value" },
      { key: "milestoneLabel", label: "Milestone label" },
      { key: "playerName", label: "Player name" },
      { key: "shirtNumber", label: "Shirt number" },
      { key: "headline", label: "Tribute line" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "photo", label: "Player photo", type: "photo" },
    ],
    repeats: [],
  },
  player: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "season", label: "Season" },
      { key: "playerName", label: "Player name" },
      { key: "shirtNumber", label: "Shirt number" },
      { key: "stat1Value", label: "Stat 1 value" },
      { key: "stat1Label", label: "Stat 1 label" },
      { key: "stat2Value", label: "Stat 2 value" },
      { key: "stat2Label", label: "Stat 2 label" },
      { key: "stat3Value", label: "Stat 3 value" },
      { key: "stat3Label", label: "Stat 3 label" },
      { key: "headline", label: "Headline" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "photo", label: "Player photo", type: "photo" },
    ],
    repeats: [],
  },
  record: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "title", label: "Record title" },
      { key: "value", label: "Record value" },
      { key: "playerName", label: "Record holder" },
      { key: "grade", label: "Grade" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "hashtags", label: "Hashtag footer" },
      { key: "sponsorPresentedBy", label: "Records sponsor" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "photo", label: "Record holder photo", type: "photo" },
    ],
    repeats: [],
  },
  gradeLeader: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "grade", label: "Grade" },
      { key: "titleTop", label: "Heading line 1" },
      { key: "titleBottom", label: "Heading line 2" },
      { key: "category", label: "Category" },
      { key: "value", label: "Leading value" },
      { key: "playerName", label: "Leader" },
      { key: "season", label: "Season" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "hashtags", label: "Hashtag footer" },
      { key: "sponsorPresentedBy", label: "Stats source" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "photo", label: "Player photo", type: "photo" },
    ],
    repeats: [],
  },
  premiership: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "grade", label: "Grade" },
      { key: "season", label: "Season" },
      { key: "competition", label: "Competition" },
      { key: "result", label: "Result" },
      { key: "mom", label: "Player of the match" },
      { key: "hashtags", label: "Hashtag footer" },
      { key: "sponsorPresentedBy", label: "Season sponsor" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "teamPhoto", label: "Team photo", type: "photo" },
    ],
    repeats: [],
  },
  debut: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "grade", label: "Grade" },
      { key: "season", label: "Season" },
      { key: "playerName", label: "Player name" },
      { key: "round", label: "Round" },
      { key: "opponent", label: "Opponent" },
      { key: "tributeLine", label: "Tribute line" },
      { key: "capNumber", label: "Cap number" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "hashtags", label: "Hashtag footer" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "photo", label: "Debut photo", type: "photo" },
    ],
    repeats: [],
  },
  century: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "playerName", label: "Player name" },
      { key: "shirtNumber", label: "Shirt number" },
      { key: "grade", label: "Grade" },
      { key: "runs", label: "Runs" },
      { key: "balls", label: "Balls" },
      { key: "opponent", label: "Opponent" },
      { key: "round", label: "Round" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "hashtags", label: "Hashtag footer" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "photo", label: "Batter photo", type: "photo" },
    ],
    repeats: [],
  },
  fiveFor: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "playerName", label: "Player name" },
      { key: "shirtNumber", label: "Shirt number" },
      { key: "grade", label: "Grade" },
      { key: "wickets", label: "Wickets" },
      { key: "figures", label: "Figures" },
      { key: "overs", label: "Overs" },
      { key: "opponent", label: "Opponent" },
      { key: "round", label: "Round" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "hashtags", label: "Hashtag footer" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "photo", label: "Bowler photo", type: "photo" },
    ],
    repeats: [],
  },
  matchSummary: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "matchTitle", label: "Match title" },
      { key: "result", label: "Result banner" },
      { key: "resultVerb", label: "Result verb (divider)" },
      { key: "resultVerbShort", label: "Result verb (landscape, abbreviated)" },
      { key: "club.name", label: "Club side name" },
      { key: "club.score", label: "Club score" },
      { key: "club.oversLabel", label: "Club overs label" },
      { key: "club.performers", label: "Club top performers" },
      { key: "opposition.name", label: "Opposition name" },
      { key: "opposition.score", label: "Opposition score" },
      { key: "opposition.oversLabel", label: "Opposition overs label" },
      { key: "opposition.performers", label: "Opposition top performers" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
      { key: "hashtags", label: "Hashtag footer" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "club.logo", label: "Club side logo", type: "logo" },
      { key: "opposition.logo", label: "Opposition logo", type: "logo" },
      { key: "sponsor1", label: "Sponsor logo 1", type: "logo" },
      { key: "sponsor2", label: "Sponsor logo 2", type: "logo" },
      { key: "sponsor3", label: "Sponsor logo 3", type: "logo" },
      { key: "photo", label: "Team or action photo", type: "photo" },
    ],
    repeats: [],
  },
  matchDay: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "roundLabel", label: "Round label" },
      { key: "opposition.name", label: "Opposition name" },
      { key: "homeAway", label: "Club home/away label" },
      { key: "oppositionHomeAway", label: "Opposition home/away label" },
      { key: "venue", label: "Ground" },
      { key: "date", label: "Date" },
      { key: "startTime", label: "Start time" },
      { key: "note.title", label: "Note title" },
      { key: "note.body", label: "Note body" },
      { key: "hashtags", label: "Hashtag footer" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "opposition.logo", label: "Opposition logo", type: "logo" },
      { key: "sponsor1", label: "Sponsor logo 1", type: "logo" },
      { key: "sponsor2", label: "Sponsor logo 2", type: "logo" },
      { key: "sponsor3", label: "Sponsor logo 3", type: "logo" },
    ],
    repeats: [],
  },
  teamList: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "setMarker", label: 'Set page marker (e.g. " · 2/3")' },
      { key: "gradeRound", label: "Grade + round" },
      { key: "gradeHeading", label: "Team grade heading" },
      { key: "broadcastRoundLabel", label: "Round label (explicit round only)" },
      { key: "venueDateTime", label: "Venue / date / time" },
      { key: "hashtags", label: "Hashtag footer" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "squadPhoto", label: "Squad photo", type: "photo" },
      { key: "sponsor1", label: "Sponsor logo 1", type: "logo" },
      { key: "sponsor2", label: "Sponsor logo 2", type: "logo" },
      { key: "sponsor3", label: "Sponsor logo 3", type: "logo" },
    ],
    repeats: [
      {
        key: "players",
        label: "Player rows",
        variants: [],
        fields: [
          { key: "number", label: "Order" },
          { key: "broadcastName", label: "Initial + surname" },
          { key: "role", label: "Role (C/WK)" },
        ],
      },
    ],
  },
  weekendWrap: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "setMarker", label: 'Set page marker (e.g. " · 2/3")' },
      { key: "roundLabel", label: "Round label" },
      { key: "dateRange", label: "Date range" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "hashtags", label: "Hashtag footer" },
      { key: "hashtagsExtra", label: "Secondary hashtag" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
      { key: "coverDate", label: "Date" },
      { key: "coverCount", label: "Headline number" },
      { key: "coverLabel", label: "Headline label" },
      { key: "coverList", label: "Summary line" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "photo", label: "Cover photo", type: "photo" },
    ],
    repeats: [
      {
        key: "matches",
        label: "Per-grade result rows",
        variants: ["lost"],
        fields: [
          { key: "gradeLabel", label: "Grade" },
          { key: "gradeSub", label: "Grade sub-label" },
          { key: "resultLine", label: "Result line" },
          { key: "performers", label: "Top performers" },
          { key: "outcome", label: "Outcome" },
        ],
      },
    ],
  },
  ladder: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "competitionName", label: "Competition name" },
      { key: "gradeLabel", label: "Grade label" },
      { key: "asOfLabel", label: "As-of label" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "hashtags", label: "Hashtag footer" },
      { key: "hashtagsExtra", label: "Secondary hashtag" },
      { key: "sponsorPresentedBy", label: "Ladder source" },
    ],
    images: [{ key: "clubLogo", label: "Club logo", type: "logo" }],
    repeats: [
      {
        key: "rows",
        label: "Ladder rows",
        variants: ["club"],
        fields: [
          { key: "pos", label: "Position" },
          { key: "team", label: "Team" },
          { key: "played", label: "Played" },
          { key: "won", label: "Won" },
          { key: "lost", label: "Lost" },
          { key: "points", label: "Points" },
        ],
      },
    ],
  },
  bigMoment: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "oppositionName", label: "Opposition name" },
      { key: "momentLabel", label: "Moment label" },
      { key: "playerName", label: "Player name" },
      { key: "runs", label: "Runs" },
      { key: "balls", label: "Balls faced" },
      { key: "boundaryDetail", label: "Boundary detail" },
      { key: "inningsLabel", label: "Innings label" },
      { key: "liveScore", label: "Live score" },
      { key: "oversChaseLine", label: "Overs / chase line" },
      { key: "equation", label: "Equation" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "hashtags", label: "Hashtag footer" },
      { key: "hashtagsExtra", label: "Secondary footer tag" },
      { key: "sponsorPresentedBy", label: "Live scoring sponsor" },
    ],
    images: [{ key: "clubLogo", label: "Club logo", type: "logo" }],
    repeats: [],
  },
  newSigning: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "season", label: "Season" },
      { key: "playerFirstName", label: "Player first name" },
      { key: "playerLastName", label: "Player last name" },
      { key: "role", label: "Role" },
      { key: "formerClub", label: "Former club" },
      { key: "headline", label: "Headline" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "sponsorPresentedBy", label: "Recruitment sponsor" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "photo", label: "Player photo", type: "photo" },
    ],
    repeats: [],
  },
  countdown: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "eventLabel", label: "Event label" },
      { key: "daysToGo", label: "Days to go" },
      { key: "hypeLine1", label: "Hype line 1" },
      { key: "hypeLine2", label: "Hype line 2" },
      { key: "dateVenue", label: "Date / venue" },
      { key: "fixtureLine", label: "Fixture line" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "hashtags", label: "Hashtag footer" },
      { key: "hashtagsExtra", label: "Secondary hashtag" },
      { key: "sponsorPresentedBy", label: "Season launch sponsor" },
    ],
    images: [{ key: "clubLogo", label: "Club logo", type: "logo" }],
    repeats: [],
  },
  clubLeaderboard: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "category", label: "Category chip" },
      { key: "season", label: "Season" },
      { key: "subtitle", label: "Subtitle" },
      { key: "title", label: "Title" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "hashtags", label: "Hashtag footer" },
      { key: "hashtagsExtra", label: "Secondary hashtag" },
      { key: "sponsorPresentedBy", label: "Stats source" },
    ],
    images: [{ key: "clubLogo", label: "Club logo", type: "logo" }],
    repeats: [
      {
        key: "leaders",
        label: "Per-grade leader rows",
        variants: [],
        fields: [
          { key: "gradeLabel", label: "Grade" },
          { key: "gradeSub", label: "Grade sub-label" },
          { key: "playerName", label: "Leader" },
          { key: "value", label: "Value" },
        ],
      },
    ],
  },
  roundFixtures: {
    source: "club-kit-v1",
    fields: [
      { key: "date", label: "Date" },
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
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "photo", label: "Frame photo", type: "photo" },
    ],
    repeats: [
      {
        key: "fixtures",
        label: "Grades playing",
        variants: [],
        fields: [
          { key: "grade", label: "Grade" },
          { key: "opponent", label: "Opponent" },
          { key: "venue", label: "Venue" },
          { key: "startTime", label: "Start" },
        ],
      },
    ],
  },
  tradingCard: {
    source: "club-kit-v1",
    fields: [
      { key: "playerName", label: "Player name" },
      { key: "role", label: "Role" },
      { key: "capNumber", label: "Cap number" },
      { key: "shirtNumber", label: "Shirt number" },
      { key: "stat1Value", label: "Stat 1 value" },
      { key: "stat1Label", label: "Stat 1 label" },
      { key: "stat2Value", label: "Stat 2 value" },
      { key: "stat2Label", label: "Stat 2 label" },
      { key: "stat3Value", label: "Stat 3 value" },
      { key: "stat3Label", label: "Stat 3 label" },
      { key: "stat4Value", label: "Stat 4 value" },
      { key: "stat4Label", label: "Stat 4 label" },
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
      { key: "clubMonogram", label: "Club monogram (no crest)" },
    ],
    images: [
      { key: "cardPhoto", label: "Card photo", type: "photo" },
      { key: "photo", label: "Frame photo", type: "photo" },
      { key: "clubLogo", label: "Club logo", type: "logo" },
    ],
    repeats: [],
  },
  juniorHighlights: {
    source: "club-kit-v1",
    fields: [
      { key: "grade", label: "Grade" },
      { key: "roundLabel", label: "Round" },
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
      { key: "clubMonogram", label: "Club monogram (no crest)" },
    ],
    images: [
      { key: "photo", label: "Club photo (no identifiable child)", type: "photo" },
      { key: "clubLogo", label: "Club logo", type: "logo" },
    ],
    repeats: [
      {
        key: "highlights",
        label: "Highlights",
        variants: [],
        fields: [
          { key: "name", label: "Name" },
          { key: "note", label: "Note" },
          { key: "figure", label: "Figure" },
        ],
      },
    ],
  },
  teamListRound: {
    source: "broadcast-dark-v1",
    fields: [
      { key: "clubName", label: "Club name" },
      { key: "clubTagline", label: "Club tagline" },
      { key: "roundLabel", label: "Round" },
      { key: "coverDate", label: "Date" },
      { key: "coverCount", label: "Headline number" },
      { key: "coverLabel", label: "Headline label" },
      { key: "coverList", label: "Summary line" },
      { key: "clubHashtag", label: "Club hashtag" },
      { key: "sponsorPresentedBy", label: "Presented-by sponsor" },
    ],
    images: [
      { key: "clubLogo", label: "Club logo", type: "logo" },
      { key: "photo", label: "Cover photo", type: "photo" },
    ],
    repeats: [],
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
