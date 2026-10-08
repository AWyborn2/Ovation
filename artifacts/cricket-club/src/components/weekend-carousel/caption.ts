import type { Fixture } from "@workspace/api-client-react";
import { CLUB_TIME_ZONE } from "./model";

export function matchDayCaption(fixtures: Fixture[], title: string, hashtag?: string | null) {
  const when = new Intl.DateTimeFormat("en-AU", {
    timeZone: CLUB_TIME_ZONE, weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
  return [
    title.trim().toLowerCase() === "match day" ? "MATCH DAY" : `MATCH DAY — ${title.trim() || "This weekend"}`,
    "Here’s where our teams are playing:",
    ...fixtures.map(f => [
      `${f.grade} ${f.isHome ? "v" : "at"} ${f.opponentName}`,
      when.format(new Date(f.startAt)),
      f.venue,
    ].filter(Boolean).join("\n")),
    "Swipe through for the fixtures. Come along and support the club!",
    hashtag?.trim(),
  ].filter(Boolean).join("\n\n");
}
