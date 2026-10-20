import type {
  ClubPhoto,
  Fixture,
  SocialSettingsBundle,
  WeekendSponsorsPageSources,
} from "@workspace/api-client-react";
import { groupSlides, isJuniorGradeLabel } from "@workspace/scorecard";
import type { PhotoTransform, ShareCardInput } from "@/lib/share-card";
import type { PackCardData } from "@/lib/pack-render";
import { buildPackData, tenantHashtag } from "@/lib/pack-card-data";
import { gradeMatchKey } from "@/lib/share-card/sponsor-limit";
import { contentSlideInput, type CarouselSetType } from "@workspace/scorecard/queued-carousel";
import {
  combinedRoundLabel,
  dayHeading,
  dayResultRow,
  matchDayDayContent,
  matchDaySponsorsContent,
  matchDayTitleContent,
  resolveVisibleFields,
  type CardContent,
  type ContentPhotoOverride,
  type MatchDayFixtureContent,
} from "@workspace/scorecard/card-content";

// Same club-time standard as the fixture and availability engines. Tenants do
// not yet have a timezone setting; never use the browser/server's local zone.
export const CLUB_TIME_ZONE = "Australia/Perth";
export type TeamSlide = {
  fixture: Fixture;
  /** Match Day: the slide's content from the server builder (ADR-010). */
  content?: MatchDayFixtureContent;
  /** Kinds not on the content pipeline yet (team lists, results): the frozen card input. */
  input?: ShareCardInput;
  photoId: number | null;
  /**
   * Match Day: the server's automatic photo for the slide (ADR-010 P4; null =
   * nothing fits, brand background). A `photoId` that differs is the admin's swap.
   */
  autoPhotoId?: number | null;
  transform: PhotoTransform;
};

/** The server's automatic Match Day photos (`photoPicks` on the carousel sources). */
export type PhotoPicks = { cover: number | null; fixtures: Record<string, number | null> };

/** A carousel source per fixture id: Match Day content, or another kind's card input. */
export type SourceContent = Record<string, Record<string, unknown>>;

export function isFixtureContent(v: unknown): v is MatchDayFixtureContent {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { kind?: unknown }).kind === "matchDay" &&
    (v as { page?: unknown }).page === "fixture"
  );
}

/** The sources' per-fixture content in one map (Match Day content joins the card inputs). */
export function carouselSourceContent(
  sources:
    | {
        content?: Record<string, Record<string, unknown>>;
        matchDayContent?: Record<string, MatchDayFixtureContent>;
      }
    | undefined,
): SourceContent {
  return {
    ...(sources?.content ?? {}),
    ...((sources?.matchDayContent ?? {}) as unknown as SourceContent),
  };
}

/** A team slide's source, split by kind. */
function teamSource(src: Record<string, unknown> | undefined) {
  if (isFixtureContent(src)) return { content: src };
  return src ? { input: src as unknown as ShareCardInput } : {};
}

/** Whether a team slide is a junior one (from its content or card input). */
export function teamIsJunior(team: Pick<TeamSlide, "fixture" | "content" | "input">): boolean {
  if (team.content) return team.content.junior;
  return (
    isJuniorGradeLabel(team.fixture.grade) ||
    (!!team.input && "junior" in team.input && team.input.junior === true)
  );
}
export type CoverPhoto = { photoId: number | null; transform: PhotoTransform };
export const COVER_PHOTO_UNAVAILABLE =
  "The selected cover photo is no longer available in Club-wide · Season 2026. Choose another photo or remove it before sending to review.";

export function eligibleCoverPhotos(photos: ClubPhoto[]): ClubPhoto[] {
  const stock = new Set(eligibleJuniorStockPhotos(photos).map((p) => p.id));
  return [
    ...new Map(
      photos
        .filter((p) => (p.grade === null && p.season === 2026) || stock.has(p.id))
        .map((p) => [p.id, p]),
    ).values(),
  ];
}
export type WeekendSlide = {
  id: string;
  label: string;
  /** What the slide renders; a content slide's is derived from its content. */
  input: ShareCardInput;
  data: PackCardData;
  junior: boolean;
  sponsorsOn: boolean;
  warnings: string[];
  /** Content slides (ADR-010): the snapshot a version 2 carousel saves. */
  content?: CardContent;
  visibleFields?: string[];
  photoId?: number | null;
  /** A junior day slide (P3): the fixtures it holds, for the team editor. Not saved. */
  fixtureIds?: number[];
};

/** How junior items share slides (ADR-010 P3); absent, every item has its own slide. */
export interface SlideGrouping {
  setType: CarouselSetType;
  /** The club's switch (`card_content.matchDay.juniorConsolidateByDay`). */
  consolidateByDay: boolean;
  /** Matches a junior day slide holds at the carousel's pack, size and preset. */
  capacity: number;
}

/** The slide a team's fixture is on: its own, or the junior day slide it shares. */
export function slideForFixture(slides: WeekendSlide[], fixtureId: number) {
  return slides.find(
    (sl) => sl.id === `fixture-${fixtureId}` || sl.fixtureIds?.includes(fixtureId),
  );
}

export function localDay(date: Date, timeZone = CLUB_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map((k) => parts.find((p) => p.type === k)!.value).join("-");
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
  const validDay = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  return validDay(from) && validDay(to) && from <= to;
}

export function fixturesInRange(
  fixtures: Fixture[],
  from: string,
  to: string,
  timeZone = CLUB_TIME_ZONE,
) {
  if (!validRange(from, to)) return [];
  return fixtures
    .filter((f) => {
      const date = new Date(f.startAt);
      if (!Number.isFinite(date.getTime())) return false;
      const status = (f as Fixture & { status?: string }).status ?? "";
      if (
        /cancelled|canceled|abandoned|^bye$/i.test(status) ||
        /^bye$/i.test(f.opponentName.trim())
      )
        return false;
      // Manual fixture notes are the only cancellation marker on legacy rows.
      if (/\b(cancelled|canceled|abandoned)\b/i.test(f.notes ?? "")) return false;
      const day = localDay(date, timeZone);
      return day >= from && day <= to;
    })
    .sort(
      (a, b) =>
        Date.parse(a.startAt) - Date.parse(b.startAt) ||
        a.grade.localeCompare(b.grade) ||
        a.id - b.id,
    );
}

export function eligiblePhotos(photos: ClubPhoto[], grade: string): ClubPhoto[] {
  if (!grade || isJuniorGradeLabel(grade)) return [];
  return photos.filter(
    (p) =>
      p.grade === grade && p.photoTypes.some((t) => ["batting", "bowling", "fielding"].includes(t)),
  );
}

/** Explicitly uploaded club artwork only; never infer permission from a folder. */
export function eligibleJuniorStockPhotos(photos: ClubPhoto[]): ClubPhoto[] {
  return photos.filter((p) => p.juniorStock === true && p.grade === null && !p.playerIds.length);
}

/** Explicit stock choices work across all set types; ordinary photos keep their grade rules. */
export function eligibleCarouselPhotos(
  photos: ClubPhoto[],
  grade: string,
  junior = false,
): ClubPhoto[] {
  const stock = eligibleJuniorStockPhotos(photos);
  return junior || isJuniorGradeLabel(grade) ? stock : [...eligiblePhotos(photos, grade), ...stock];
}

/**
 * A slide per fixture. Match Day (`picks` from the server) starts on the
 * automatic photo when it is still one the slide may show; other kinds start
 * on a random photo of the grade.
 */
export function createTeamSlides(
  fixtures: Fixture[],
  photos: ClubPhoto[],
  content?: SourceContent,
  picks?: PhotoPicks | null,
): TeamSlide[] {
  return fixtures.map((fixture) => {
    const junior = content?.[fixture.id]?.junior === true;
    if (picks) {
      const auto = picks.fixtures[fixture.id] ?? null;
      const valid = eligibleCarouselPhotos(photos, fixture.grade, junior).some(
        (p) => p.id === auto,
      );
      return {
        fixture,
        ...teamSource(content?.[fixture.id]),
        photoId: valid ? auto : null,
        autoPhotoId: valid ? auto : null,
        transform: { focalX: 0.5, focalY: 0.22, zoom: 1 },
      };
    }
    const eligible = junior ? [] : eligiblePhotos(photos, fixture.grade);
    return {
      fixture,
      ...teamSource(content?.[fixture.id]),
      photoId: eligible.length ? eligible[Math.floor(Math.random() * eligible.length)].id : null,
      transform: { focalX: 0.5, focalY: 0.22, zoom: 1 },
    };
  });
}

/** Whether a slide's photo is the admin's swap rather than the automatic pick. */
export function isSwapped(team: Pick<TeamSlide, "photoId" | "autoPhotoId">): boolean {
  return team.autoPhotoId !== undefined && team.photoId !== team.autoPhotoId;
}

/**
 * The photos an admin swapped in, as the carousel's content override saves them
 * (ADR-010 P4); null when every slide kept its automatic pick.
 */
export function photoOverride(
  teams: readonly TeamSlide[],
  cover?: { photoId: number | null; autoPhotoId?: number | null } | null,
): ContentPhotoOverride | null {
  const fixtures = Object.fromEntries(
    teams.filter(isSwapped).map((t) => [String(t.fixture.id), t.photoId]),
  );
  const out: ContentPhotoOverride = {
    ...(cover && isSwapped(cover) ? { cover: cover.photoId } : {}),
    ...(Object.keys(fixtures).length ? { fixtures } : {}),
  };
  return Object.keys(out).length ? out : null;
}

export type CarouselAudience = "all" | "senior" | "junior";

export function filterCarouselFixtures(
  fixtures: Fixture[],
  content: Record<string, Record<string, unknown>> | undefined,
  audience: CarouselAudience,
): Fixture[] {
  return fixtures.filter((f) => {
    const junior = content?.[f.id]?.junior === true || isJuniorGradeLabel(f.grade);
    return audience === "all" || (audience === "junior" ? junior : !junior);
  });
}

/** Refresh content without discarding valid photo/crop choices or edited order. */
export function refreshTeamSlides(
  fixtures: Fixture[],
  photos: ClubPhoto[],
  content: Record<string, Record<string, unknown>>,
  previous: TeamSlide[] = [],
  preserveOrder = true,
  picks?: PhotoPicks | null,
): TeamSlide[] {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const oldById = new Map(previous.map((t) => [t.fixture.id, t]));
  const ordered = preserveOrder
    ? [
        ...previous.flatMap((t) => (byId.has(t.fixture.id) ? [byId.get(t.fixture.id)!] : [])),
        ...fixtures.filter((f) => !oldById.has(f.id)),
      ]
    : fixtures;
  return ordered.map((fixture) => {
    const old = oldById.get(fixture.id);
    if (!old) return createTeamSlides([fixture], photos, content, picks)[0];
    const eligible = eligibleCarouselPhotos(
      photos,
      fixture.grade,
      content[fixture.id]?.junior === true,
    );
    return {
      fixture,
      ...teamSource(content[fixture.id]),
      // Removed/reclassified photos are cleared, never silently replaced.
      photoId: eligible.some((p) => p.id === old.photoId) ? old.photoId : null,
      ...(old.autoPhotoId !== undefined
        ? { autoPhotoId: eligible.some((p) => p.id === old.autoPhotoId) ? old.autoPhotoId : null }
        : {}),
      transform: { ...old.transform },
    };
  });
}

export function carouselSelectionKey(
  type: CarouselSetType,
  from: string,
  to: string,
  fixtures: Fixture[],
  content: Record<string, Record<string, unknown>> = {},
): string {
  return JSON.stringify([
    type,
    from,
    to,
    fixtures,
    Object.fromEntries(fixtures.map((f) => [f.id, content[f.id] ?? null])),
  ]);
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
  return combinedRoundLabel(teams.map(teamRoundLabel));
}

/** A team slide's round, as its source gave it. */
function teamRoundLabel({ fixture, content, input }: TeamSlide): string {
  if (content) return content.source.roundLabel ?? "";
  const summaryRound =
    input?.kind === "matchSummary" && input.roundLabel == null
      ? input.matchTitle.split(" • ").slice(1).join(" • ")
      : "";
  const contentRound = input && "roundLabel" in input ? input.roundLabel : undefined;
  return input?.kind === "matchSummary" && input.roundLabel != null
    ? input.roundLabel
    : summaryRound.trim() || contentRound?.trim() || fixture.roundLabel || "";
}

export function buildWeekendSlides(
  teams: TeamSlide[],
  photos: ClubPhoto[],
  bundle: SocialSettingsBundle,
  title: string,
  from: string,
  to: string,
  timeZone = CLUB_TIME_ZONE,
  cover?: { selection: CoverPhoto; photos: ClubPhoto[] },
  /** The content fields shown (ADR-010): the club's choices plus this carousel's override. */
  visible: ReadonlySet<string> = resolveVisibleFields("matchDay"),
  /** The sponsors page's optional blocks from the sources (P6); absent → none. */
  sponsorsPage?: WeekendSponsorsPageSources | null,
  grouping?: SlideGrouping,
): WeekendSlide[] {
  if (!teams.length || !validRange(from, to)) return [];
  const show = (field: string) => visible.has(field);
  const visibleFields = [...visible];
  const base = {
    brand: bundle.brand,
    hashtag: tenantHashtag(bundle),
    packColourModes: bundle.settings.packColourModes,
    names: bundle.cardNames,
  };
  // Carousel placements are explicit roles, not the generic match-day strip.
  // Keep API ordering when more than one sponsor is assigned to a grade.
  const activeSponsors = bundle.settings.sponsorsEnabled ? bundle.activeSponsors : [];
  const presenting = show("title.presentingSponsor")
    ? activeSponsors.find((s) => s.isPresenting)
    : undefined;
  const sponsorData = (s: (typeof activeSponsors)[number]) => ({
    name: s.name,
    logoUrl: s.logoUrl,
  });
  const isTeamSponsor = (s: (typeof activeSponsors)[number]) =>
    (s.grades ?? []).some((g) => gradeMatchKey(g));
  // The sponsors page holds every sponsor; team sponsors print only when
  // `sponsors.teamSponsors` is on (P6), so count what the page will show.
  const pageSponsors = activeSponsors.filter(
    (s) => show("sponsors.teamSponsors") || !isTeamSponsor(s),
  );
  const background = show("sponsors.background") ? (sponsorsPage?.backgroundPhoto ?? null) : null;
  const bookendOpts = {
    heading: title,
    from,
    to,
    roundLabels: teams.map(teamRoundLabel),
    fixtureCount: teams.length,
    timeZone,
    // The title page's livestream link (P5); shown when "title.livestream" is on.
    livestreamUrl: bundle.settings.livestreamUrl ?? null,
  };
  const coverPhoto =
    cover && show("title.coverPhoto")
      ? eligibleCoverPhotos(cover.photos).find((p) => p.id === cover.selection.photoId)
      : undefined;
  const invalidCover = show("title.coverPhoto") && cover?.selection.photoId != null && !coverPhoto;
  // Each slide's input comes from its content, exactly as the saved carousel derives it.
  const contentSlide = (
    slide: Omit<WeekendSlide, "input" | "visibleFields"> & { content: CardContent },
  ): WeekendSlide => {
    const withFields = { ...slide, visibleFields };
    return {
      ...withFields,
      input: contentSlideInput({
        ...withFields,
        data: withFields.data as Record<string, unknown>,
      }) as unknown as ShareCardInput,
    };
  };
  const bookend = (page: "title" | "sponsors"): WeekendSlide =>
    contentSlide({
      id: page,
      label: page === "title" ? "Title page" : "Sponsors",
      content:
        page === "title"
          ? matchDayTitleContent(bookendOpts)
          : matchDaySponsorsContent({
              ...bookendOpts,
              sponsors: activeSponsors.map((s) => ({
                name: s.name,
                logoUrl: s.logoUrl,
                tier: s.tier,
                teamSponsor: isTeamSponsor(s),
              })),
              nextHomeGame: sponsorsPage?.nextHomeGame ?? null,
              socials: sponsorsPage?.socials ?? [],
            }),
      photoId: page === "title" ? (coverPhoto?.id ?? null) : background ? background.id : null,
      data: buildPackData({
        ...base,
        ...(page === "title"
          ? {
              sponsors: presenting ? [sponsorData(presenting)] : [],
              presentingSponsorName: presenting?.name,
              ...(coverPhoto
                ? { photoUrl: coverPhoto.url, photoTransform: cover!.selection.transform }
                : {}),
            }
          : background
            ? { photoUrl: background.url }
            : {}),
      }),
      junior: false,
      sponsorsOn: page === "title" && !!presenting,
      warnings:
        page === "title" && invalidCover
          ? [COVER_PHOTO_UNAVAILABLE]
          : page === "sponsors"
            ? sponsorsPageWarnings(
                pageSponsors.length,
                show("sponsors.teamSponsors"),
                show("sponsors.background") && !background,
              )
            : [],
    });
  const teamSlide = (team: TeamSlide): WeekendSlide => {
    const { fixture: f, content, input, photoId, transform } = team;
    const junior = teamIsJunior(team);
    const photoOn = !content || show("fixture.photo");
    const sponsorOn = !content || show("fixture.teamSponsor");
    // Revalidate the chosen ID against the CURRENT library. No fallback after
    // deletion/reclassification and no arbitrary URL accepted from UI state.
    const photo = photoOn
      ? eligibleCarouselPhotos(photos, f.grade, junior).find((p) => p.id === photoId)
      : undefined;
    const warnings: string[] = [];
    const gradeKey = gradeMatchKey(f.grade);
    const assigned = sponsorOn
      ? activeSponsors.filter(
          (s) => gradeKey && (s.grades ?? []).some((g) => gradeMatchKey(g) === gradeKey),
        )
      : [];
    const teamSponsor = assigned[0];
    if (sponsorOn && bundle.settings.sponsorsEnabled && !teamSponsor)
      warnings.push("No sponsor is assigned to this team. Assign one in sponsor settings.");
    if (assigned.length > 1)
      warnings.push(
        "Multiple sponsors are assigned to this team. Only the first in sponsor order is shown.",
      );
    // Match Day: a slide with no photo prints on the brand background (ADR-010
    // P4); only a chosen photo that has gone from the library needs a word.
    if (photoOn && !photo && (!content || photoId != null))
      warnings.push(
        junior
          ? "No club stock image selected. Junior player photos are not used."
          : "No image selected. Choose a saved stock image or a batting, bowling or fielding photo in this grade's library.",
      );
    const venue = content ? content.venue : (f.venue?.trim() ?? "");
    const opponent = content ? content.opposition.rawName : f.opponentName.trim();
    if (!venue) warnings.push("Venue is missing. Update the fixture before sharing.");
    if (!opponent) warnings.push("Opponent is missing. Update the fixture before sharing.");
    const data = buildPackData({
      ...base,
      photoUrl: photo?.url ?? null,
      photoTransform: transform,
      sponsors: teamSponsor ? [sponsorData(teamSponsor)] : [],
      presentingSponsorName: teamSponsor?.name,
    });
    const slide = {
      id: `fixture-${f.id}`,
      label: `${f.grade} v ${f.opponentName}`,
      warnings,
      junior,
      sponsorsOn: !!teamSponsor,
      data,
    };
    if (content) return contentSlide({ ...slide, content, photoId: photo?.id ?? null });
    return {
      ...slide,
      input: Object.assign(
        {},
        input!,
        { carouselContent: true },
        ...(junior && photo
          ? [
              {
                juniorPhotoAllowed: true,
                juniorStockPhotoId: photo.id,
              },
            ]
          : []),
        input!.kind === "teamList" ? { grade: input!.grade?.trim() || f.grade } : {},
      ),
    };
  };
  // A junior day slide (P3): the day's games as compact rows. No photo and no
  // team sponsor (a slide covers several teams); every row is junior.
  const daySlide = (day: string, group: TeamSlide[]): WeekendSlide => {
    const warnings = group.flatMap(({ fixture: f, content }) => {
      const venue = content ? content.venue : (f.venue?.trim() ?? "");
      const opponent = content ? content.opposition.rawName : f.opponentName.trim();
      return [
        ...(venue ? [] : [`${f.grade}: venue is missing. Update the fixture before sharing.`]),
        ...(opponent
          ? []
          : [`${f.grade}: opponent is missing. Update the fixture before sharing.`]),
      ];
    });
    const slide = {
      id: `day-${day}-${group[0].fixture.id}`,
      label: `Juniors · ${dayHeading(day, timeZone)} (${group.length} games)`,
      data: buildPackData(base),
      junior: true,
      sponsorsOn: false,
      warnings,
      fixtureIds: group.map((t) => t.fixture.id),
    };
    if (group.every((t) => t.content))
      return contentSlide({
        ...slide,
        content: matchDayDayContent(group.map((t) => t.content!)),
        photoId: null,
      });
    const summaries = group.map(
      (t) => t.input as Extract<ShareCardInput, { kind: "matchSummary" }>,
    );
    const { carouselDetail: _detail, ...first } = summaries[0];
    return {
      ...slide,
      input: {
        ...first,
        junior: true,
        carouselDay: {
          heading: dayHeading(day, timeZone),
          results: summaries.map((r, i) => dayResultRow({ ...r, grade: group[i].fixture.grade })),
        },
      },
    };
  };
  // Match Day slides are built only from the server's content (no client mapping).
  const usable = teams.filter((t) => t.content || t.input);
  // Only junior content or junior results can share a day slide; anything else keeps its own.
  const dayable = (t: TeamSlide) =>
    t.content ? t.content.junior : t.input?.kind === "matchSummary" && t.input.junior === true;
  const plan = groupSlides(grouping?.setType ?? "matchDay", usable, {
    junior: (t) => teamIsJunior(t) && dayable(t),
    dayOf: (t) => t.content?.day ?? localDay(new Date(t.fixture.startAt), timeZone),
    consolidateByDay: grouping?.consolidateByDay ?? false,
    capacity: grouping?.capacity ?? 1,
    reserved: 2,
  });
  const titleSlide = bookend("title");
  return [
    plan.warning ? { ...titleSlide, warnings: [...titleSlide.warnings, plan.warning] } : titleSlide,
    ...plan.groups.map((g) =>
      g.role === "day" && g.day ? daySlide(g.day, g.items) : teamSlide(g.items[0]),
    ),
    bookend("sponsors"),
  ];
}

/** What the sponsors page warns about before it is shared. */
function sponsorsPageWarnings(
  shown: number,
  teamSponsors: boolean,
  missingBackground: boolean,
): string[] {
  return [
    ...(shown
      ? []
      : [
          teamSponsors
            ? "No active sponsors are available, or sponsors are switched off. The closing page shows a club thank-you instead."
            : "No active sponsors without a team assignment are available, or sponsors are switched off. The closing page shows a club thank-you instead.",
        ]),
    ...(missingBackground
      ? [
          "No sponsors page background is available. Choose a club-wide photo in Social Studio settings, or turn the background off.",
        ]
      : []),
  ];
}

/** A slide as a version 2 carousel saves it: content slides keep content, not a derived input. */
export function queuedSlide(slide: WeekendSlide): Record<string, unknown> {
  const { input, content, visibleFields, photoId, fixtureIds: _ids, ...rest } = slide;
  return content
    ? { ...rest, content, visibleFields: visibleFields ?? [], photoId: photoId ?? null }
    : { ...rest, input };
}
