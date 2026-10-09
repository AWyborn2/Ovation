import type { Fixture } from "@workspace/api-client-react";
import { CLUB_TIME_ZONE } from "./model";
import type { TeamSlide } from "./model";
import { CAROUSEL_LABELS, type CarouselSetType } from "@workspace/scorecard/queued-carousel";

export function matchDayCaption(fixtures: Fixture[], title: string, hashtag?: string | null) {
  const when = new Intl.DateTimeFormat("en-AU", {
    timeZone: CLUB_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return [
    title.trim().toLowerCase() === "match day"
      ? "MATCH DAY"
      : `MATCH DAY — ${title.trim() || "This weekend"}`,
    "Here’s where our teams are playing:",
    ...fixtures.map((f) =>
      [
        `${f.grade} ${f.isHome ? "v" : "at"} ${f.opponentName}`,
        when.format(new Date(f.startAt)),
        f.venue,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "Swipe through for the fixtures. Come along and support the club!",
    hashtag?.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function carouselCaption(
  type: CarouselSetType,
  teams: TeamSlide[],
  title: string,
  hashtag?: string | null,
) {
  if (type === "matchDay")
    return matchDayCaption(
      teams.map((t) => t.fixture),
      title,
      hashtag,
    );
  return [
    `${CAROUSEL_LABELS[type].toUpperCase()}${title && title !== CAROUSEL_LABELS[type] ? ` — ${title}` : ""}`,
    ...teams.map(({ fixture: f, input }) => {
      const heading = `${f.grade} v ${f.opponentName}`;
      if (input?.kind === "teamList")
        return [
          heading,
          input.venueDateTime,
          input.players.map((p) => `${p.surname}${p.role ? ` (${p.role})` : ""}`).join(", "),
        ].join("\n");
      if (input?.kind === "matchSummary")
        return [
          heading,
          input.result,
          ...input.innings.map((i) =>
            [
              `${i.teamKey === "club" ? input.club.name : input.opposition.name}: ${i.wickets}/${i.totalRuns}${i.declared ? "d" : ""}`,
              ...(type === "matchSummary"
                ? [
                    i.topBatters.map((b) => `${b.name} ${b.runs}${b.notOut ? "*" : ""}`).join(", "),
                    i.topBowlers.map((b) => `${b.name} ${b.wickets}/${b.runs}`).join(", "),
                  ]
                : []),
            ]
              .filter(Boolean)
              .join(" · "),
          ),
        ]
          .filter(Boolean)
          .join("\n");
      return heading;
    }),
    type === "teamList"
      ? "Swipe through for our teams. Come along and support the club!"
      : type === "results"
        ? "Swipe through for the results."
        : "Swipe through for innings scores and standout performances.",
    hashtag?.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}
