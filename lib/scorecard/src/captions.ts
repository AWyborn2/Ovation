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

const valueOf = (input: CaptionCardInput, key: string): string => {
  const f = input as Fields;
  let map: Record<string, string>;
  switch (input.kind) {
    case "milestone":
      map = {
        "player.name": text(f.playerName),
        "stat.value": String(f.currentValue),
        "stat.label": text(f.milestoneLabel),
        "stat.tier": text(f.tierLabel),
        "stat.threshold": f.threshold ? String(f.threshold) : "",
        "grade.name": "",
      };
      break;
    case "player": {
      const stats = (f.stats as Array<{ label: string; value: unknown }> | undefined) ?? [];
      const games = stats.find((s) => /game/i.test(s.label))?.value ?? "";
      const runs = stats.find((s) => /run/i.test(s.label))?.value ?? "";
      map = {
        "player.name": text(f.playerName),
        "stat.value": String(runs || games || ""),
        "stat.label": runs ? "runs" : "games",
        "stat.tier": "",
        "stat.threshold": "",
        "grade.name": text(f.gradesPlayed),
      };
      break;
    }
    case "record":
      map = {
        "player.name": text(f.playerName),
        "stat.value": String(f.value),
        "stat.label": text(f.title).toLowerCase(),
        "stat.tier": "Club Record",
        "stat.threshold": "",
        "grade.name": text(f.grade),
      };
      break;
    case "gradeLeader":
      map = {
        "player.name": text(f.playerName),
        "stat.value": String(f.value),
        "stat.label": text(f.category).toLowerCase(),
        "stat.tier": "Grade Leader",
        "stat.threshold": "",
        "grade.name": text(f.grade),
      };
      break;
    case "premiership": {
      const year = Number(f.year);
      map = {
        "player.name": text(f.mom),
        "stat.value": `${year}/${String((year + 1) % 100).padStart(2, "0")}`,
        "stat.label": "premiers",
        "stat.tier": "Premiers",
        "stat.threshold": "",
        "grade.name": text(f.grade),
      };
      break;
    }
    case "debut": {
      const cap = f.capNumber;
      map = {
        "player.name": text(f.playerName),
        "stat.value": cap != null ? String(cap) : "",
        "stat.label": "debut",
        "stat.tier": cap != null ? `${text(f.grade)} Cap #${cap}` : `${text(f.grade)} Debut`,
        "stat.threshold": text(f.season),
        "grade.name": text(f.grade),
      };
      break;
    }
    case "century":
      map = {
        "player.name": text(f.playerName),
        "stat.value": `${text(f.runs)}${f.notOut ? "*" : ""}`,
        "stat.label": "runs",
        "stat.tier": "Century",
        "stat.threshold": "100",
        "grade.name": text(f.grade),
      };
      break;
    case "fiveFor":
      map = {
        "player.name": text(f.playerName),
        "stat.value": text(f.figures ?? String(f.wickets)),
        "stat.label": "wickets",
        "stat.tier": "Five-Wicket Haul",
        "stat.threshold": "5",
        "grade.name": text(f.grade),
      };
      break;
    case "matchSummary":
      map = {
        "player.name": "",
        "stat.value": text(f.result),
        "stat.label": "result",
        "stat.tier": "Match Summary",
        "stat.threshold": "",
        "grade.name": text(f.matchTitle),
      };
      break;
    // Other kinds have no caption tokens yet; every token degrades to "".
    default:
      return "";
  }
  return map[key] ?? "";
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
  "{app.link}",
  "{club.url}",
  "{hashtag}",
];
