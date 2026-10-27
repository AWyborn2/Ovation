/**
 * Photo layer sources: the photos of a draft's sourced photo layers
 * (`social_drafts.layer_photos`). A template's photo layer can name where its
 * photo comes from (`PhotoLayerSource` in `@workspace/scorecard`):
 *
 *   - a player from the card's team list — chosen per draft (`random`), by
 *     role (captain, vice-captain, keeper) or by list position — shown in their
 *     tagged library photo (the card's preferred photo types and format first,
 *     cropped to their area), then their headshot;
 *   - a random photo from one of the club's photo collections, chosen per
 *     draft by its seed.
 *
 * A layer whose source finds nothing has no entry and shows the draft's own
 * photo (the club's card photo rules, then the automatic order). Two sourced
 * layers prefer different players and photos. Junior drafts never get one:
 * junior team lists and the junior photo library are never read here, and
 * player photos are senior-only (fill-ins and unlinked names never feature).
 * Like the draft's photo these are a snapshot (KTD6), re-picked with it while
 * it is automatic; renderers show them only while the draft's photo is
 * automatic, so an admin's own choice wins on every photo layer.
 */
import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import {
  db,
  clubPhotoCollectionPhotosTable,
  clubPhotosTable,
  fixturesTable,
  socialDraftsTable,
  teamListsTable,
  type LayerPhotosColumn,
  type SocialDraftRow,
  type TeamListPlayer,
} from "@workspace/db";
import {
  isFillInPlayerId,
  isJuniorGradeLabel,
  preferredMatchFormat,
  preferredPhotoTypes,
  type MatchFormat,
  type PhotoType,
} from "@workspace/scorecard";
import {
  sourcedPhotoLayers,
  type PhotoLayerSource,
  type SourcedPhotoLayer,
} from "@workspace/scorecard/kind-templates";
import { objectUrl } from "./photo-store";
import { draftPhotoFocus } from "./photo-focus-snapshot";
import { isAutoPhoto, playerPhoto, seededPick, teamListPhotoPlayer } from "./draft-enrich";

/** What resolving a draft's layer photos needs. */
export type LayerPhotoInput = {
  tenantId: number;
  /** The draft's design (a template document, or a v1 layer overlay). */
  adjustments: unknown;
  cardInput: Record<string, unknown>;
  junior: boolean;
  /** The draft's seed (its source key): the same draft always gets the same picks. */
  seed: string | null;
  /**
   * The card's team list, or a lazy lookup. Omitted = a Team List draft's
   * fixture team list, read from its seed (`teamlist:<fixtureId>`).
   */
  teamList?: readonly TeamListPlayer[] | (() => Promise<readonly TeamListPlayer[]>);
};

/** The team list roles each role pick accepts. */
const ROLE_PICKS: Record<"captain" | "viceCaptain" | "keeper", readonly string[]> = {
  captain: ["C", "C/WK"],
  viceCaptain: ["VC", "VC/WK"],
  keeper: ["WK", "C/WK", "VC/WK"],
};

/** A team list row's linked senior player id; null for a free-typed name or a fill-in. */
const linkedId = (p: TeamListPlayer | undefined): number | null =>
  p?.playerId != null && p.playerId > 0 && !isFillInPlayerId(p.playerId) ? p.playerId : null;

/** A team list in list order. */
const inListOrder = (list: readonly TeamListPlayer[]) =>
  [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/** A Team List draft's fixture team list, from its seed; empty for any other card. */
export async function teamListForSeed(
  tenantId: number,
  seed: string | null,
): Promise<TeamListPlayer[]> {
  const fixtureId = Number(/^teamlist:(\d+)$/.exec(seed ?? "")?.[1]);
  if (!Number.isInteger(fixtureId)) return [];
  const [row] = await db
    .select({ players: teamListsTable.players, grade: fixturesTable.grade })
    .from(teamListsTable)
    .innerJoin(fixturesTable, eq(fixturesTable.id, teamListsTable.fixtureId))
    .where(and(eq(teamListsTable.tenantId, tenantId), eq(teamListsTable.fixtureId, fixtureId)));
  // The senior fixtures store only; a junior-looking grade fails closed.
  if (!row || isJuniorGradeLabel(row.grade)) return [];
  return inListOrder(row.players ?? []);
}

/**
 * The player a `player` source features, or null: the role holder, the player
 * at the position, or one chosen by the seed (players with a tagged library
 * photo first, then those with a headshot), preferring one no earlier layer
 * shows.
 */
async function sourcePlayer(
  tenantId: number,
  source: Extract<PhotoLayerSource, { kind: "player" }>,
  list: readonly TeamListPlayer[],
  seed: string,
  used: ReadonlySet<number>,
): Promise<number | null> {
  if (source.pick === "position") return linkedId(list[(source.position ?? 1) - 1]);
  if (source.pick !== "random") {
    const roles = ROLE_PICKS[source.pick];
    return linkedId(list.find((p) => p.role != null && roles.includes(p.role)));
  }
  const ids = list.flatMap((p) => {
    const id = linkedId(p);
    return id != null ? [id] : [];
  });
  const fresh = ids.filter((id) => !used.has(id));
  return (
    (fresh.length ? await teamListPhotoPlayer(tenantId, fresh, seed) : null) ??
    teamListPhotoPlayer(tenantId, ids, seed)
  );
}

/** A collection's photos, newest first; empty for another club's or a deleted collection. */
function collectionPhotos(tenantId: number, collectionId: number) {
  return db
    .select({ id: clubPhotosTable.id, objectPath: clubPhotosTable.objectPath })
    .from(clubPhotoCollectionPhotosTable)
    .innerJoin(clubPhotosTable, eq(clubPhotosTable.id, clubPhotoCollectionPhotosTable.photoId))
    .where(
      and(
        eq(clubPhotoCollectionPhotosTable.tenantId, tenantId),
        eq(clubPhotosTable.tenantId, tenantId),
        eq(clubPhotoCollectionPhotosTable.collectionId, collectionId),
      ),
    )
    .orderBy(
      desc(sql`coalesce(${clubPhotosTable.takenAt}, ${clubPhotosTable.createdAt})`),
      desc(clubPhotosTable.id),
    );
}

type ResolveContext = {
  teamList: () => Promise<readonly TeamListPlayer[]>;
  seed: string;
  types: readonly PhotoType[];
  format: MatchFormat | null;
  usedPlayers: Set<number>;
  usedPhotos: ReadonlySet<string>;
};

async function resolveOne(
  tenantId: number,
  layer: SourcedPhotoLayer,
  ctx: ResolveContext,
): Promise<LayerPhotosColumn[string] | null> {
  const { source } = layer;
  if (source.kind === "collection") {
    const rows = await collectionPhotos(tenantId, source.collectionId);
    if (rows.length === 0) return null;
    const fresh = rows.filter((r) => !ctx.usedPhotos.has(objectUrl(r.objectPath)));
    const url = objectUrl(seededPick(fresh.length ? fresh : rows, ctx.seed).objectPath);
    return { url, focus: await draftPhotoFocus(tenantId, url, null) };
  }
  const list = await ctx.teamList();
  if (list.length === 0) return null;
  const playerId = await sourcePlayer(tenantId, source, list, ctx.seed, ctx.usedPlayers);
  if (playerId == null) return null;
  const photo = await playerPhoto(tenantId, playerId, ctx.types, ctx.format);
  if (!photo) return null;
  ctx.usedPlayers.add(playerId);
  return {
    url: photo.url,
    focus: photo.from === "library" ? await draftPhotoFocus(tenantId, photo.url, playerId) : null,
  };
}

/**
 * Resolve every sourced photo layer of a draft's design. Null when the draft
 * is junior, its design has no source, or no source found a photo.
 */
export async function resolveLayerPhotos(
  input: LayerPhotoInput,
): Promise<LayerPhotosColumn | null> {
  if (input.junior || input.cardInput.junior === true) return null;
  const kind = typeof input.cardInput.kind === "string" ? input.cardInput.kind : "";
  const layers = sourcedPhotoLayers(input.adjustments, kind);
  if (layers.length === 0) return null;

  let list: readonly TeamListPlayer[] | null = null;
  const teamList = async () => {
    if (list) return list;
    const given = input.teamList;
    const raw =
      typeof given === "function"
        ? await given()
        : (given ?? (await teamListForSeed(input.tenantId, input.seed)));
    list = inListOrder(raw);
    return list;
  };

  const out: LayerPhotosColumn = {};
  const usedPlayers = new Set<number>();
  const usedPhotos = new Set<string>();
  const types = preferredPhotoTypes(input.cardInput);
  const format = preferredMatchFormat(input.cardInput);
  for (const layer of layers) {
    const photo = await resolveOne(input.tenantId, layer, {
      teamList,
      seed: `${input.seed ?? ""}:${layer.key}`,
      types,
      format,
      usedPlayers,
      usedPhotos,
    });
    if (!photo) continue;
    out[layer.key] = photo;
    usedPhotos.add(photo.url);
  }
  return Object.keys(out).length ? out : null;
}

/** A stored draft's layer photos, resolved from its own design and source key. */
export function draftLayerPhotos(
  d: Pick<
    SocialDraftRow,
    "tenantId" | "id" | "adjustments" | "cardInput" | "sourceKey" | "sourceMatchIsJunior"
  >,
): Promise<LayerPhotosColumn | null> {
  return resolveLayerPhotos({
    tenantId: d.tenantId,
    adjustments: d.adjustments,
    cardInput: (d.cardInput ?? {}) as Record<string, unknown>,
    junior: d.sourceMatchIsJunior,
    // Drafts are created with their source key as the seed (enrichDraft).
    seed: d.sourceKey ?? `draft:${d.id}`,
  });
}

const OPEN_STATUSES = ["awaiting_review", "ready"];

/** At most this many open drafts are refreshed when a collection changes (newest first). */
export const COLLECTION_REFRESH_LIMIT = 200;

/**
 * A collection's photos changed, or it was deleted: re-pick the layer photos
 * of the club's open senior drafts whose photo is automatic and whose design
 * takes a photo from that collection. Returns how many drafts changed.
 */
export async function refreshCollectionLayerPhotos(
  tenantId: number,
  collectionId: number,
): Promise<number> {
  const open = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        eq(socialDraftsTable.sourceMatchIsJunior, false),
        inArray(socialDraftsTable.status, OPEN_STATUSES),
        or(isNull(socialDraftsTable.photoSource), like(socialDraftsTable.photoSource, "auto:%")),
        // A cheap pre-filter; the design is read properly below.
        sql`${socialDraftsTable.adjustments}::text LIKE '%"collectionId"%'`,
      ),
    )
    .orderBy(desc(socialDraftsTable.id))
    .limit(COLLECTION_REFRESH_LIMIT);
  let changed = 0;
  for (const d of open) {
    const kind = (d.cardInput as { kind?: unknown } | null)?.kind;
    const uses = sourcedPhotoLayers(d.adjustments, typeof kind === "string" ? kind : "").some(
      (l) => l.source.kind === "collection" && l.source.collectionId === collectionId,
    );
    if (!uses || !isAutoPhoto(d.photoSource)) continue;
    const next = await draftLayerPhotos(d);
    if (JSON.stringify(next) === JSON.stringify(d.layerPhotos ?? null)) continue;
    await db
      .update(socialDraftsTable)
      .set({ layerPhotos: next })
      .where(and(eq(socialDraftsTable.id, d.id), eq(socialDraftsTable.tenantId, tenantId)));
    changed += 1;
  }
  return changed;
}
