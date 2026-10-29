import { and, eq } from "drizzle-orm";
import {
  db,
  juniorFixturesTable,
  juniorTeamListsTable,
  type JuniorFixtureRow,
} from "@workspace/db";
import { teamListDraftInput } from "@workspace/scorecard/card-content";
import { buildJuniorTeamListContent, juniorShirtNumberReader } from "./card-content/team-list";
import { contentVisibleFields } from "./card-content/visible-fields";
import { loadJuniorNaming } from "./junior-helpers";
import { juniorPhotoFields, juniorPhotoLoader, pickJuniorCardPhoto } from "./junior-photos";
import { juniorTeamListKey } from "./junior-publishing";
import type { PhotoPick } from "./draft-enrich";

/**
 * Junior cards made by hand in New Studio's Create (studio-create-consolidation S3).
 * Juniors isolation: everything here reads `junior_fixtures` / `junior_team_lists` and
 * the junior photo library only, through the same builders the junior sweep uses.
 */

/** Where a junior team's names came from, as the Create flow badges it. */
export type JuniorListSource = "selection" | "admin" | "playhq" | "none";

/** A junior fixture's saved team list (published or not), or undefined. */
async function savedList(tenantId: number, fixtureId: number) {
  const [row] = await db
    .select({
      players: juniorTeamListsTable.players,
      isPublished: juniorTeamListsTable.isPublished,
      source: juniorTeamListsTable.source,
    })
    .from(juniorTeamListsTable)
    .where(
      and(
        eq(juniorTeamListsTable.tenantId, tenantId),
        eq(juniorTeamListsTable.juniorFixtureId, fixtureId),
      ),
    )
    .limit(1);
  return row;
}

/**
 * One junior fixture's Team List card, as the junior sweep would draft it (names in the
 * club's public style, withheld players as "Private Player", shirt numbers when on) but
 * with no photo: the photo is picked server-side when the draft is made. The input
 * carries `juniorFixtureId` so that pick can find the team.
 */
export async function juniorTeamListPrefill(
  tenantId: number,
  fixture: JuniorFixtureRow,
): Promise<{
  input: Record<string, unknown>;
  warnings: string[];
  source: JuniorListSource;
  isPublished: boolean;
}> {
  const list = await savedList(tenantId, fixture.id);
  const players = list?.players ?? [];
  const naming = await loadJuniorNaming(
    tenantId,
    players.map((p) => p.participantId),
  );
  const [contents, visible] = await Promise.all([
    buildJuniorTeamListContent(tenantId, [{ fixture, players }], {
      naming,
      numbersFor: juniorShirtNumberReader(tenantId),
    }),
    contentVisibleFields(tenantId, "teamList"),
  ]);
  const input = {
    ...teamListDraftInput(contents[0]!, visible),
    junior: true,
    juniorFixtureId: fixture.id,
  };
  const source: JuniorListSource = !list
    ? "none"
    : list.source === "playhq" || list.source === "selection"
      ? list.source
      : "admin";
  return {
    input,
    warnings: players.length ? [] : ["This team has no list yet: type the names in the editor."],
    source,
    isPublished: list?.isPublished ?? false,
  };
}

/** Consent and featured-child markers only the server may set on a junior card. */
const SERVER_ONLY_KEYS = ["juniorPhotoAllowed", "featuredParticipantId", "photoUrl"] as const;

/**
 * A hand-made junior card's input as it is stored (fail-closed photo consent):
 * - the client's consent markers and photo are dropped, so a request can never mark a
 *   photo as allowed;
 * - a Team List naming one of the club's junior fixtures (`juniorFixtureId`) gets the
 *   junior sweep's photo pick, an allowed photo of a listed player or none, and the
 *   junior team it covers (for the per-team publishing gate);
 * - any other junior card gets no photo.
 */
export async function juniorAdhocCard(
  tenantId: number,
  cardInput: Record<string, unknown>,
): Promise<{
  cardInput: Record<string, unknown>;
  photo: PhotoPick | null;
}> {
  const clean: Record<string, unknown> = { ...cardInput };
  for (const k of SERVER_ONLY_KEYS) delete clean[k];
  const fixtureId = clean.juniorFixtureId;
  if (clean.kind !== "teamList" || typeof fixtureId !== "number") {
    return { cardInput: { ...clean, photoUrl: null }, photo: null };
  }
  const [fixture] = await db
    .select()
    .from(juniorFixturesTable)
    .where(and(eq(juniorFixturesTable.id, fixtureId), eq(juniorFixturesTable.tenantId, tenantId)))
    .limit(1);
  if (!fixture) {
    // Not this club's fixture: no photo and no team.
    delete clean.juniorFixtureId;
    return { cardInput: { ...clean, photoUrl: null }, photo: null };
  }
  const players = (await savedList(tenantId, fixture.id))?.players ?? [];
  const ids = players.map((p) => p.participantId);
  const photos = await juniorPhotoLoader(tenantId, ids)("teamList");
  const picked = juniorPhotoFields(pickJuniorCardPhoto(photos, ids, juniorTeamListKey(fixture.id)));
  return {
    cardInput: {
      ...clean,
      ...picked.cardInput,
      juniorTeams: [{ ageGroup: fixture.ageGroup ?? null, teamName: fixture.teamName ?? null }],
    },
    photo: picked.photo,
  };
}
