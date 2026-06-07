import type { ShareCardInput } from "./share-card";

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

const valueOf = (input: ShareCardInput, key: string): string => {
  switch (input.kind) {
    case "milestone": {
      const map: Record<string, string> = {
        "player.name": input.playerName,
        "stat.value": String(input.currentValue),
        "stat.label": input.milestoneLabel,
        "stat.tier": input.tierLabel,
        "stat.threshold": input.threshold ? String(input.threshold) : "",
        "grade.name": "",
      };
      return map[key] ?? "";
    }
    case "player": {
      const games = input.stats.find((s) => /game/i.test(s.label))?.value ?? "";
      const runs = input.stats.find((s) => /run/i.test(s.label))?.value ?? "";
      const map: Record<string, string> = {
        "player.name": input.playerName,
        "stat.value": String(runs || games || ""),
        "stat.label": runs ? "runs" : "games",
        "stat.tier": "",
        "stat.threshold": "",
        "grade.name": input.gradesPlayed ?? "",
      };
      return map[key] ?? "";
    }
    case "record": {
      const map: Record<string, string> = {
        "player.name": input.playerName,
        "stat.value": String(input.value),
        "stat.label": input.title.toLowerCase(),
        "stat.tier": "Club Record",
        "stat.threshold": "",
        "grade.name": input.grade ?? "",
      };
      return map[key] ?? "";
    }
    case "gradeLeader": {
      const map: Record<string, string> = {
        "player.name": input.playerName,
        "stat.value": String(input.value),
        "stat.label": input.category.toLowerCase(),
        "stat.tier": "Grade Leader",
        "stat.threshold": "",
        "grade.name": input.grade,
      };
      return map[key] ?? "";
    }
    case "premiership": {
      const map: Record<string, string> = {
        "player.name": input.mom ?? "",
        "stat.value": `${input.year}/${String((input.year + 1) % 100).padStart(2, "0")}`,
        "stat.label": "premiers",
        "stat.tier": "Premiers",
        "stat.threshold": "",
        "grade.name": input.grade,
      };
      return map[key] ?? "";
    }
    case "debut": {
      const map: Record<string, string> = {
        "player.name": input.playerName,
        "stat.value": input.capNumber != null ? String(input.capNumber) : "",
        "stat.label": "debut",
        "stat.tier":
          input.capNumber != null
            ? `${input.grade} Cap #${input.capNumber}`
            : `${input.grade} Debut`,
        "stat.threshold": input.season ?? "",
        "grade.name": input.grade,
      };
      return map[key] ?? "";
    }
    case "newCap": {
      const map: Record<string, string> = {
        "player.name": input.playerName,
        "stat.value": String(input.capNumber),
        "stat.label": "cap",
        "stat.tier": `${input.grade} Cap #${input.capNumber}`,
        "stat.threshold": "",
        "grade.name": input.grade,
      };
      return map[key] ?? "";
    }
    case "century": {
      const map: Record<string, string> = {
        "player.name": input.playerName,
        "stat.value": `${input.runs}${input.notOut ? "*" : ""}`,
        "stat.label": "runs",
        "stat.tier": "Century",
        "stat.threshold": "100",
        "grade.name": input.grade,
      };
      return map[key] ?? "";
    }
    case "fiveFor": {
      const map: Record<string, string> = {
        "player.name": input.playerName,
        "stat.value": input.figures ?? String(input.wickets),
        "stat.label": "wickets",
        "stat.tier": "Five-Wicket Haul",
        "stat.threshold": "5",
        "grade.name": input.grade,
      };
      return map[key] ?? "";
    }
    case "matchSummary": {
      const map: Record<string, string> = {
        "player.name": "",
        "stat.value": input.result,
        "stat.label": "result",
        "stat.tier": "Match Summary",
        "stat.threshold": "",
        "grade.name": input.matchTitle,
      };
      return map[key] ?? "";
    }
  }
};

export const renderCaption = (
  template: string,
  input: ShareCardInput,
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
