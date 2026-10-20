import { and, eq, gt, inArray, lte, or } from "drizzle-orm";
import {
  db,
  juniorFixturesTable,
  juniorTeamListsTable,
  type JuniorFixtureRow,
  type JuniorNameStyle,
  type JuniorTeamListPlayer,
} from "@workspace/db";
import { normaliseParticipantId } from "@workspace/db/shirt-numbers";
import { logger } from "../logger";
import { loadDraftingGates } from "../posting-plan";
import { upsertDraftByKey } from "../draft-upsert";
import { loadJuniorNaming, loadJuniorTeamPublishing } from "../junior-helpers";
import { juniorPhotoFields, loadJuniorPhotos, pickJuniorCardPhoto } from "../junior-photos";
import { JUNIOR_WITHHELD_NAME, type JuniorNaming } from "../junior-names";
import { loadJuniorSeasonShirtNumbers } from "../junior-shirt-numbers";
import { juniorTeamListKey, juniorTeamPublishMode } from "../junior-publishing";
import { formatFixtureDate, formatFixtureTime } from "./match-day";
import { TEAM_LIST_LEAD_MS, type TeamListResult, type TeamListShirtNumbers } from "./team-list";

/**
 * Junior team-list cards (junior PlayHQ sync plan U8; KTD13, R17, R20, R21, F2).
 *
 * Mirrors `generateTeamListDrafts` for the club's published JUNIOR team lists, reading
 * `junior_fixtures` / `junior_team_lists` only (juniors isolation): kind `teamList`
 * marked `junior: true`, names in the club's public naming style (withheld players as
 * "Private Player"), shirt numbers from the juniors register by participant, and no
 * photo of any kind. Drafts are keyed per junior fixture (`juniorteamlist:<id>`), carry
 * `sourceMatchIsJunior`, and get an auto-ready time only when their team is explicitly
 * set to auto-post (KTD14).
 */

/** A selected player's public card name, or null when the name must be withheld. */
export type JuniorCardNamer = (
  participantId: string,
) => { name: string; style: JuniorNameStyle } | null;

/**
 * The card namer over the club's naming (KTD12): an own-club line through the club's
 * style. A private, non-overridden player — or a participant the club has no record of,
 * whose privacy cannot be known — is withheld.
 */
export function juniorCardNamer(naming: JuniorNaming): JuniorCardNamer {
  return (participantId) => {
    const line = naming.line({ participantId, playerName: null, isHallsHead: true });
    if (line.isPrivate || !line.playerName) return null;
    return { name: line.playerName, style: naming.style };
  };
}

type CardRow = {
  order: number;
  surname: string;
  firstInitial?: string;
  role?: string;
  overseas?: boolean;
};

/**
 * The surname / first-initial shape the team-list designs print (`broadcastName` is
 * "O. GALLASH"). Only the `full` style has a surname to print; the shorter styles print
 * their public name whole ("OLLIE G", "OLLIE") so no more of the name appears.
 */
function cardName(named: ReturnType<JuniorCardNamer>): Pick<CardRow, "surname" | "firstInitial"> {
  if (!named) return { surname: JUNIOR_WITHHELD_NAME.toUpperCase() };
  const parts = named.name.trim().split(/\s+/).filter(Boolean);
  if (named.style === "full" && parts.length >= 2) {
    const initial = parts[0]!.match(/\p{L}/u)?.[0]?.toUpperCase();
    return {
      surname: parts[parts.length - 1]!.toUpperCase(),
      ...(initial ? { firstInitial: initial } : {}),
    };
  }
  return { surname: parts.join(" ").toUpperCase() };
}

/**
 * A junior fixture's team-list card input. Pure. With `numbers` (the fixture season's
 * juniors register, passed only when the club has shirt numbers on) each named player
 * carries their `shirtNumber` and the card numbers by shirt. A withheld player carries
 * no number: a number next to "Private Player" could still identify the child.
 */
export function juniorTeamListToCardInput(
  fixture: JuniorFixtureRow,
  players: readonly JuniorTeamListPlayer[],
  nameOf: JuniorCardNamer,
  numbers?: TeamListShirtNumbers | null,
): Record<string, unknown> {
  const grade = fixture.grade ?? fixture.ageGroup ?? "";
  const startAt = fixture.startAt;
  const date = startAt ? formatFixtureDate(startAt) : "";
  const startTime = startAt ? formatFixtureTime(startAt) : "";
  return {
    kind: "teamList",
    // Junior content: the junior palette, never mixed with senior cards (R20).
    junior: true,
    gradeRound: grade.toUpperCase(),
    competitionLine: grade,
    venueDateTime: [fixture.venue ?? "", date, startTime].filter(Boolean).join(" • "),
    players: [...players]
      .sort((a, b) => a.order - b.order)
      .map((p) => {
        const named = nameOf(p.participantId);
        const row: CardRow = {
          order: p.order,
          ...cardName(named),
          ...(p.role ? { role: p.role } : {}),
          // The overseas mark goes with the name: a withheld player has none.
          ...(named && p.overseas ? { overseas: true } : {}),
        };
        const id = normaliseParticipantId(p.participantId);
        const shirtNumber =
          named && numbers && id !== null ? numbers.byParticipantId.get(id) : undefined;
        return shirtNumber ? { ...row, shirtNumber } : row;
      }),
    grade,
    ...(fixture.ageGroup ? { ageGroup: fixture.ageGroup } : {}),
    ...(fixture.teamName ? { teamName: fixture.teamName } : {}),
    roundLabel: "",
    opponent: fixture.opponentName ?? "",
    homeAway: fixture.isHome == null ? "" : fixture.isHome ? "HOME" : "AWAY",
    venue: fixture.venue ?? "",
    date,
    startTime,
    ...(numbers ? { numbering: "shirt" } : {}),
  };
}

/**
 * Draft (or refresh) a junior team-list card for each published junior team list whose
 * fixture starts within the next seven days, plus `alsoFixtureIds` (fixtures whose
 * unposted cards the sweep re-renders after a naming or privacy change, KTD15).
 *
 * Drafting respects the match-day family switch; within it, a junior age group drafts
 * unless the club turned it off. The caller decides that junior sync is enabled.
 */
export async function generateJuniorTeamListDrafts(
  tenantId: number,
  now: Date = new Date(),
  alsoFixtureIds: readonly number[] = [],
): Promise<TeamListResult> {
  const result: TeamListResult = { drafted: 0, refreshed: 0, skipped: 0 };
  // The Posting Plan's Team lists row: per-fixture cards, for the junior age groups it lists.
  // A round-carousel row puts junior teams on the round set instead (KTD6).
  const gates = await loadDraftingGates(tenantId);
  if (!gates.teamListsIndividual() || !gates.juniorsAny("teamLists")) return result;

  const upcoming = and(
    gt(juniorFixturesTable.startAt, now),
    lte(juniorFixturesTable.startAt, new Date(now.getTime() + TEAM_LIST_LEAD_MS)),
  );
  const rows = await db
    .select({ fixture: juniorFixturesTable, players: juniorTeamListsTable.players })
    .from(juniorTeamListsTable)
    .innerJoin(
      juniorFixturesTable,
      eq(juniorFixturesTable.id, juniorTeamListsTable.juniorFixtureId),
    )
    .where(
      and(
        eq(juniorTeamListsTable.tenantId, tenantId),
        eq(juniorFixturesTable.tenantId, tenantId),
        eq(juniorTeamListsTable.isPublished, true),
        alsoFixtureIds.length
          ? or(upcoming, inArray(juniorFixturesTable.id, [...alsoFixtureIds]))
          : upcoming,
      ),
    );
  if (rows.length === 0) return result;

  const participantIds = rows.flatMap((r) => r.players.map((p) => p.participantId));
  const [naming, publishing, photos] = await Promise.all([
    loadJuniorNaming(tenantId, participantIds),
    loadJuniorTeamPublishing(tenantId),
    // The listed players' own photos, allowed ones only (ADR-007).
    loadJuniorPhotos(tenantId, participantIds),
  ]);
  const nameOf = juniorCardNamer(naming);
  const seasons = new Map<number, Promise<TeamListShirtNumbers | null>>();
  const numbersFor = (season: number) => {
    let pending = seasons.get(season);
    if (!pending) {
      pending = loadJuniorSeasonShirtNumbers(tenantId, season).catch((err: unknown) => {
        logger.warn({ err, tenantId, season }, "junior team-list shirt-number lookup failed");
        return null;
      });
      seasons.set(season, pending);
    }
    return pending;
  };

  for (const { fixture, players } of rows) {
    if (players.length === 0 || !gates.teamListsGrade(fixture.ageGroup, true)) {
      result.skipped++;
      continue;
    }
    const mode = juniorTeamPublishMode(publishing, fixture.ageGroup, fixture.teamName);
    const sourceKey = juniorTeamListKey(fixture.id);
    // One featured player with an allowed photo, picked by the draft key like a senior
    // team list (ADR-007); none when no listed player qualifies.
    const photo = juniorPhotoFields(
      pickJuniorCardPhoto(
        photos,
        players.map((p) => p.participantId),
        sourceKey,
      ),
    );
    const { action } = await upsertDraftByKey({
      tenantId,
      engine: "teamlist",
      family: "matchday",
      sourceKey,
      cardInput: {
        ...juniorTeamListToCardInput(
          fixture,
          players,
          nameOf,
          await numbersFor(fixture.seasonStartYear),
        ),
        ...photo.cardInput,
        // The junior teams this card covers, for the per-team publishing gate (ADR-006).
        juniorTeams: [{ ageGroup: fixture.ageGroup ?? null, teamName: fixture.teamName ?? null }],
      },
      appPath: `/juniors/fixtures/${fixture.id}`,
      sourceMatchIsJunior: true,
      // No senior photo pick (no player, grade or featured player id); the junior photo
      // is handed in ready-picked.
      playerId: null,
      grade: null,
      featuredPlayerId: null,
      photo: photo.photo,
      sourceImportedAt: now,
      // Only an explicitly auto team follows the club's auto-post window (KTD14).
      autoReady: mode === "auto",
    });
    if (action === "inserted") result.drafted++;
    else if (action === "refreshed") result.refreshed++;
  }
  return result;
}
