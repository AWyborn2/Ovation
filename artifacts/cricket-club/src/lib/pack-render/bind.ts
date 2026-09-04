/**
 * Pack renderer — input binding: `ShareCardInput` → template field values,
 * repeat rows and image urls, plus the tenant-data overlay (`applyPackData`).
 */

import type {
  ShareCardInput,
  MatchSummaryInnings,
  TeamListPlayer,
  WeekendWrapMatch,
  LadderRow,
  ClubLeaderboardLeader,
} from "../share-card";
import type { BoundInput, PackCardData, PackRow } from "./types";

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

export function bindInput(input: ShareCardInput): BoundInput {
  const values: Record<string, string> = {};
  const images: Record<string, string> = {};
  const rows: Record<string, PackRow[]> = {};

  switch (input.kind) {
    case "matchSummary": {
      set(values, "matchTitle", input.matchTitle);
      set(values, "result", input.result);
      set(values, "club.name", input.club.name);
      set(values, "opposition.name", input.opposition.name);
      if (input.club.logoUrl) images["club.logo"] = input.club.logoUrl;
      if (input.opposition.logoUrl) images["opposition.logo"] = input.opposition.logoUrl;
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
      if (input.resultWinner === "draw") {
        set(values, "resultVerb", "MATCH DRAWN");
        set(values, "resultVerbShort", "DRAW");
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
      set(values, "opponent", input.opponent);
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
      set(values, "opponent", input.opponent);
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
      set(values, "opponent", input.opponent);
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
      set(values, "roundLabel", input.roundLabel);
      set(values, "opposition.name", input.oppositionName);
      set(values, "homeAway", input.homeAway);
      set(values, "oppositionHomeAway", input.homeAway === "HOME" ? "AWAY" : "HOME");
      set(values, "venue", input.venue);
      set(values, "date", input.date);
      set(values, "startTime", input.startTime);
      set(values, "note.title", input.noteTitle);
      set(values, "note.body", input.noteBody);
      if (input.oppositionLogoUrl) images["opposition.logo"] = input.oppositionLogoUrl;
      break;
    }
    case "teamList": {
      set(values, "gradeRound", input.gradeRound);
      set(values, "competitionLine", input.competitionLine);
      set(values, "venueDateTime", input.venueDateTime);
      if (input.squadPhotoUrl) images["squadPhoto"] = input.squadPhotoUrl;
      rows["players"] = (input.players ?? []).map((p: TeamListPlayer) => ({
        values: {
          number: String(p.order),
          surname: p.surname,
          role: p.role ?? "",
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
      set(values, "competitionName", input.competitionName);
      set(values, "gradeLabel", input.gradeLabel);
      set(values, "asOfLabel", input.asOfLabel);
      rows["rows"] = (input.rows ?? []).map((r: LadderRow) => ({
        variant: r.isClub ? "club" : undefined,
        values: {
          pos: String(r.pos),
          team: r.team,
          played: String(r.played),
          won: String(r.won),
          lost: String(r.lost),
          points: String(r.points),
        },
      }));
      break;
    }
    case "bigMoment": {
      set(values, "oppositionName", input.oppositionName);
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
      rows["leaders"] = (input.leaders ?? []).map((l: ClubLeaderboardLeader) => ({
        values: {
          gradeLabel: l.gradeLabel,
          playerName: l.playerName,
          value: l.value,
        },
      }));
      break;
    }
  }

  return { values, images, rows };
}

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
export function applyPackData(bound: BoundInput, data: PackCardData, _kind: string): void {
  const { values, images } = bound;

  // A1 — tenant logo → top-left clubLogo slot (storyHeader / sharedHeader).
  if (data.brand?.logoUrl) images["clubLogo"] = data.brand.logoUrl;

  // A2 — club name + hashtags from the resolved brand / settings, replacing the
  // hard-coded "HALLS HEAD" / "#HALLSHEAD" sample defaults.
  if (data.brand?.name) set(values, "clubName", data.brand.name);
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

  // A3 — active sponsors → sponsor1..3 slots (already kind-filtered upstream).
  (data.sponsors ?? []).slice(0, 3).forEach((s, idx) => {
    if (s.logoUrl) images[`sponsor${idx + 1}`] = s.logoUrl;
  });

  // A7 — presenting (primary) sponsor → the "presented by <sponsor>" line.
  // S1-style: this runs only for a real (data-bearing) render, so the sample
  // literal ("eSA Sport" / "PlayHQ") must NEVER survive — overwrite
  // unconditionally, using "" when the tenant designated no presenting sponsor.
  // An empty value makes {@link dropEmptyPresentedBy} drop the whole line so no
  // orphan "presented by" prose is left behind.
  values["sponsorPresentedBy"] = data.presentingSponsorName ?? "";

  // A4 — uploaded / selected photo overrides the input's own photoUrl.
  //
  // This used to also fill match-result's `potm.photo` (A5). That slot is gone:
  // the Player-of-the-Match section was removed from every pack because
  // `potm.name` / `potm.figures` / `potm.detail` are not on `ShareCardInput` and
  // nothing ever populated them, so the panel published a fabricated player as
  // though it were that week's result.
  if (data.photoUrl) images["photo"] = data.photoUrl;

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
