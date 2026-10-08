import type { ClubPhoto, Fixture, SocialSettingsBundle } from "@workspace/api-client-react";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import type { PhotoTransform, ShareCardInput } from "@/lib/share-card";
import type { PackCardData } from "@/lib/pack-render";
import { buildPackData, tenantHashtag } from "@/lib/pack-card-data";
import { gradeMatchKey } from "@/lib/share-card/sponsor-limit";
import type { CarouselSetType } from "@workspace/scorecard/queued-carousel";

// Same club-time standard as the fixture and availability engines. Tenants do
// not yet have a timezone setting; never use the browser/server's local zone.
export const CLUB_TIME_ZONE = "Australia/Perth";
export type TeamSlide = { fixture: Fixture; input?: ShareCardInput; photoId: number | null; transform: PhotoTransform };
export type CoverPhoto = { photoId: number | null; transform: PhotoTransform };
export const COVER_PHOTO_UNAVAILABLE = "The selected cover photo is no longer available in Club-wide · Season 2026. Choose another photo or remove it before sending to review.";

export function eligibleCoverPhotos(photos: ClubPhoto[]): ClubPhoto[] {
  return photos.filter(p => p.grade === null && p.season === 2026);
}
export type WeekendSlide = {
  id: string;
  label: string;
  input: ShareCardInput;
  data: PackCardData;
  junior: boolean;
  sponsorsOn: boolean;
  warnings: string[];
};

export function localDay(date: Date, timeZone = CLUB_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map(k => parts.find(p => p.type === k)!.value).join("-");
}

export function weekendRange(now = new Date(), timeZone = CLUB_TIME_ZONE) {
  const day = new Date(`${localDay(now, timeZone)}T12:00:00Z`);
  const weekday = day.getUTCDay();
  day.setUTCDate(day.getUTCDate() + (weekday === 0 ? -2 : 5 - weekday));
  const from = day.toISOString().slice(0, 10);
  day.setUTCDate(day.getUTCDate() + 2);
  return { from, to: day.toISOString().slice(0, 10) };
}

export function rangeForSet(type: CarouselSetType, now = new Date()) {
  const range = weekendRange(now);
  if (type !== "results" && type !== "matchSummary") return range;
  // A weekend is complete only after its Sunday in club time.
  const today = localDay(now);
  if (range.to < today) return range;
  const shift = (s: string) => {
    const d = new Date(`${s}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  };
  return { from: shift(range.from), to: shift(range.to) };
}

export function validRange(from: string, to: string): boolean {
  const validDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
    && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  return validDay(from) && validDay(to) && from <= to;
}

export function fixturesInRange(fixtures: Fixture[], from: string, to: string, timeZone = CLUB_TIME_ZONE) {
  if (!validRange(from, to)) return [];
  return fixtures.filter(f => {
    const date = new Date(f.startAt);
    if (!Number.isFinite(date.getTime())) return false;
    const status = (f as Fixture & { status?: string }).status ?? "";
    if (/cancelled|canceled|abandoned|^bye$/i.test(status) || /^bye$/i.test(f.opponentName.trim())) return false;
    // Manual fixture notes are the only cancellation marker on legacy rows.
    if (/\b(cancelled|canceled|abandoned)\b/i.test(f.notes ?? "")) return false;
    const day = localDay(date, timeZone);
    return day >= from && day <= to;
  }).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.grade.localeCompare(b.grade) || a.id - b.id);
}

export function eligiblePhotos(photos: ClubPhoto[], grade: string): ClubPhoto[] {
  if (!grade || isJuniorGradeLabel(grade)) return [];
  return photos.filter(p => p.grade === grade && p.photoTypes.some(t => ["batting", "bowling", "fielding"].includes(t)));
}

export function createTeamSlides(fixtures: Fixture[], photos: ClubPhoto[], content?: Record<string, Record<string, unknown>>): TeamSlide[] {
  return fixtures.map(fixture => {
    const eligible = content?.[fixture.id]?.junior === true ? [] : eligiblePhotos(photos, fixture.grade);
    return {
      fixture,
      ...(content?.[fixture.id] ? { input: content[fixture.id] as ShareCardInput } : {}),
      photoId: eligible.length ? eligible[Math.floor(Math.random() * eligible.length)].id : null,
      transform: { focalX: 0.5, focalY: 0.22, zoom: 1 },
    };
  });
}

export function moveTeam(teams: TeamSlide[], from: number, to: number): TeamSlide[] {
  const next = [...teams];
  if (from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [team] = next.splice(from, 1);
  next.splice(to, 0, team);
  return next;
}

/** Use explicit source labels, never dates or grade names. Only historical
 * summary inputs without metadata need the old display-title fallback. */
export function carouselRoundLabel(teams: TeamSlide[]): string {
  const labels = teams.map(({ fixture, input }) => {
    const summaryRound = input?.kind === "matchSummary" && input.roundLabel == null
      ? input.matchTitle.split(" • ").slice(1).join(" • ")
      : "";
    const contentRound = input && "roundLabel" in input ? input.roundLabel : undefined;
    const sourceLabel = input?.kind === "matchSummary" && input.roundLabel != null
      ? input.roundLabel
      : summaryRound.trim() || contentRound?.trim() || fixture.roundLabel || "";
    const raw = sourceLabel.trim().replace(/\s+/g, " ");
    const numeric = raw.match(/^(?:(?:round|r)\s*\.?\s*)?(\d+)$/i);
    return numeric ? `ROUND ${Number(numeric[1])}` : raw.toUpperCase();
  });
  const distinct = new Set(labels.filter(Boolean));
  if (distinct.size > 1) return "MIXED ROUNDS";
  // A known round for one team does not establish the round of another.
  if (!labels.length || labels.some(label => !label)) return "";
  return labels[0];
}

export function buildWeekendSlides(
  teams: TeamSlide[], photos: ClubPhoto[], bundle: SocialSettingsBundle,
  title: string, from: string, to: string, timeZone = CLUB_TIME_ZONE,
  cover?: { selection: CoverPhoto; photos: ClubPhoto[] },
): WeekendSlide[] {
  if (!teams.length || !validRange(from, to)) return [];
  const dateLabel = (date: Date) => date.toLocaleDateString("en-AU", {
    timeZone, weekday: "short", day: "numeric", month: "short",
  }).replace(/,/g, "").toUpperCase();
  const rangeLabel = `${dateLabel(new Date(`${from}T12:00:00Z`))} – ${dateLabel(new Date(`${to}T12:00:00Z`))}`;
  const base = { brand: bundle.brand, hashtag: tenantHashtag(bundle), packColourModes: bundle.settings.packColourModes };
  // Carousel placements are explicit roles, not the generic match-day strip.
  // Keep API ordering when more than one sponsor is assigned to a grade.
  const activeSponsors = bundle.settings.sponsorsEnabled ? bundle.activeSponsors : [];
  const presenting = activeSponsors.find(s => s.isPresenting);
  const sponsorData = (s: (typeof activeSponsors)[number]) => ({ name: s.name, logoUrl: s.logoUrl });
  const sponsors = activeSponsors
    .filter(s => !(s.grades ?? []).some(g => gradeMatchKey(g)))
    .map(sponsorData);
  const blank: Extract<ShareCardInput, { kind: "matchDay" }> = {
    kind: "matchDay", roundLabel: carouselRoundLabel(teams), oppositionName: "", homeAway: "HOME", venue: "", date: rangeLabel, startTime: "",
  };
  const coverPhoto = cover && eligibleCoverPhotos(cover.photos).find(p => p.id === cover.selection.photoId);
  const invalidCover = cover?.selection.photoId != null && !coverPhoto;
  const bookend = (page: "title" | "sponsors"): WeekendSlide => ({
    id: page,
    label: page === "title" ? "Title page" : "Sponsors",
    input: { ...blank, carouselPage: { page, title: title.trim() || "This weekend", fixtureCount: teams.length, sponsors: page === "sponsors" ? sponsors : [],
      ...(page === "title" && coverPhoto ? { hasCoverPhoto: true } : {}) } },
    data: buildPackData({
      ...base,
      ...(page === "title" ? {
        sponsors: presenting ? [sponsorData(presenting)] : [],
        presentingSponsorName: presenting?.name,
        ...(coverPhoto ? { photoUrl: coverPhoto.url, photoTransform: cover!.selection.transform } : {}),
      } : {}),
    }),
    junior: false,
    sponsorsOn: page === "title" && !!presenting,
    warnings: page === "title" && invalidCover ? [COVER_PHOTO_UNAVAILABLE]
      : page === "sponsors" && !sponsors.length ? ["No active sponsors without a team assignment are available, or sponsors are switched off. The closing page shows a club thank-you instead."] : [],
  });
  return [
    bookend("title"),
    ...teams.map(({ fixture: f, input, photoId, transform }): WeekendSlide => {
      const junior = isJuniorGradeLabel(f.grade) || (!!input && "junior" in input && input.junior === true);
      // Revalidate the chosen ID against the CURRENT library. No fallback after
      // deletion/reclassification and no arbitrary URL accepted from UI state.
      const photo = junior ? undefined : eligiblePhotos(photos, f.grade).find(p => p.id === photoId);
      const warnings: string[] = [];
      const gradeKey = gradeMatchKey(f.grade);
      const assigned = activeSponsors.filter(s => gradeKey && (s.grades ?? []).some(g => gradeMatchKey(g) === gradeKey));
      const teamSponsor = assigned[0];
      if (bundle.settings.sponsorsEnabled && !teamSponsor) warnings.push("No sponsor is assigned to this team. Assign one in sponsor settings.");
      if (assigned.length > 1) warnings.push("Multiple sponsors are assigned to this team. Only the first in sponsor order is shown.");
      if (!photo) warnings.push(junior ? "Junior privacy: this card has no photo." : "No eligible photo selected. Choose a batting, bowling or fielding photo in this grade's library.");
      if (!f.venue?.trim()) warnings.push("Venue is missing. Update the fixture before sharing.");
      if (!f.opponentName.trim()) warnings.push("Opponent is missing. Update the fixture before sharing.");
      const at = new Date(f.startAt);
      return {
        id: `fixture-${f.id}`, label: `${f.grade} v ${f.opponentName}`, warnings, junior,
        sponsorsOn: !!teamSponsor,
        input: Object.assign({}, input ?? {
          kind: "matchDay", grade: f.grade, roundLabel: f.roundLabel ?? "",
          oppositionName: f.opponentName || "Opponent TBC", oppositionLogoUrl: f.opponentLogoUrl,
          homeAway: f.isHome ? "HOME" : "AWAY", venue: f.venue?.trim() || "Venue TBC",
          date: dateLabel(at), startTime: at.toLocaleTimeString("en-AU", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase(),
          junior,
        } satisfies ShareCardInput, { carouselContent: true },
        input?.kind === "teamList" ? { grade: input.grade?.trim() || f.grade } : {}),
        data: buildPackData({ ...base, photoUrl: photo?.url ?? null, photoTransform: transform,
          sponsors: teamSponsor ? [sponsorData(teamSponsor)] : [],
          presentingSponsorName: teamSponsor?.name }),
      };
    }),
    bookend("sponsors"),
  ];
}
