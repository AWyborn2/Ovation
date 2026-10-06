/**
 * Caption rendering, shared by the web composer and the API's auto-drafts
 * (Social Studio KTD8), so a draft's stored caption is exactly what the
 * composer would have produced.
 *
 * Templates carry `{token}` placeholders. Card tokens come from the card
 * input; `{app.link}`, `{club.url}` and `{hashtag}` from the caption context.
 * The input is typed structurally (any object with a `kind`) because the
 * ShareCardInput union lives in the web app.
 */
export type Platform = "instagram" | "facebook" | "twitter";

export const PLATFORM_LIMITS: Record<Platform, number> = {
  instagram: 2200,
  facebook: 63206,
  twitter: 280,
};

export type CaptionContext = {
  clubUrl: string;
  hashtag: string;
  appLink: string;
};

export type CaptionCardInput = { kind: string };

type Fields = Record<string, unknown>;

const text = (v: unknown): string => (v == null ? "" : String(v));

const roundOf = (round: unknown): string =>
  round != null && round !== "" ? `Round ${String(round)}` : "";

const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

const listOf = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

// Every token a card can fill; a kind leaves the ones it has no value for "".
const EMPTY: Record<string, string> = {
  "player.name": "",
  "stat.value": "",
  "stat.label": "",
  "stat.tier": "",
  "stat.threshold": "",
  "grade.name": "",
  "opponent.name": "",
  "round.label": "",
  venue: "",
  date: "",
};

const tokensFor = (input: CaptionCardInput): Record<string, string> | null => {
  const f = input as Fields;
  switch (input.kind) {
    case "milestone":
      return {
        "player.name": text(f.playerName),
        "stat.value": String(f.currentValue),
        "stat.label": text(f.milestoneLabel),
        "stat.tier": text(f.tierLabel),
        "stat.threshold": f.threshold ? String(f.threshold) : "",
      };
    case "player": {
      const stats = listOf<{ label: string; value: unknown }>(f.stats);
      const games = stats.find((s) => /game/i.test(s.label))?.value ?? "";
      const runs = stats.find((s) => /run/i.test(s.label))?.value ?? "";
      return {
        "player.name": text(f.playerName),
        "stat.value": String(runs || games || ""),
        "stat.label": runs ? "runs" : "games",
        "grade.name": text(f.gradesPlayed),
      };
    }
    case "record":
      return {
        "player.name": text(f.playerName),
        "stat.value": String(f.value),
        "stat.label": text(f.title).toLowerCase(),
        "stat.tier": "Club Record",
        "grade.name": text(f.grade),
      };
    case "gradeLeader":
      return {
        "player.name": text(f.playerName),
        "stat.value": String(f.value),
        "stat.label": text(f.category).toLowerCase(),
        "stat.tier": "Grade Leader",
        "grade.name": text(f.grade),
      };
    case "premiership": {
      const year = Number(f.year);
      return {
        "player.name": text(f.mom),
        "stat.value": `${year}/${String((year + 1) % 100).padStart(2, "0")}`,
        "stat.label": "premiers",
        "stat.tier": "Premiers",
        "grade.name": text(f.grade),
      };
    }
    case "debut": {
      const cap = f.capNumber;
      return {
        "player.name": text(f.playerName),
        "stat.value": cap != null ? String(cap) : "",
        "stat.label": "debut",
        "stat.tier": cap != null ? `${text(f.grade)} Cap #${cap}` : `${text(f.grade)} Debut`,
        "stat.threshold": text(f.season),
        "grade.name": text(f.grade),
        "opponent.name": text(f.opponent),
        "round.label": roundOf(f.round),
      };
    }
    case "century":
      return {
        "player.name": text(f.playerName),
        "stat.value": `${text(f.runs)}${f.notOut ? "*" : ""}`,
        "stat.label": "runs",
        "stat.tier": "Century",
        "stat.threshold": "100",
        "grade.name": text(f.grade),
        "opponent.name": text(f.opponent),
        "round.label": roundOf(f.round),
      };
    case "fiveFor":
      return {
        "player.name": text(f.playerName),
        "stat.value": text(f.figures ?? String(f.wickets)),
        "stat.label": "wickets",
        "stat.tier": "Five-Wicket Haul",
        "stat.threshold": "5",
        "grade.name": text(f.grade),
        "opponent.name": text(f.opponent),
        "round.label": roundOf(f.round),
      };
    case "matchSummary":
      return {
        "stat.value": text(f.result),
        "stat.label": "result",
        "stat.tier": "Match Summary",
        "grade.name": text(f.matchTitle),
        "opponent.name": text((f.opposition as Fields | undefined)?.name),
        venue: text(f.venue),
        date: text(f.date),
      };
    case "matchDay":
      return {
        "stat.value": text(f.startTime),
        "stat.label": "start",
        "stat.tier": "Match Day",
        "opponent.name": text(f.oppositionName),
        "round.label": text(f.roundLabel),
        venue: text(f.venue),
        date: text(f.date),
      };
    case "roundFixtures": {
      const n = listOf<unknown>(f.fixtures).length;
      return {
        "stat.value": String(n),
        "stat.label": plural(n, "fixture", "fixtures"),
        "stat.tier": "Game Day",
        "round.label": text(f.roundLabel),
        date: text(f.date),
      };
    }
    case "teamList":
      return {
        "stat.value": String(listOf<unknown>(f.players).length),
        "stat.label": "players",
        "stat.tier": "Team List",
        "grade.name": text(f.gradeRound),
        // The card carries venue, date and time as one line.
        venue: text(f.venueDateTime),
      };
    case "teamListRound": {
      const n = listOf<unknown>(f.teams).length;
      return {
        "stat.value": String(n),
        "stat.label": plural(n, "team", "teams"),
        "stat.tier": "Team Lists",
        "round.label": text(f.roundLabel),
        date: text(f.date),
      };
    }
    case "weekendWrap": {
      const wins = listOf<{ outcome?: string }>(f.matches).filter(
        (m) => m.outcome === "won",
      ).length;
      return {
        "stat.value": String(wins),
        "stat.label": plural(wins, "win", "wins"),
        "stat.tier": "Weekend Wrap",
        "round.label": text(f.roundLabel),
        date: text(f.dateRange),
      };
    }
    case "ladder": {
      const club = listOf<{ pos: number; isClub?: boolean }>(f.rows).find((r) => r.isClub);
      return {
        "stat.value": club ? ordinal(Number(club.pos)) : "",
        "stat.label": club ? "on the ladder" : "",
        "stat.tier": "Ladder",
        "grade.name": text(f.gradeLabel),
        "round.label": text(f.asOfLabel),
      };
    }
    case "clubLeaderboard": {
      const top = listOf<{ playerName?: string; value?: string; gradeLabel?: string }>(
        f.leaders,
      )[0];
      return {
        "player.name": text(top?.playerName),
        "stat.value": text(top?.value),
        "stat.label": text(f.category).toLowerCase(),
        "stat.tier": text(f.title),
        "stat.threshold": text(f.season),
        "grade.name": text(top?.gradeLabel),
      };
    }
    case "bigMoment": {
      const runs =
        f.runs != null ? `${text(f.runs)}${f.balls != null ? ` (${text(f.balls)})` : ""}` : "";
      return {
        "player.name": text(f.playerName),
        "stat.value": runs,
        "stat.label": runs ? "runs" : "",
        "stat.tier": text(f.momentLabel),
        "opponent.name": text(f.oppositionName),
      };
    }
    case "newSigning":
      return {
        "player.name": [text(f.playerFirstName), text(f.playerLastName)].filter(Boolean).join(" "),
        "stat.label": text(f.role),
        "stat.tier": "New Signing",
        "stat.threshold": text(f.season),
      };
    case "countdown":
      return {
        "stat.value": text(f.daysToGo),
        "stat.label": "days to go",
        "stat.tier": text(f.eventLabel),
        // The card carries date and venue as one line.
        venue: text(f.dateVenue),
      };
    case "tradingCard": {
      const first = listOf<{ label: string; value: unknown }>(f.stats)[0];
      const cap = f.capNumber;
      return {
        "player.name": text(f.playerName),
        "stat.value": text(first?.value),
        "stat.label": text(first?.label).toLowerCase(),
        "stat.tier": cap != null && cap !== "" ? `Cap #${text(cap)}` : text(f.role),
        "stat.threshold": text(f.season),
      };
    }
    case "juniorHighlights": {
      const top = listOf<{ name?: string; note?: string; figure?: string }>(f.highlights)[0];
      return {
        "player.name": text(top?.name),
        "stat.value": text(top?.figure),
        "stat.label": text(top?.note).toLowerCase(),
        "stat.tier": "Junior Highlights",
        "grade.name": text(f.grade),
        "round.label": text(f.roundLabel),
      };
    }
    default:
      return null;
  }
};

const valueOf = (input: CaptionCardInput, key: string): string => {
  const tokens = tokensFor(input);
  if (!tokens) return "";
  return { ...EMPTY, ...tokens }[key] ?? "";
};

export const renderCaption = (
  template: string,
  input: CaptionCardInput,
  ctx: CaptionContext,
): string => {
  return template.replace(/\{([a-zA-Z][\w.]*)\}/g, (_, key: string) => {
    if (key === "app.link") return ctx.appLink;
    if (key === "club.url") return ctx.clubUrl;
    if (key === "hashtag") return ctx.hashtag;
    return valueOf(input, key);
  });
};

export const truncateForPlatform = (caption: string, platform: Platform): string => {
  const limit = PLATFORM_LIMITS[platform];
  if (caption.length <= limit) return caption;
  return caption.slice(0, limit - 1) + "…";
};

/**
 * The link a caption points at: the club site plus the card's app path, or a
 * tracked `/go/<slug>` link once one exists. Scheme and trailing slash are
 * dropped so the caption reads cleanly.
 */
export const captionAppLink = (
  clubUrl: string,
  appPath?: string | null,
  trackedSlug?: string | null,
): string => {
  const base = clubUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (trackedSlug) return `${base}/go/${trackedSlug}`;
  if (!appPath) return base;
  return `${base}${appPath}`;
};

export const KNOWN_TOKENS = [
  "{player.name}",
  "{stat.value}",
  "{stat.label}",
  "{stat.tier}",
  "{stat.threshold}",
  "{grade.name}",
  "{opponent.name}",
  "{round.label}",
  "{venue}",
  "{date}",
  "{app.link}",
  "{club.url}",
  "{hashtag}",
];
