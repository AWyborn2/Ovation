/**
 * Pack renderer — input binding: `ShareCardInput` → template field values,
 * repeat rows and image urls, plus the tenant-data overlay (`applyPackData`).
 */

import { maxSponsorLogos } from "../share-card/sponsor-limit";
import type {
  ShareCardInput,
  MatchSummaryInnings,
  TeamListPlayer,
  WeekendWrapMatch,
  LadderRow,
  ClubLeaderboardLeader,
  GradeResult,
} from "../share-card";
import type { BoundInput, PackCardData, PackRow } from "./types";
import {
  cardTeamCrest,
  resolveCardCompetition,
  resolveCardTeamName,
  teamMonogram,
  type CardNames,
} from "@workspace/scorecard/card-names";
import { summaryResultWord } from "@workspace/scorecard/card-content";

export function set(
  target: Record<string, string>,
  key: string,
  value: string | number | null | undefined,
): void {
  if (value === null || value === undefined) return;
  target[key] = String(value);
}

export function seasonFromYear(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

export function inningsScore(i: MatchSummaryInnings): string {
  const suffix = i.declared ? "d" : "";
  return `${i.wickets}/${i.totalRuns}${suffix}`;
}

export function inningsPerformers(i: MatchSummaryInnings): string {
  const bats = i.topBatters
    .slice(0, 2)
    .map(
      (b) => `${b.name} ${b.runs}${b.notOut ? "*" : ""}${b.balls != null ? ` (${b.balls})` : ""}`,
    );
  const bowls = i.topBowlers
    .slice(0, 1)
    .map((b) => `${b.name} ${b.wickets}/${b.runs} (${b.overs})`);
  return [...bats, ...bowls].join(" · ");
}

export function bindInput(
  input: ShareCardInput,
  packId?: string | null,
  /** The club's short names and crests (ADR-010 P1); absent → automatic names. */
  names?: CardNames | null,
): BoundInput {
  const values: Record<string, string> = {};
  const images: Record<string, string> = {};
  const rows: Record<string, PackRow[]> = {};
  // Every team name and competition label on a card resolves the same way:
  // the club's own name, else the automatic short name, else the raw name.
  // Content-built inputs (ADR-010) arrive with their names final: bind them as they are.
  const resolved = (input as { namesResolved?: boolean }).namesResolved === true;
  const team = (name: string | null | undefined) =>
    resolved ? (name ?? "").trim() : resolveCardTeamName(names, name);
  const comp = (label: string | null | undefined) =>
    resolved ? (label ?? "").trim() : resolveCardCompetition(names, label);

  switch (input.kind) {
    case "matchSummary": {
      set(values, "matchTitle", input.matchTitle);
      set(values, "result", input.result);
      const clubName = team(input.club.name);
      const oppName = team(input.opposition.name);
      set(values, "club.name", clubName);
      set(values, "opposition.name", oppName);
      // A crest the input lacks comes from the club's names map (PlayHQ logos).
      const clubLogo = input.club.logoUrl || cardTeamCrest(names, input.club.name);
      const oppLogo = input.opposition.logoUrl || cardTeamCrest(names, input.opposition.name);
      if (clubLogo) images["club.logo"] = clubLogo;
      if (oppLogo) images["opposition.logo"] = oppLogo;
      set(values, "club.monogram", teamMonogram(clubName));
      set(values, "opposition.monogram", teamMonogram(oppName));
      // Score bars that lead with the club's logo (Club Kit) show the name only
      // when there's no logo to stand in for it.
      set(values, "club.barName", clubLogo ? "" : clubName);
      set(values, "opposition.barName", oppLogo ? "" : oppName);
      set(values, "club.logoDisplay", clubLogo ? "flex" : "none");
      set(values, "opposition.logoDisplay", oppLogo ? "flex" : "none");
      const clubInn = input.innings.find((i) => i.teamKey === "club");
      const oppInn = input.innings.find((i) => i.teamKey === "opposition");
      if (clubInn) {
        set(values, "club.score", inningsScore(clubInn));
        set(values, "club.oversLabel", `${clubInn.overs} OVERS`);
        set(values, "club.performers", inningsPerformers(clubInn));
      }
      if (oppInn) {
        set(values, "opposition.score", inningsScore(oppInn));
        set(values, "opposition.oversLabel", `${oppInn.overs} OVERS`);
        set(values, "opposition.performers", inningsPerformers(oppInn));
      }
      if (typeof input.carouselDetail === "boolean") {
        // On-demand results include every innings score. Explicit blanks must
        // override template samples when a completed match has no score.
        for (const key of ["club", "opposition"] as const) {
          const innings = input.innings.filter((i) => i.teamKey === key);
          values[`${key}.score`] = innings.map(inningsScore).join(" & ") || "—";
          values[`${key}.oversLabel`] = innings
            .map((i) => (i.overs ? `${i.overs} OVERS` : ""))
            .filter(Boolean)
            .join(" / ");
          values[`${key}.performers`] = input.carouselDetail
            ? innings.map(inningsPerformers).filter(Boolean).join(" · ")
            : "";
        }
      }
      if (input.resultWinner === "draw") {
        // A washed-out game is no result, not a draw.
        const noResult = /abandon|no result/i.test(input.result ?? "");
        set(values, "resultVerb", noResult ? "NO RESULT" : "MATCH DRAWN");
        set(values, "resultVerbShort", noResult ? "N/R" : "DRAW");
      }
      // One-word headline (Club Kit): WIN / RESULT (a loss) / DRAW, or TIE / NO RESULT / ABANDONED
      // when the result line says so. The club always keeps the top bar.
      set(values, "resultWord", resultWord(input.resultWinner, input.result));
      // The concise Club Kit carousel leads with the grade, not the outcome.
      // Bind at render time so already-saved review sets get the same labels
      // in previews and exports without rebuilding their frozen composition.
      if (input.carouselDetail === false && (packId == null || packId === "club-kit-v1")) {
        const [grade, ...titleRound] = input.matchTitle.split(/\s+[•·]\s+/);
        const rawRound = (input.roundLabel ?? titleRound.join(" • ")).trim();
        const numericRound = rawRound.match(/^(?:(?:round|r)\s*\.?\s*)?(\d+)$/i);
        const round = numericRound ? `Round ${Number(numericRound[1])}` : rawRound;
        set(values, "resultWord", grade.trim());
        set(
          values,
          "matchTitle",
          [resultWord(input.resultWinner, input.result), round].filter(Boolean).join(" - "),
        );
      }
      if (input.carouselDetail === true) bindInningsDetail(input, values, team);
      if (input.carouselDay) {
        set(values, "dayHeading", input.carouselDay.heading);
        input.carouselDay.results.forEach((r, i) => {
          values[`day${i}.grade`] = comp(r.grade);
          values[`day${i}.opposition`] = team(r.opposition);
          values[`day${i}.result`] = r.result;
          values[`day${i}.word`] = r.resultWord;
          values[`day${i}.clubScore`] = r.clubScore;
          values[`day${i}.oppScore`] = r.oppositionScore;
          const crest = r.crestUrl || cardTeamCrest(names, r.opposition);
          if (crest) images[`day${i}.crest`] = crest;
        });
      }
      break;
    }
    case "player": {
      set(values, "playerName", input.playerName);
      set(values, "headline", input.headline);
      const stats = input.stats ?? [];
      stats.slice(0, 3).forEach((s, idx) => {
        set(values, `stat${idx + 1}Value`, s.value);
        set(values, `stat${idx + 1}Label`, s.label);
      });
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "record": {
      set(values, "title", input.title);
      set(values, "value", input.value);
      set(values, "playerName", input.playerName);
      set(values, "grade", input.grade);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "gradeLeader": {
      const [top, bottom] = leaderTitle(input.category);
      set(values, "titleTop", top);
      set(values, "titleBottom", bottom);
      set(values, "grade", input.grade);
      set(values, "category", input.category);
      set(values, "value", input.value);
      set(values, "playerName", input.playerName);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "premiership": {
      set(values, "grade", input.grade);
      set(values, "season", seasonFromYear(input.year));
      set(values, "competition", input.competition);
      set(values, "result", input.result);
      set(values, "mom", input.mom);
      if (input.teamPhotoUrl) images["teamPhoto"] = input.teamPhotoUrl;
      break;
    }
    case "debut": {
      set(values, "grade", input.grade);
      set(values, "season", input.season);
      set(values, "playerName", input.playerName);
      set(values, "round", input.round);
      set(values, "opponent", input.opponent && team(input.opponent));
      // Bound EXPLICITLY, empty string and all — never via set(), which returns
      // early on null and leaves the key absent. An absent key falls through to
      // the template's sample ("246" in every pack), so a debut card for a
      // player with no cap number rendered a FABRICATED one on a club honour
      // card. Matches card-template.ts, which already degrades to "".
      values["capNumber"] = input.capNumber != null ? String(input.capNumber) : "";
      set(values, "tributeLine", input.headline);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "century": {
      set(values, "playerName", input.playerName);
      set(values, "grade", input.grade);
      set(values, "runs", input.runs);
      set(values, "balls", input.balls);
      set(values, "opponent", input.opponent && team(input.opponent));
      set(values, "round", input.round);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "fiveFor": {
      set(values, "playerName", input.playerName);
      set(values, "grade", input.grade);
      set(values, "wickets", input.wickets);
      set(values, "figures", input.figures);
      set(values, "overs", input.overs);
      set(values, "opponent", input.opponent && team(input.opponent));
      set(values, "round", input.round);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "milestone": {
      set(values, "tierLabel", input.tierLabel);
      set(values, "currentValue", input.currentValue);
      set(values, "milestoneLabel", input.milestoneLabel);
      set(values, "playerName", input.playerName);
      set(values, "headline", input.headline);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "matchDay": {
      set(values, "grade", comp(input.grade) || "GAME DAY");
      if (input.carouselPage) {
        set(values, "weekendTitle", input.carouselPage.title);
        set(values, "fixtureCount", input.carouselPage.fixtureCount);
        input.carouselPage.sponsors.forEach((s, i) => {
          set(values, `weekendSponsorName${i}`, s.name);
          if (s.logoUrl) images[`weekendSponsor${i}`] = s.logoUrl;
        });
        // The sponsors page's optional blocks (P6); always bound, so an absent
        // one is empty and its box drops (never a template sample).
        const page = input.carouselPage;
        values["sponsorThanks"] = page.thankYou ?? "";
        values["sponsorCta"] = page.cta ?? "";
        values["nextHomeMatch"] = page.nextHome?.match ?? "";
        values["nextHomeWhen"] = page.nextHome?.when ?? "";
        values["sponsorSocials"] = page.socials ?? "";
      }
      // Optional data (ADR-010 P5): bound as given or empty, so a box with
      // nothing to say drops out and a sample never prints.
      values["livestream"] = input.carouselPage?.livestream ?? "";
      values["ladder.club"] = input.ladderClub ?? "";
      values["ladder.opposition"] = input.ladderClub ? (input.ladderOpposition ?? "") : "";
      values["lastMeeting"] = input.lastMeeting ?? "";
      values["milestoneWatch"] = input.milestoneWatch ?? "";
      if (input.carouselDay) {
        // A junior day slide (ADR-010 P3): content-built, so names are final.
        set(values, "dayHeading", input.carouselDay.heading);
        input.carouselDay.fixtures.forEach((r, i) => {
          values[`day${i}.grade`] = r.grade;
          values[`day${i}.opposition`] = r.opposition;
          values[`day${i}.time`] = r.startTime;
          values[`day${i}.meta`] = [r.venue, r.homeAway, r.roundLabel].filter(Boolean).join(" · ");
          if (r.crestUrl) images[`day${i}.crest`] = r.crestUrl;
        });
      }
      // Explicitly clear absent labels on historical frozen covers rather than
      // allowing sample data to supply a made-up round.
      values["roundLabel"] = input.roundLabel ?? "";
      const opposition = team(input.oppositionName);
      set(values, "opposition.name", opposition);
      set(values, "opposition.monogram", teamMonogram(opposition));
      set(values, "homeAway", input.homeAway);
      set(values, "oppositionHomeAway", input.homeAway === "HOME" ? "AWAY" : "HOME");
      set(values, "venue", input.venue);
      set(values, "date", input.date);
      set(values, "startTime", input.startTime);
      set(values, "note.title", input.noteTitle);
      set(values, "note.body", input.noteBody);
      // A content-built slide already chose its crest (or hid it): no map fallback.
      const oppositionLogo =
        input.oppositionLogoUrl || (resolved ? null : cardTeamCrest(names, input.oppositionName));
      if (oppositionLogo) images["opposition.logo"] = oppositionLogo;
      break;
    }
    case "teamList": {
      values["gradeHeading"] = comp(input.grade).toUpperCase() || "TEAM LIST";
      set(values, "gradeRound", input.gradeRound);
      set(values, "competitionLine", input.competitionLine);
      set(values, "venueDateTime", input.venueDateTime);
      values["broadcastRoundLabel"] = fixtureRoundLabel(
        input.roundLabel,
        input.gradeRound,
        input.competitionLine,
      );
      // The match in parts, for designs that set it out separately (Starting XI).
      // Bound even when absent, so a list without them never shows samples.
      values["roundLabel"] = input.roundLabel ?? "";
      values["opponent"] = input.opponent ? team(input.opponent) : "";
      values["venue"] = input.venue ?? "";
      values["date"] = input.date ?? "";
      values["startTime"] = input.startTime ?? "";
      if (input.squadPhotoUrl) images["squadPhoto"] = input.squadPhotoUrl;
      // Rows stay in batting order either way. With season shirt numbers on
      // (numbering "shirt") the number slot is the shirt number, bound
      // EXPLICITLY — empty when unnumbered, never the batting order.
      // Every player is bound, up to a side of 14 (ADR-009): the designs
      // compress their rows above 12 rather than drop anyone.
      const shirt = input.numbering === "shirt";
      rows["players"] = (input.players ?? []).map((p: TeamListPlayer) => ({
        values: {
          number: shirt ? shirtText(p.shirtNumber) : String(p.order),
          surname: p.surname,
          broadcastName: broadcastPlayerName(p.firstInitial, p.surname),
          role: p.role ?? "",
          debut: p.debut ? "DEBUT" : "",
          // The snapshot's overseas mark: a neutral "OS", never a country.
          os: p.overseas ? "OS" : "",
        },
      }));
      break;
    }
    case "weekendWrap": {
      set(values, "roundLabel", input.roundLabel);
      set(values, "dateRange", input.dateRange);
      rows["matches"] = (input.matches ?? []).map((mt: WeekendWrapMatch) => {
        // The input carries one grade string ("A GRADE", "U15s") but the
        // templates render a stacked block: a large {{row.gradeLabel}} letter
        // over a small {{row.gradeSub}}. Binding the whole string into the
        // large slot made "A GRADE" wrap/clip at display size while the sub
        // fell back to its sample — every row read "A GRADE / GRADE". Split:
        // first token → the big letter, remainder → the sub (empty when the
        // grade is a single token like "U15s", which renders alone).
        const [gradeHead, ...gradeRest] = (mt.gradeLabel ?? "").trim().split(/\s+/);
        return {
          variant: mt.outcome === "lost" ? "lost" : undefined,
          values: {
            gradeLabel: gradeHead ?? "",
            gradeSub: gradeRest.join(" "),
            resultLine: mt.resultLine,
            performers: mt.performers,
            outcome: mt.outcome.toUpperCase(),
          },
        };
      });
      break;
    }
    case "ladder": {
      set(values, "competitionName", input.competitionName && comp(input.competitionName));
      set(values, "gradeLabel", input.gradeLabel && comp(input.gradeLabel));
      set(values, "asOfLabel", input.asOfLabel);
      rows["rows"] = (input.rows ?? []).map((r: LadderRow) => ({
        variant: r.isClub ? "club" : undefined,
        values: {
          pos: String(r.pos),
          team: team(r.team),
          played: String(r.played),
          won: String(r.won),
          lost: String(r.lost),
          points: String(r.points),
        },
      }));
      break;
    }
    case "bigMoment": {
      set(values, "oppositionName", team(input.oppositionName));
      set(values, "momentLabel", input.momentLabel);
      set(values, "playerName", input.playerName);
      set(values, "runs", input.runs);
      set(values, "balls", input.balls);
      set(values, "boundaryDetail", input.boundaryDetail);
      set(values, "inningsLabel", input.inningsLabel);
      set(values, "liveScore", input.liveScore);
      set(values, "oversChaseLine", input.oversChaseLine);
      set(values, "equation", input.equation);
      // NOTE (A6): big-moment.ts has no `data-slot="photo"`, so binding
      // images["photo"] here was dead. Dropped — the card renders without a
      // photo by design.
      break;
    }
    case "newSigning": {
      set(values, "season", input.season);
      set(values, "playerFirstName", input.playerFirstName);
      set(values, "playerLastName", input.playerLastName);
      set(values, "role", input.role);
      set(values, "formerClub", input.formerClub);
      set(values, "headline", input.headline);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "countdown": {
      set(values, "eventLabel", input.eventLabel);
      set(values, "daysToGo", input.daysToGo);
      set(values, "hypeLine1", input.hypeLine1);
      set(values, "hypeLine2", input.hypeLine2);
      set(values, "dateVenue", input.dateVenue);
      set(values, "fixtureLine", input.fixtureLine);
      break;
    }
    case "clubLeaderboard": {
      set(values, "category", `TOP ${input.category.toUpperCase()}`);
      set(values, "title", input.title);
      set(values, "subtitle", input.subtitle);
      set(values, "season", input.season);
      // Value bars (Club Kit): each leader's share of the best value, and the
      // best row marked `top` for its full primary bar.
      const leaderValues = (input.leaders ?? []).map((l) => parseFloat(String(l.value)) || 0);
      const best = Math.max(0, ...leaderValues);
      const topIdx = best > 0 ? leaderValues.indexOf(best) : -1;
      rows["leaders"] = (input.leaders ?? []).map((l: ClubLeaderboardLeader, idx) => {
        // Same stacked grade block as Weekend Wrap: first token large, the
        // rest as the small sub-label. Binding the whole "A GRADE" into the
        // large slot left the sub on its "GRADE" sample ("A GRADE / GRADE"),
        // and a one-token grade like "U15" read "U15 / GRADE".
        const [gradeHead, ...gradeRest] = (l.gradeLabel ?? "").trim().split(/\s+/);
        return {
          variant: idx === topIdx ? "top" : undefined,
          values: {
            gradeLabel: gradeHead ?? "",
            gradeSub: gradeRest.join(" "),
            playerName: l.playerName,
            value: l.value,
            barPct: String(best > 0 ? Math.round((leaderValues[idx] / best) * 100) : 0),
          },
        };
      });
      break;
    }
    case "roundFixtures": {
      set(values, "roundLabel", input.roundLabel);
      set(values, "date", input.date);
      rows["fixtures"] = (input.fixtures ?? []).map((f) => ({
        values: {
          grade: f.grade,
          opponent: team(f.opponent),
          venue: f.venue,
          startTime: f.startTime,
        },
      }));
      break;
    }
    case "tradingCard": {
      set(values, "playerName", input.playerName);
      set(values, "role", input.role);
      set(values, "season", input.season);
      // Bound explicitly (as on debut): an absent cap must never fall back to
      // the template's sample number.
      values["capNumber"] = input.capNumber != null ? String(input.capNumber) : "";
      (input.stats ?? []).slice(0, 4).forEach((st, idx) => {
        set(values, `stat${idx + 1}Value`, st.value);
        set(values, `stat${idx + 1}Label`, st.label);
      });
      if (input.photoUrl) images["cardPhoto"] = input.photoUrl;
      break;
    }
    case "teamListRound": {
      set(values, "roundLabel", input.roundLabel);
      break;
    }
    case "juniorHighlights": {
      set(values, "grade", input.grade);
      set(values, "roundLabel", input.roundLabel);
      // Juniors privacy: first name + surname initial only, whatever was typed.
      rows["highlights"] = (input.highlights ?? []).slice(0, 3).map((h) => ({
        values: { name: juniorDisplayName(h.name), note: h.note, figure: h.figure },
      }));
      break;
    }
    case "announcement": {
      set(values, "eyebrow", input.eyebrow);
      set(values, "headline", input.headline);
      set(values, "subline", input.subline);
      break;
    }
    case "sponsor": {
      set(values, "seasonLabel", input.seasonLabel);
      set(values, "sponsorName", input.sponsorName);
      set(values, "tagline", input.tagline);
      if (input.sponsorLogoUrl) images["sponsorArt"] = input.sponsorLogoUrl;
      break;
    }
    case "resultsSummary": {
      set(values, "dateLabel", input.dateLabel);
      set(values, "roundLabel", input.roundLabel);
      rows["results"] = (input.results ?? []).map((r) => resultRow(r, team, comp));
      break;
    }
    case "teamOfWeek": {
      set(values, "title", input.title);
      set(values, "dateLabel", input.dateLabel);
      rows["players"] = (input.players ?? []).slice(0, 12).map((p) => ({
        values: {
          name: p.name ?? "",
          figure: p.figure ?? "",
          grade: p.grade ?? "",
          role: p.role ?? "",
          photo: p.photoUrl ?? "",
        },
      }));
      break;
    }
  }

  bindShirtNumber(input, values);
  bindSetValues(input, values);
  return { values, images, rows };
}

const RESULT_VERB: Record<GradeResult["outcome"], string> = {
  won: "DEF",
  lost: "DEF BY",
  draw: "DREW",
  noResult: "",
};

/**
 * One grade on a results summary: both sides and scores, the verb between
 * them, and the best two batters and bowlers under labels that only show when
 * there are players to list. A grade with no result shows its note instead.
 */
function resultRow(
  r: GradeResult,
  team: (name: string) => string,
  comp: (label: string) => string,
): PackRow {
  const noResult = r.outcome === "noResult";
  const bat = !noResult && !!(r.bat1Name || r.bat2Name);
  const bowl = !noResult && !!(r.bowl1Name || r.bowl2Name);
  return {
    variant: noResult ? "noResult" : r.outcome === "lost" ? "lost" : undefined,
    values: {
      grade: comp(r.grade ?? ""),
      clubName: team(r.clubName ?? ""),
      clubScore: noResult ? "" : (r.clubScore ?? ""),
      verb: RESULT_VERB[r.outcome] ?? "",
      oppName: team(r.oppName ?? ""),
      oppScore: noResult ? "" : (r.oppScore ?? ""),
      note: noResult ? (r.note?.trim() || "NO RESULT").toUpperCase() : "",
      batLabel: bat ? "BEST BATTERS" : "",
      bowlLabel: bowl ? "BEST BOWLERS" : "",
      bat1: bat ? (r.bat1Name ?? "") : "",
      bat1Figure: bat ? (r.bat1Figure ?? "") : "",
      bat2: bat ? (r.bat2Name ?? "") : "",
      bat2Figure: bat ? (r.bat2Figure ?? "") : "",
      bowl1: bowl ? (r.bowl1Name ?? "") : "",
      bowl1Figure: bowl ? (r.bowl1Figure ?? "") : "",
      bowl2: bowl ? (r.bowl2Name ?? "") : "",
      bowl2Figure: bowl ? (r.bowl2Figure ?? "") : "",
    },
  };
}

/** Broadcast eyebrow: accept only an explicit fixture round; never infer one. */
export function fixtureRoundLabel(...sources: Array<string | null | undefined>): string {
  const [fixtureLabel, ...legacyLabels] = sources;
  const actual = fixtureLabel?.trim();
  if (actual) {
    const match = actual.match(/\b(?:round|rd\.?)\s*[-:#]?\s*(\d{1,2})\b/i);
    return match ? `ROUND ${match[1]}` : actual.toUpperCase();
  }
  for (const source of legacyLabels) {
    const text = source ?? "";
    const round = text.match(/\b(?:round|rd\.?)\s*[-:#]?\s*(\d{1,2})\b/i);
    if (round) return `ROUND ${round[1]}`;
    const stage = text.match(
      /\b(?:grand final|preliminary final|semi[- ]final|qualifying final|elimination final|finals)\b/i,
    );
    if (stage) return stage[0].toUpperCase();
  }
  return "";
}

/** Use only an approved one-letter initial; older/private rows stay surname-only. */
export function broadcastPlayerName(
  firstInitial: string | null | undefined,
  surname: string,
): string {
  const initial = firstInitial?.trim() ?? "";
  return /^\p{L}$/u.test(initial) ? `${initial}. ${surname}` : surname;
}

/**
 * The card inputs that show the player's season shirt number (U8, KTD11/KTD12).
 * Each member must declare `shirtNumber`: the binding below reads it without a
 * cast, so a kind added here without the field fails to compile.
 */
type ShirtNumberCardInput = Extract<
  ShareCardInput,
  { kind: "century" | "fiveFor" | "milestone" | "player" | "tradingCard" }
>;

const SHIRT_NUMBER_KINDS: ReadonlySet<string> = new Set<ShirtNumberCardInput["kind"]>([
  "century",
  "fiveFor",
  "milestone",
  "player",
  "tradingCard",
]);

const showsShirtNumber = (input: ShareCardInput): input is ShirtNumberCardInput =>
  SHIRT_NUMBER_KINDS.has(input.kind);

/**
 * Bind `shirtNumber` for the player-centric kinds — EXPLICITLY, empty string
 * and all, never via set(), for the same reason as `capNumber` on debut: an
 * absent key falls through to the template sample. An empty value makes the
 * renderer drop the badge. `debut` (the A Grade cap card) never gets one.
 */
function bindShirtNumber(input: ShareCardInput, values: Record<string, string>): void {
  if (!showsShirtNumber(input)) return;
  values["shirtNumber"] = shirtText(input.shirtNumber);
}

/** A shirt number as card text: trimmed, or empty when there is none. */
function shirtText(n: string | number | null | undefined): string {
  return n != null ? String(n).trim() : "";
}

/** Row-size multipliers for a set's density tiers (Club Kit rows read `--rs`). */
export const DENSITY_SCALE = { spotlight: 1.35, standard: 1, compact: 0.72 } as const;

/** "A · B · C" from a list of labels (empty entries dropped). */
const dotList = (items: Array<string | null | undefined>) =>
  items
    .map((i) => (i ?? "").trim())
    .filter(Boolean)
    .join(" · ");

/**
 * Balanced card set values (plan 2026-10-01-001): the page marker on a
 * detail slide, its row size, and the cover's headline number and summary.
 * A card outside a set binds `setMarker` to "" so its output is unchanged.
 */
function bindSetValues(input: ShareCardInput, values: Record<string, string>): void {
  const set = input as { setPage?: string | null; density?: keyof typeof DENSITY_SCALE };
  values["setMarker"] = set.setPage ? ` · ${set.setPage}` : "";
  values["rowScale"] = String(DENSITY_SCALE[set.density ?? "standard"] ?? 1);
  switch (input.kind) {
    case "roundFixtures": {
      const n = input.fixtures?.length ?? 0;
      values["coverDate"] = input.date ?? "";
      values["coverCount"] = String(n);
      values["coverLabel"] = n === 1 ? "TEAM IN ACTION" : "TEAMS IN ACTION";
      values["coverList"] = dotList((input.fixtures ?? []).map((f) => f.grade));
      break;
    }
    case "weekendWrap": {
      const ms = input.matches ?? [];
      const won = ms.filter((m) => m.outcome === "won");
      const lost = ms.filter((m) => m.outcome === "lost");
      const drawn = ms.filter((m) => m.outcome === "draw");
      const grade = (m: { gradeLabel: string }) => (m.gradeLabel ?? "").replace(/\s*grade\b/i, "");
      values["coverDate"] = input.dateRange ?? "";
      values["coverCount"] = [
        won.length,
        lost.length,
        ...(drawn.length ? [drawn.length] : []),
      ].join("–");
      values["coverLabel"] = drawn.length ? "WON–LOST–DRAWN" : "WON–LOST";
      values["coverList"] = [
        won.length ? `Wins: ${dotList(won.map(grade))}` : "",
        lost.length ? `Losses: ${dotList(lost.map(grade))}` : "",
        drawn.length ? `Draws: ${dotList(drawn.map(grade))}` : "",
      ]
        .filter(Boolean)
        .join("  |  ");
      break;
    }
    case "teamListRound": {
      const n = input.teams?.length ?? 0;
      values["coverDate"] = input.date ?? "";
      values["coverCount"] = String(n);
      const named = n === 1 ? "TEAM NAMED" : "TEAMS NAMED";
      values["coverLabel"] = input.audience ? `${input.audience} ${named}` : named;
      values["coverList"] = dotList((input.teams ?? []).map((t) => t.grade));
      break;
    }
    case "resultsSummary": {
      const rs = input.results ?? [];
      const won = rs.filter((r) => r.outcome === "won").length;
      values["coverDate"] = input.dateLabel ?? "";
      values["coverCount"] = String(rs.length);
      values["coverLabel"] = rs.length === 1 ? "GRADE PLAYED" : "GRADES PLAYED";
      values["coverList"] = rs.length
        ? `${won} ${won === 1 ? "WIN" : "WINS"} · ${dotList(rs.map((r) => r.grade))}`
        : "";
      break;
    }
  }
}

/** "Riley Thompson" → "Riley T." — a junior's name as a card may print it. */
export function juniorDisplayName(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  const last = parts[parts.length - 1].replace(/\.$/, "");
  return `${parts[0]} ${last[0]?.toUpperCase() ?? ""}.`;
}

/** The design slot that holds a kind's main photo, where it is not `photo`. */
export const KIND_PHOTO_SLOT: Readonly<Record<string, string>> = {
  teamList: "squadPhoto",
  premiership: "teamPhoto",
  tradingCard: "cardPhoto",
};

/**
 * Overlay per-render tenant data (logo, name, hashtags, sponsors, uploaded
 * photo) onto an already-bound input. Applied uniformly across every card kind
 * after {@link bindInput}, so a single seam threads tenant data into the pack
 * path (mirroring what `RenderOptions` already gives the canvas renderer).
 * Values set here override the template sample defaults; anything absent leaves
 * the sample fallback in place.
 *
 * Every in-app `PackCard` mount now passes `data` — including the Studio's
 * card-type gallery, which used to be treated as a deliberate sample-default
 * case and consequently showed Halls Head's branding to every tenant. The
 * sample fallback therefore only applies to brand-less tenants and to direct
 * `renderPackCard` calls in tests. A source-level guard
 * (`pack-card-mounts.test.ts`) keeps it that way.
 */
export function applyPackData(bound: BoundInput, data: PackCardData, kind: string): void {
  const { values, images } = bound;

  // A1 — tenant logo → top-left clubLogo slot (storyHeader / sharedHeader).
  if (data.brand?.logoUrl) images["clubLogo"] = data.brand.logoUrl;

  // A2 — club name + hashtags from the resolved brand / settings, replacing the
  // hard-coded "HALLS HEAD" / "#HALLSHEAD" sample defaults.
  if (data.brand?.name) set(values, "clubName", resolveCardTeamName(data.names, data.brand.name));
  // S1: this runs only for a real (data-bearing) render, so the sample hashtag
  // must NEVER survive — overwrite unconditionally, using "" when the tenant has
  // no configured hashtag, so another club's "#HALLSHEAD" can't leak through.
  values["clubHashtag"] = data.hashtag ?? "";
  values["hashtags"] = data.hashtag ?? "";
  // S2: the clubTagline sample is "CRICKET CLUB · EST 1991" — Halls Head's
  // founding year. Bind the tenant's own tagline (A9) where set, else "" so
  // another club's founding line never leaks through the sample default.
  values["clubTagline"] = data.brand?.tagline ?? "";
  // S3: the `hashtagsExtra` sample is a hard-coded competition line
  // ("#PEELPREMIERLEAGUE" / "LIVE UPDATES"). There is no clean per-tenant
  // competition source threaded onto PackCardData yet — deriving it would mean
  // inventing an association name — so clear it on every data-bearing render
  // rather than leak the Peel literal.
  // TODO(A9): thread a real competition hashtag from central match context
  // (central.matches grade/competition) once cards carry that on PackCardData.
  values["hashtagsExtra"] = "";

  // A3 — active sponsors → sponsor1..3 slots (already kind-filtered upstream),
  // capped at the kind's logo limit (one on match result / premiership cards).
  (data.sponsors ?? []).slice(0, Math.min(3, maxSponsorLogos(kind) ?? 3)).forEach((s, idx) => {
    if (s.logoUrl) images[`sponsor${idx + 1}`] = s.logoUrl;
  });

  // A7 — presenting (primary) sponsor → the "presented by <sponsor>" line.
  // S1-style: this runs only for a real (data-bearing) render, so the sample
  // literal ("eSA Sport" / "PlayHQ") must NEVER survive — overwrite
  // unconditionally, using "" when the tenant designated no presenting sponsor.
  // An empty value makes {@link dropEmptyPresentedBy} drop the whole line so no
  // orphan "presented by" prose is left behind.
  values["sponsorPresentedBy"] = data.presentingSponsorName ?? "";

  // S4: a match day card's note ("BAR & KITCHEN OPEN") is the admin's own
  // words or nothing: the sample must never print on a real card. Empty, the
  // note box drops out (`data-drop-if-field`).
  if (kind === "matchDay") {
    values["note.title"] ??= "";
    values["note.body"] ??= "";
  }

  // A4 — uploaded / selected photo overrides the input's own photoUrl.
  //
  // This used to also fill match-result's `potm.photo` (A5). That slot is gone:
  // the Player-of-the-Match section was removed from every pack because
  // `potm.name` / `potm.figures` / `potm.detail` are not on `ShareCardInput` and
  // nothing ever populated them, so the panel published a fabricated player as
  // though it were that week's result.
  if (data.photoUrl) {
    images["photo"] = data.photoUrl;
    // Kinds whose designs name their photo slot otherwise: without this the
    // chosen photo (a queue draft's pick, or one picked in the share dialog)
    // never reached a Team List, Premiership or Trading Card design.
    const slot = KIND_PHOTO_SLOT[kind];
    if (slot) images[slot] = data.photoUrl;
  }

  // B1 — generic per-slot image overrides. Applied LAST so an admin's explicit
  // per-slot upload wins over both the bound input image and every overlay above
  // (brand logo, sponsors, uploaded photo): override > input > bind. Empty
  // values are ignored so a cleared override falls back rather than blanking the
  // slot.
  if (data.imagesOverride) {
    for (const [slotKey, url] of Object.entries(data.imagesOverride)) {
      if (url) images[slotKey] = url;
    }
  }
}

/**
 * The Grade Leader heading for a category, as two lines. Dismissals get their
 * own ("SAFE HANDS") rather than borrowing the run-scorer heading.
 */
export function leaderTitle(category: string): [string, string] {
  if (/dismiss/i.test(category)) return ["SAFE", "HANDS"];
  if (/catch/i.test(category)) return ["LEADING", "CATCHER"];
  if (/wicket|bowl/i.test(category)) return ["LEADING", "WICKET-TAKER"];
  return ["LEADING", "RUN-SCORER"];
}

/**
 * The one-word result headline for a match summary. A loss reads "RESULT"
 * rather than shouting "LOSS" on the club's own channel; the result line
 * under it says who won.
 */
export const resultWord = summaryResultWord;

/**
 * Detailed carousel match card: one value set per innings, in input order,
 * every innings bound (none dropped). Only real data — empty when absent,
 * never a sample. Escaping is the renderer's (text fields).
 */
function bindInningsDetail(
  input: Extract<ShareCardInput, { kind: "matchSummary" }>,
  values: Record<string, string>,
  team: (name: string) => string,
): void {
  const multi = input.innings.length > 2;
  input.innings.forEach((inn, i) => {
    const side = inn.teamKey === "club" ? input.club : input.opposition;
    const p = `inn${i}.`;
    values[`${p}team`] = team(side.name);
    const teamInnings = input.innings
      .slice(0, i + 1)
      .filter((x) => x.teamKey === inn.teamKey).length;
    values[`${p}label`] = multi ? `${teamInnings === 1 ? "1ST" : "2ND"} INNINGS` : "INNINGS";
    values[`${p}score`] = inningsScore(inn);
    values[`${p}overs`] = inn.overs ? `${inn.overs} OV` : "";
    values[`${p}batters`] =
      inn.topBatters
        .slice(0, 3)
        .map(
          (b) =>
            `${b.name} ${b.runs}${b.notOut ? "*" : ""}${b.balls != null ? ` (${b.balls})` : ""}`,
        )
        .join(" · ") || "-";
    // Bowlers who bowled at this innings: the other side.
    values[`${p}bowlers`] =
      inn.topBowlers
        .slice(0, 2)
        .map((b) => `${b.name} ${b.wickets}/${b.runs} (${b.overs})`)
        .join(" · ") || "-";
  });
}
