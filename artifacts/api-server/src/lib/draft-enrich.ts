import { and, desc, eq, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  socialDraftsTable,
  cardTemplatesTable,
  captionTemplatesTable,
  socialSettingsTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
  playerImagesTable,
  cardPhotoRulesTable,
  teamListsTable,
  type SocialDraftRow,
} from "@workspace/db";
import {
  captionAppLink,
  renderCaption,
  resolvePackIdForKind,
  truncateForPlatform,
  isFillInPlayerId,
  isPhotoType,
  preferredMatchFormat,
  preferredPhotoTypes,
  type MatchFormat,
  FOCUS_TIGHT_KEEP,
  frameShapeOf,
  type PhotoFocus,
  type PhotoType,
} from "@workspace/scorecard";
import { DEFAULT_TEMPLATES, CAPTION_VARIATIONS } from "./social-cards-helpers";
import { objectUrl } from "./photo-store";
import { draftPhotoFocus } from "./photo-focus-snapshot";
import { draftFrameAspect } from "./photo-frame-aspect";

/**
 * What every auto-draft carries from the moment it is created (Social Studio
 * KTD6/KTD8, R4/R5): the club's default pack for the card type, a caption
 * from the club's template, and — for senior cards — a photo.
 */
export type DraftEnrichment = {
  packId: string | null;
  caption: string;
  photoUrl: string | null;
  photoSource: PhotoSource | null;
  /** The photo's focus snapshot (photo focus areas); null = centred crop. */
  photoFocus: PhotoFocus | null;
};

/**
 * How a draft's photo was chosen. `auto:*` picks (including the club's card
 * photo rules, `auto:rule-*`) are re-run when a correction refreshes the draft
 * or a rule changes; a photo an admin chose is never replaced (KTD6).
 */
export type PhotoSource =
  | "auto:library-player"
  | "auto:headshot"
  | "auto:library-grade"
  | "auto:rule-fixed"
  | "auto:rule-random"
  | "auto:rule-player"
  /** A junior player's own uploaded photo, picked by the junior engines (ADR-007). */
  | "auto:junior-photo"
  | "manual";

export type EnrichInput = {
  tenantId: number;
  engine: string;
  cardInput: Record<string, unknown>;
  appPath: string;
  /** The player the card celebrates, when there is one. */
  playerId?: number | null;
  /** The grade for a team/grade photo; defaults to the card input's grade. */
  grade?: string | null;
  /**
   * A junior card never gets a photo from the senior library or rules (also inferred
   * from `cardInput.junior`); its engine may hand one in through `photo` (ADR-007).
   */
  junior?: boolean;
  /**
   * A photo the engine already picked (a junior player's own photo). Used as is,
   * instead of the automatic pick; `null` means the engine picked none.
   */
  photo?: { url: string; source: PhotoSource } | null;
  /** Stable per-draft seed for a random photo rule (the draft's source key). */
  seed?: string | null;
  /**
   * The featured player for a "player" photo rule, when it differs from the
   * linked player (a match result features the club's top performer).
   */
  featuredPlayerId?: number | null;
  /**
   * The players a Team List or match result photo may show: the selected side,
   * or the club's players in the game ranked by performance (see
   * {@link PHOTO_POLICY}).
   */
  candidatePlayerIds?: CandidatePlayers;
};

/** Draft engines → the caption template family they use. */
const CAPTION_ENGINE: Record<string, string> = {
  milestone: "milestone",
  roundup: "roundup",
  recap: "recap",
};

export function isAutoPhoto(source: string | null | undefined): boolean {
  return source == null || source.startsWith("auto:");
}

/** The pack the club has set as default for this card type (null = the renderer's default). */
export async function resolveDraftPack(tenantId: number, kind: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(cardTemplatesTable)
    .where(and(eq(cardTemplatesTable.tenantId, tenantId), eq(cardTemplatesTable.source, "pack")));
  return resolvePackIdForKind(rows, kind);
}

/**
 * The caption the composer would produce for this card: Instagram's by
 * default (what a draft stores), or another platform's template when
 * publishing there (Meta publishing KTD9).
 */
export async function renderDraftCaption(
  tenantId: number,
  engine: string,
  cardInput: Record<string, unknown>,
  appPath: string,
  /** The draft's source key; picks a whole-round draft's caption variation. */
  seed: string | null = null,
  platform: "instagram" | "facebook" = "instagram",
): Promise<string> {
  const variations = CAPTION_VARIATIONS[engine];
  if (variations && variations.length > 0) {
    const [settings] = await db
      .select()
      .from(socialSettingsTable)
      .where(eq(socialSettingsTable.tenantId, tenantId));
    return renderWithSettings(
      pickCaptionVariation(variations, seed),
      cardInput,
      appPath,
      settings ?? null,
      platform,
    );
  }
  const captionEngine = CAPTION_ENGINE[engine] ?? "ondemand";
  const [[settings], [tpl]] = await Promise.all([
    db.select().from(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId)),
    db
      .select()
      .from(captionTemplatesTable)
      .where(
        and(
          eq(captionTemplatesTable.tenantId, tenantId),
          eq(captionTemplatesTable.engine, captionEngine),
          eq(captionTemplatesTable.platform, platform),
        ),
      ),
  ]);
  const template =
    tpl?.template ??
    DEFAULT_TEMPLATES.find((t) => t.engine === captionEngine && t.platform === platform)
      ?.template ??
    "";
  return renderWithSettings(template, cardInput, appPath, settings ?? null, platform);
}

function renderWithSettings(
  template: string,
  cardInput: Record<string, unknown>,
  appPath: string,
  settings: { clubUrl: string | null; clubHashtag: string | null } | null,
  platform: "instagram" | "facebook",
): string {
  const clubUrl = settings?.clubUrl ?? "";
  const hashtag = settings?.clubHashtag ?? "";
  const kind = typeof cardInput.kind === "string" ? cardInput.kind : "";
  const raw = renderCaption(
    template,
    { ...cardInput, kind },
    {
      clubUrl,
      hashtag,
      appLink: captionAppLink(clubUrl, appPath),
    },
  );
  return truncateForPlatform(raw, platform);
}

/**
 * One of a whole-round draft's caption variations for its seed: the same round
 * always reads the same, consecutive rounds spread across the variations. With
 * no seed, the first.
 */
export function pickCaptionVariation(variations: readonly string[], seed: string | null): string {
  if (!seed) return variations[0] ?? "";
  return variations[hash32(seed) % variations.length] ?? "";
}

/** `/players/42` → 42: most player cards link to the player's page. */
function playerIdFromAppPath(appPath: string): number | null {
  const m = /^\/players\/(\d+)(?:[/?#]|$)/.exec(appPath);
  return m ? Number(m[1]) : null;
}

/**
 * The grade a draft's photo is picked for: the card input's `grade`, or — for a
 * match result, whose input has none — the grade that leads its match title
 * ("A Grade • Round 3", see `matchToSummaryInput`).
 */
export function draftPhotoGrade(cardInput: Record<string, unknown>): string | null {
  if (typeof cardInput.grade === "string" && cardInput.grade) return cardInput.grade;
  if (cardInput.kind === "matchSummary" && typeof cardInput.matchTitle === "string") {
    const grade = cardInput.matchTitle.split(" • ")[0]?.trim();
    return grade || null;
  }
  return null;
}

/** The newest-first order every photo pick breaks ties with. */
const newestFirst = () => [
  desc(sql`coalesce(${clubPhotosTable.takenAt}, ${clubPhotosTable.createdAt})`),
  desc(clubPhotosTable.id),
];

/**
 * Rank a photo by the card's preferred photo types: 0 for a photo with the
 * first type, 1 for the second, …, and `types.length` for a photo with none of
 * them. Null when the card has no preference (every photo ranks the same).
 */
function typeRank(types: readonly PhotoType[]): SQL | null {
  if (types.length === 0) return null;
  const cases = types.map(
    (t, i) => sql`WHEN ${t} = ANY(${clubPhotosTable.photoTypes}) THEN ${sql.raw(String(i))}`,
  );
  return sql`CASE ${sql.join(cases, sql` `)} ELSE ${sql.raw(String(types.length))} END`;
}

/**
 * 0 for a photo of the card's match format, 1 otherwise; null when the card
 * has no format preference.
 */
function formatRank(format: MatchFormat | null | undefined): SQL | null {
  if (!format) return null;
  return sql`CASE WHEN ${clubPhotosTable.matchFormat} = ${format} THEN 0 ELSE 1 END`;
}

/**
 * Rank a photo by how its focus box fits the card's photo frame (photo focus
 * areas), as `focusFit` does: 0 fits (or has no box: a centred crop, as
 * before), 1 a tight fit, 2 no fit. (A shape switched off for the photo is
 * left out altogether, by {@link shapeAllowed}.) `area` is a tagged player's
 * area, which wins over the photo's box. Only reorders: a photo that doesn't
 * fit is still picked when nothing else is there. Null when the frame's shape
 * isn't known.
 */
function fitRank(frameAspect: number | null | undefined, area?: SQL): SQL | null {
  if (!frameAspect || !(frameAspect > 0)) return null;
  const box = area
    ? sql`COALESCE(${area}, ${clubPhotosTable.focusBox})`
    : sql`${clubPhotosTable.focusBox}`;
  const aspect = sql.raw(String(frameAspect));
  const photo = sql`(${clubPhotosTable.width}::float8 / NULLIF(${clubPhotosTable.height}, 0))`;
  // The share of the photo a covering frame shows across and down.
  const vx = sql`(CASE WHEN ${photo} > ${aspect} THEN ${aspect} / ${photo} ELSE 1 END)`;
  const vy = sql`(CASE WHEN ${photo} > ${aspect} THEN 1 ELSE ${photo} / ${aspect} END)`;
  const kept = sql`LEAST(1, ${vx} / NULLIF((${box}->>'w')::float8, 0), ${vy} / NULLIF((${box}->>'h')::float8, 0))`;
  return sql`CASE WHEN ${box} IS NULL THEN 0 WHEN ${kept} >= 0.999 THEN 0 WHEN ${kept} >= ${sql.raw(String(FOCUS_TIGHT_KEEP))} THEN 1 ELSE 2 END`;
}

/**
 * Leaves out photos the admin switched off for the card frame's shape (photo
 * focus areas): automatic posts never put a photo in a shape that's off.
 * Undefined (no condition) when the frame's shape isn't known.
 */
function shapeAllowed(frameAspect: number | null | undefined): SQL | undefined {
  if (!frameAspect || !(frameAspect > 0)) return undefined;
  return sql`NOT (${frameShapeOf(frameAspect)} = ANY(${clubPhotosTable.offShapes}))`;
}

/** The type preference, then the format preference (when any), then newest first. */
const preferredThenNewest = (
  types: readonly PhotoType[],
  format?: MatchFormat | null,
  fit?: SQL | null,
) => [
  ...[fit ?? null, typeRank(types), formatRank(format)].filter((r): r is SQL => r !== null),
  ...newestFirst(),
];

/**
 * Narrow `rows` to the photos of the most preferred type any of them has
 * (`types` in order); all of `rows` when none match or there is no preference.
 */
export function preferredPool<T extends { photoTypes: readonly string[] }>(
  rows: readonly T[],
  types: readonly PhotoType[],
): readonly T[] {
  for (const t of types) {
    const matching = rows.filter((r) => r.photoTypes.includes(t));
    if (matching.length > 0) return matching;
  }
  return rows;
}

/**
 * Narrow `rows` to the photos of the card's match format; all of `rows` when
 * none match or the card has no format preference.
 */
export function formatPool<T extends { matchFormat: string | null }>(
  rows: readonly T[],
  format: MatchFormat | null | undefined,
): readonly T[] {
  if (!format) return rows;
  const matching = rows.filter((r) => r.matchFormat === format);
  return matching.length > 0 ? matching : rows;
}

/** FNV-1a: a small, stable string hash for the per-draft random pick. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Pick one of `ids` for `seed` by rendezvous hashing: the same seed always gets
 * the same id, different seeds spread across the ids, and adding an id only
 * moves the seeds it wins. `ids` come newest first, which breaks ties; with no
 * seed, the first (newest).
 */
export function seededPick<T extends { id: number }>(rows: readonly T[], seed: string | null): T {
  let best = rows[0];
  if (!seed) return best;
  let bestScore = -1;
  for (const r of rows) {
    const score = hash32(`${seed}:${r.id}`);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

/**
 * A player's tagged library photo — of the card's preferred photo types when
 * there is one, else the newest — then their default headshot.
 */
async function playerPhoto(
  tenantId: number,
  playerId: number,
  types: readonly PhotoType[],
  format: MatchFormat | null = null,
  frameAspect: number | null = null,
): Promise<{ url: string; from: "library" | "headshot" } | null> {
  const [tagged] = await db
    .select({ objectPath: clubPhotosTable.objectPath })
    .from(clubPhotosTable)
    .innerJoin(clubPhotoPlayersTable, eq(clubPhotoPlayersTable.photoId, clubPhotosTable.id))
    .where(
      and(
        eq(clubPhotosTable.tenantId, tenantId),
        eq(clubPhotoPlayersTable.tenantId, tenantId),
        eq(clubPhotoPlayersTable.playerId, playerId),
        shapeAllowed(frameAspect),
      ),
    )
    .orderBy(
      ...preferredThenNewest(
        types,
        format,
        fitRank(frameAspect, sql`${clubPhotoPlayersTable.area}`),
      ),
    )
    .limit(1);
  if (tagged) return { url: objectUrl(tagged.objectPath), from: "library" };

  const [headshot] = await db
    .select({ imageUrl: playerImagesTable.imageUrl })
    .from(playerImagesTable)
    .where(
      and(
        eq(playerImagesTable.tenantId, tenantId),
        eq(playerImagesTable.playerId, playerId),
        eq(playerImagesTable.isDefault, true),
      ),
    )
    .limit(1);
  return headshot?.imageUrl ? { url: headshot.imageUrl, from: "headshot" } : null;
}

/**
 * The selected player a team list card features (Ash, 5 Oct 2026): one of the
 * XI, chosen per draft by its seed (rendezvous hashing, so a change to the
 * selection moves the pick only when the featured player is the one left
 * out). Players with a tagged library photo come first; with none, players
 * with a headshot. Fill-ins and unlinked names never feature. Null when no
 * selected player has a photo.
 */
export async function teamListPhotoPlayer(
  tenantId: number,
  playerIds: readonly (number | null | undefined)[],
  seed: string | null,
): Promise<number | null> {
  const ids = [
    ...new Set(
      playerIds.filter((id): id is number => id != null && id > 0 && !isFillInPlayerId(id)),
    ),
  ];
  if (ids.length === 0) return null;
  const tagged = await db
    .selectDistinct({ id: clubPhotoPlayersTable.playerId })
    .from(clubPhotoPlayersTable)
    .innerJoin(clubPhotosTable, eq(clubPhotosTable.id, clubPhotoPlayersTable.photoId))
    .where(
      and(
        eq(clubPhotoPlayersTable.tenantId, tenantId),
        eq(clubPhotosTable.tenantId, tenantId),
        inArray(clubPhotoPlayersTable.playerId, ids),
      ),
    );
  let pool = tagged.map((r) => r.id);
  if (pool.length === 0) {
    const headshots = await db
      .selectDistinct({ id: playerImagesTable.playerId })
      .from(playerImagesTable)
      .where(
        and(
          eq(playerImagesTable.tenantId, tenantId),
          inArray(playerImagesTable.playerId, ids),
          eq(playerImagesTable.isDefault, true),
        ),
      );
    pool = headshots.map((r) => r.id);
  }
  if (pool.length === 0) return null;
  // Selection order breaks ties when there is no seed.
  const rows = ids.filter((id) => pool.includes(id)).map((id) => ({ id }));
  return seededPick(rows, seed).id;
}

/** A team list draft's featured player, read back from its fixture's XI. */
async function teamListDraftPlayer(tenantId: number, d: SocialDraftRow): Promise<number | null> {
  const fixtureId = Number(/^teamlist:(\d+)$/.exec(d.sourceKey ?? "")?.[1]);
  if (!Number.isInteger(fixtureId)) return null;
  const [row] = await db
    .select({ players: teamListsTable.players })
    .from(teamListsTable)
    .where(and(eq(teamListsTable.tenantId, tenantId), eq(teamListsTable.fixtureId, fixtureId)));
  if (!row) return null;
  return teamListPhotoPlayer(
    tenantId,
    row.players.map((p) => p.playerId),
    d.sourceKey,
  );
}

/**
 * A photo of the grade, chosen per draft by its seed (see {@link seededPick}).
 * A rule's `ruleType` narrows the pool to photos with that type tag (the whole
 * grade when none have it); within the pool, photos of the card's preferred
 * types come first (see {@link preferredPool}), then those of its match format.
 */
async function randomGradePhoto(
  tenantId: number,
  grade: string,
  seed: string | null,
  ruleType: PhotoType | null,
  types: readonly PhotoType[],
  format: MatchFormat | null,
  frameAspect: number | null = null,
): Promise<string | null> {
  const fit = fitRank(frameAspect);
  const rows = await db
    .select({
      id: clubPhotosTable.id,
      objectPath: clubPhotosTable.objectPath,
      photoTypes: clubPhotosTable.photoTypes,
      matchFormat: clubPhotosTable.matchFormat,
      fit: fit ?? sql<number>`0`,
    })
    .from(clubPhotosTable)
    .where(
      and(
        eq(clubPhotosTable.tenantId, tenantId),
        eq(clubPhotosTable.grade, grade),
        shapeAllowed(frameAspect),
      ),
    )
    .orderBy(...newestFirst());
  if (rows.length === 0) return null;
  // The photos that fit the card's frame best, then the rule's own narrowing.
  const bestFit = Math.min(...rows.map((r) => Number(r.fit)));
  const fitting = rows.filter((r) => Number(r.fit) === bestFit);
  const ruled = ruleType ? preferredPool(fitting, [ruleType]) : fitting;
  return objectUrl(seededPick(formatPool(preferredPool(ruled, types), format), seed).objectPath);
}

/**
 * The featured player for a "player" rule: an id, or a lazy lookup (a match
 * result's top performer is only worth loading when a rule asks for it).
 */
export type FeaturedPlayer = number | null | (() => Promise<number | null>);

export type PhotoPickOptions = {
  /** The player the card links to (drives the automatic order). */
  playerId: number | null;
  grade: string | null;
  junior: boolean;
  /** The card kind, to look up the club's photo rule for (grade, kind). */
  kind?: string | null;
  /**
   * The rule kinds to try, in order, in place of `kind` alone — a Grand Final
   * win tries the grade's premiership rule before its match result rule (see
   * {@link photoRuleKinds}). Omitted = `[kind]`.
   */
  ruleKinds?: readonly string[];
  /** Stable per-draft seed for a random rule (the draft's source key or id). */
  seed?: string | null;
  /** The card's featured player for a "player" rule; defaults to `playerId`. */
  featuredPlayerId?: FeaturedPlayer;
  /**
   * The photo types the card prefers, most preferred first (see
   * `preferredPhotoTypes`); empty or omitted = no preference.
   */
  photoTypes?: readonly PhotoType[];
  /**
   * The match format the card prefers (see `preferredMatchFormat`), ranked
   * after the photo types; null or omitted = no preference.
   */
  matchFormat?: MatchFormat | null;
  /** The players a `side` / `game` policy kind may show (see {@link PHOTO_POLICY}). */
  candidatePlayerIds?: CandidatePlayers;
  /**
   * The shape (width / height) of the frame the card draws its photo in, or a
   * lazy lookup (photo focus areas). Photos whose focus box fits it come
   * first; null or omitted = shape doesn't matter.
   */
  frameAspect?: number | null | (() => Promise<number | null>);
};

/** The frame shape a pick ranks by, once resolved at the top of {@link pickDraftPhoto}. */
const aspectOf = (opts: PhotoPickOptions): number | null =>
  typeof opts.frameAspect === "number" ? opts.frameAspect : null;

/**
 * Candidate players for a photo, in order (a match result's are ranked best
 * performer first), or a lazy lookup, since a draft re-pick reloads them.
 */
export type CandidatePlayers = readonly number[] | (() => Promise<readonly number[]>);

/**
 * How a card kind's photo is picked (social-photo-tag-selection, Ash 19–20 Oct
 * 2026). These kinds never fall back to a photo of someone who isn't in the
 * side or game, or to another grade: with no match the draft has no photo and
 * an admin picks one. Only a `fixed` card photo rule applies to them.
 *
 *   - `side`: a tagged photo (then headshot) of a selected player, rotating
 *     towards the players and photos used least on recent Team List posts.
 *   - `game`: a tagged photo (then headshot) of a club player in the game,
 *     best performer first.
 *   - `gradeTeam`: the grade's team, then celebrating, photos.
 *
 * Kinds not listed keep the legacy order (rules, player, grade photo).
 */
export const PHOTO_POLICY: Readonly<Record<string, "side" | "game" | "gradeTeam">> = {
  teamList: "side",
  matchSummary: "game",
  matchDay: "gradeTeam",
};

/** How far back Team List rotation looks at the photos used on posts. */
export const ROTATION_WINDOW_DAYS = 28;

/**
 * A picked photo. `playerId` is the player it was picked for (a tagged library
 * photo of them), so the draft crops to their area on a group photo.
 */
type PhotoPick = { url: string; source: PhotoSource; playerId?: number };

/** The draft columns for a picked photo (or none), focus snapshot included. */
async function photoColumns(
  tenantId: number,
  photo: { url: string; source: PhotoSource; playerId?: number } | null,
): Promise<{
  photoUrl: string | null;
  photoSource: PhotoSource | null;
  photoFocus: PhotoFocus | null;
}> {
  return {
    photoUrl: photo?.url ?? null,
    photoSource: photo?.source ?? null,
    photoFocus: photo ? await draftPhotoFocus(tenantId, photo.url, photo.playerId ?? null) : null,
  };
}

/** A match title stage that is a grand final ("A Grade • Grand Final"). */
const GRAND_FINAL = /\bgrand[\s-]*final\b|\bGF\b/i;

/**
 * Whether a match result card is the club's Grand Final win — the card then
 * takes the grade's premiership photo rule in preference to its match result
 * rule.
 */
export function isGrandFinalWin(cardInput: Record<string, unknown>): boolean {
  return (
    cardInput.kind === "matchSummary" &&
    cardInput.resultWinner === "club" &&
    typeof cardInput.matchTitle === "string" &&
    GRAND_FINAL.test(cardInput.matchTitle)
  );
}

/** The photo rule kinds a card tries, most preferred first. */
export function photoRuleKinds(cardInput: Record<string, unknown>): string[] {
  const kind = typeof cardInput.kind === "string" ? cardInput.kind : "";
  if (!kind) return [];
  return isGrandFinalWin(cardInput) ? ["premiership", kind] : [kind];
}

/**
 * Apply the club's photo rules for the card's grade, trying each rule kind in
 * order (`ruleKinds`, else `kind`); null = no rule, or none found a photo.
 */
async function pickByRule(tenantId: number, opts: PhotoPickOptions): Promise<PhotoPick | null> {
  const kinds = opts.ruleKinds ?? (opts.kind ? [opts.kind] : []);
  for (const kind of kinds) {
    const pick = await pickByRuleKind(tenantId, opts, kind);
    if (pick) return pick;
  }
  return null;
}

async function pickByRuleKind(
  tenantId: number,
  opts: PhotoPickOptions,
  kind: string,
): Promise<PhotoPick | null> {
  if (!opts.grade) return null;
  const [rule] = await db
    .select()
    .from(cardPhotoRulesTable)
    .where(
      and(
        eq(cardPhotoRulesTable.tenantId, tenantId),
        eq(cardPhotoRulesTable.grade, opts.grade),
        eq(cardPhotoRulesTable.cardKind, kind),
      ),
    );
  if (!rule) return null;
  // `random` and `player` rules are retired for the policy kinds.
  if (PHOTO_POLICY[kind] && rule.mode !== "fixed") return null;
  const types = opts.photoTypes ?? [];
  const format = opts.matchFormat ?? null;
  const ruleType = isPhotoType(rule.photoType) ? rule.photoType : null;

  if (rule.mode === "fixed") {
    // The photo was removed from the library: back to the automatic order.
    if (rule.photoId == null) return null;
    const [photo] = await db
      .select({ objectPath: clubPhotosTable.objectPath })
      .from(clubPhotosTable)
      .where(and(eq(clubPhotosTable.id, rule.photoId), eq(clubPhotosTable.tenantId, tenantId)));
    return photo ? { url: objectUrl(photo.objectPath), source: "auto:rule-fixed" } : null;
  }

  if (rule.mode === "player") {
    const featured =
      typeof opts.featuredPlayerId === "function"
        ? await opts.featuredPlayerId()
        : opts.featuredPlayerId !== undefined
          ? opts.featuredPlayerId
          : opts.playerId;
    if (featured != null && featured > 0 && !isFillInPlayerId(featured)) {
      const photo = await playerPhoto(tenantId, featured, types, format, aspectOf(opts));
      if (photo)
        return {
          url: photo.url,
          source: "auto:rule-player",
          ...(photo.from === "library" ? { playerId: featured } : {}),
        };
    }
  }

  // "random", and a "player" rule with no photo of the player.
  const url = await randomGradePhoto(
    tenantId,
    opts.grade,
    opts.seed ?? null,
    ruleType,
    types,
    format,
    aspectOf(opts),
  );
  return url ? { url, source: "auto:rule-random" } : null;
}

/**
 * A senior card's photo. The club's rule for (grade, card kind) comes first
 * (a fixed photo, a random grade photo, or the featured player); with no rule —
 * or a rule that finds nothing — R5's automatic order: a library photo tagged
 * with the player (newest first), the player's headshot, then a photo of the
 * grade. Wherever a step chooses among several library photos, photos of the
 * card's preferred photo types (`opts.photoTypes`, in order) win, falling back
 * to any photo. Junior cards never get a photo, whatever the rule says (KTD15).
 */
export async function pickDraftPhoto(
  tenantId: number,
  opts: PhotoPickOptions,
): Promise<PhotoPick | null> {
  if (opts.junior) return null;
  // Resolved once, so every step below ranks by the same frame.
  if (typeof opts.frameAspect === "function") {
    opts = { ...opts, frameAspect: await opts.frameAspect().catch(() => null) };
  }
  const ruled = await pickByRule(tenantId, opts);
  if (ruled) return ruled;

  const policy = opts.kind ? PHOTO_POLICY[opts.kind] : undefined;
  if (policy === "gradeTeam") return gradeTeamPhoto(tenantId, opts);
  if (policy) {
    const candidates =
      typeof opts.candidatePlayerIds === "function"
        ? await opts.candidatePlayerIds()
        : (opts.candidatePlayerIds ?? []);
    return pickCandidatePhoto(tenantId, candidates, {
      order: policy === "side" ? "rotate" : "ranked",
      seed: opts.seed ?? null,
      types: opts.photoTypes ?? [],
      format: opts.matchFormat ?? null,
      frameAspect: aspectOf(opts),
    });
  }

  const types = opts.photoTypes ?? [];
  const format = opts.matchFormat ?? null;
  if (opts.playerId != null) {
    const photo = await playerPhoto(tenantId, opts.playerId, types, format, aspectOf(opts));
    if (photo)
      return photo.from === "library"
        ? { url: photo.url, source: "auto:library-player", playerId: opts.playerId }
        : { url: photo.url, source: "auto:headshot" };
  }

  if (opts.grade) {
    // The card's preferred photo types first, then its match format; then a
    // team shot (no individual player tags) over a player's action photo; then
    // the newest.
    const playerTagged = sql`EXISTS (SELECT 1 FROM ${clubPhotoPlayersTable} WHERE ${clubPhotoPlayersTable.photoId} = ${clubPhotosTable.id} AND ${clubPhotoPlayersTable.tenantId} = ${tenantId})`;
    const ranks = [fitRank(aspectOf(opts)), typeRank(types), formatRank(format)].filter(
      (r): r is SQL => r !== null,
    );
    const [gradePhoto] = await db
      .select({ objectPath: clubPhotosTable.objectPath })
      .from(clubPhotosTable)
      .where(
        and(
          eq(clubPhotosTable.tenantId, tenantId),
          eq(clubPhotosTable.grade, opts.grade),
          shapeAllowed(aspectOf(opts)),
        ),
      )
      .orderBy(...ranks, playerTagged, ...newestFirst())
      .limit(1);
    if (gradePhoto) return { url: objectUrl(gradePhoto.objectPath), source: "auto:library-grade" };
  }
  return null;
}

const TEAM_PHOTO_TYPES: readonly PhotoType[] = ["team", "celebrating"];

/** A Match Day card's photo: the grade's team, then celebrating, photos; newest first. */
async function gradeTeamPhoto(tenantId: number, opts: PhotoPickOptions): Promise<PhotoPick | null> {
  if (!opts.grade) return null;
  const [photo] = await db
    .select({ objectPath: clubPhotosTable.objectPath })
    .from(clubPhotosTable)
    .where(
      and(
        eq(clubPhotosTable.tenantId, tenantId),
        eq(clubPhotosTable.grade, opts.grade),
        sql`${clubPhotosTable.photoTypes} && ARRAY['team','celebrating']::text[]`,
        shapeAllowed(aspectOf(opts)),
      ),
    )
    .orderBy(
      ...preferredThenNewest(TEAM_PHOTO_TYPES, opts.matchFormat ?? null, fitRank(aspectOf(opts))),
    )
    .limit(1);
  return photo ? { url: objectUrl(photo.objectPath), source: "auto:library-grade" } : null;
}

/** One photo a candidate could show; a player's photos come in their preferred order. */
type CandidatePhoto = { playerId: number; id: number; url: string };

/**
 * How often each photo URL was used on the club's Team List posts in the
 * rotation window, leaving out the draft being picked for (`sourceKey`).
 * Dismissed drafts never reached anyone, so they don't count.
 */
async function recentTeamListPhotoUse(
  tenantId: number,
  sourceKey: string | null,
): Promise<Map<string, number>> {
  const since = new Date(Date.now() - ROTATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ photoUrl: socialDraftsTable.photoUrl })
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        sql`${socialDraftsTable.cardInput}->>'kind' = 'teamList'`,
        sql`${socialDraftsTable.status} <> 'dismissed'`,
        sql`${socialDraftsTable.createdAt} >= ${since}`,
        sql`${socialDraftsTable.photoUrl} IS NOT NULL`,
        ...(sourceKey ? [sql`${socialDraftsTable.sourceKey} IS DISTINCT FROM ${sourceKey}`] : []),
      ),
    );
  const use = new Map<string, number>();
  for (const r of rows) if (r.photoUrl) use.set(r.photoUrl, (use.get(r.photoUrl) ?? 0) + 1);
  return use;
}

/** The automatic photo the draft for `sourceKey` has now, so a refresh can keep it. */
async function currentAutoDraftPhoto(
  tenantId: number,
  sourceKey: string | null,
): Promise<string | null> {
  if (!sourceKey) return null;
  const [row] = await db
    .select({ photoUrl: socialDraftsTable.photoUrl, photoSource: socialDraftsTable.photoSource })
    .from(socialDraftsTable)
    .where(
      and(eq(socialDraftsTable.tenantId, tenantId), eq(socialDraftsTable.sourceKey, sourceKey)),
    )
    .orderBy(desc(socialDraftsTable.id))
    .limit(1);
  return row && isAutoPhoto(row.photoSource) ? row.photoUrl : null;
}

/**
 * Choose among candidates' photos. `ranked` takes the first candidate (in the
 * given order) with a photo. `rotate` (Team List) keeps the draft's current
 * photo while it still shows someone in the side; otherwise it takes the
 * candidates whose photos were used least on recent Team List posts, picks one
 * of them by the seed, then that player's least-used photo. Rotation only
 * reorders: an over-used photo is still picked when it is the only one.
 */
async function chooseCandidatePhoto(
  tenantId: number,
  ids: readonly number[],
  photos: readonly CandidatePhoto[],
  order: "ranked" | "rotate",
  seed: string | null,
): Promise<CandidatePhoto | null> {
  if (photos.length === 0) return null;
  const byPlayer = new Map<number, CandidatePhoto[]>();
  for (const p of photos) byPlayer.set(p.playerId, [...(byPlayer.get(p.playerId) ?? []), p]);
  const withPhotos = ids.filter((id) => byPlayer.has(id));
  if (order === "ranked") return byPlayer.get(withPhotos[0])![0];

  const current = await currentAutoDraftPhoto(tenantId, seed);
  const kept = current ? photos.find((p) => p.url === current) : undefined;
  if (kept) return kept;

  const use = await recentTeamListPhotoUse(tenantId, seed);
  const used = (p: CandidatePhoto) => use.get(p.url) ?? 0;
  const playerUse = (id: number) => byPlayer.get(id)!.reduce((n, p) => n + used(p), 0);
  const least = Math.min(...withPhotos.map(playerUse));
  const pool = withPhotos.filter((id) => playerUse(id) === least).map((id) => ({ id }));
  const own = byPlayer.get(seededPick(pool, seed).id)!;
  const fewest = Math.min(...own.map(used));
  return own.find((p) => used(p) === fewest)!;
}

/**
 * A photo of one of `candidates` (see {@link PHOTO_POLICY}): their tagged
 * library photos first (the card's preferred types and format, then newest),
 * then their default headshots. Fill-ins and unresolved ids never feature.
 * Null when no candidate has a photo; there is no fallback.
 */
export async function pickCandidatePhoto(
  tenantId: number,
  candidates: readonly (number | null | undefined)[],
  opts: {
    order: "ranked" | "rotate";
    seed: string | null;
    types: readonly PhotoType[];
    format: MatchFormat | null;
    /** The card's photo frame shape; photos that fit it come first. */
    frameAspect?: number | null;
  },
): Promise<PhotoPick | null> {
  const ids = [
    ...new Set(
      candidates.filter((id): id is number => id != null && id > 0 && !isFillInPlayerId(id)),
    ),
  ];
  if (ids.length === 0) return null;

  const tagged = await db
    .select({
      playerId: clubPhotoPlayersTable.playerId,
      id: clubPhotosTable.id,
      objectPath: clubPhotosTable.objectPath,
    })
    .from(clubPhotosTable)
    .innerJoin(clubPhotoPlayersTable, eq(clubPhotoPlayersTable.photoId, clubPhotosTable.id))
    .where(
      and(
        eq(clubPhotosTable.tenantId, tenantId),
        eq(clubPhotoPlayersTable.tenantId, tenantId),
        inArray(clubPhotoPlayersTable.playerId, ids),
        shapeAllowed(opts.frameAspect),
      ),
    )
    .orderBy(
      ...preferredThenNewest(
        opts.types,
        opts.format,
        fitRank(opts.frameAspect, sql`${clubPhotoPlayersTable.area}`),
      ),
    );
  const library = await chooseCandidatePhoto(
    tenantId,
    ids,
    tagged.map((r) => ({ playerId: r.playerId, id: r.id, url: objectUrl(r.objectPath) })),
    opts.order,
    opts.seed,
  );
  if (library)
    return { url: library.url, source: "auto:library-player", playerId: library.playerId };

  const headshots = await db
    .select({
      playerId: playerImagesTable.playerId,
      id: playerImagesTable.id,
      imageUrl: playerImagesTable.imageUrl,
    })
    .from(playerImagesTable)
    .where(
      and(
        eq(playerImagesTable.tenantId, tenantId),
        inArray(playerImagesTable.playerId, ids),
        eq(playerImagesTable.isDefault, true),
      ),
    );
  const headshot = await chooseCandidatePhoto(
    tenantId,
    ids,
    headshots.flatMap((r) =>
      r.imageUrl ? [{ playerId: r.playerId, id: r.id, url: r.imageUrl }] : [],
    ),
    opts.order,
    opts.seed,
  );
  return headshot ? { url: headshot.url, source: "auto:headshot" } : null;
}

/** A team list draft's selected players, read back from its fixture's team list. */
async function teamListDraftPlayers(tenantId: number, d: SocialDraftRow): Promise<number[]> {
  const fixtureId = Number(/^teamlist:(\d+)$/.exec(d.sourceKey ?? "")?.[1]);
  if (!Number.isInteger(fixtureId)) return [];
  const [row] = await db
    .select({ players: teamListsTable.players })
    .from(teamListsTable)
    .where(and(eq(teamListsTable.tenantId, tenantId), eq(teamListsTable.fixtureId, fixtureId)));
  return (row?.players ?? []).flatMap((p) => (p.playerId != null ? [p.playerId] : []));
}

/** What an existing draft's photo pick needs, read back from the stored row. */
async function draftPickOptions(tenantId: number, d: SocialDraftRow): Promise<PhotoPickOptions> {
  const input = (d.cardInput ?? {}) as Record<string, unknown>;
  const kind = typeof input.kind === "string" ? input.kind : null;
  const playerId =
    kind === "teamList" ? await teamListDraftPlayer(tenantId, d) : playerIdFromAppPath(d.appPath);
  return {
    playerId,
    grade: draftPhotoGrade(input),
    junior: d.sourceMatchIsJunior || input.junior === true,
    kind,
    ruleKinds: photoRuleKinds(input),
    // Drafts are created with their source key as the seed (enrichDraft).
    seed: d.sourceKey ?? `draft:${d.id}`,
    photoTypes: preferredPhotoTypes(input),
    matchFormat: preferredMatchFormat(input),
    candidatePlayerIds:
      kind === "teamList"
        ? () => teamListDraftPlayers(tenantId, d)
        : kind === "matchSummary"
          ? async () => {
              const { matchDraftCandidatePlayers } = await import("./draft-featured-player");
              return matchDraftCandidatePlayers(tenantId, d);
            }
          : undefined,
    featuredPlayerId:
      kind === "matchSummary"
        ? async () => {
            const { matchDraftFeaturedPlayer } = await import("./draft-featured-player");
            return matchDraftFeaturedPlayer(tenantId, d);
          }
        : playerId,
    // The draft's own design when it is templated, else the club's template.
    frameAspect: () =>
      draftFrameAspect(tenantId, kind, d.templateVersion !== null ? d.adjustments : undefined),
  };
}

const OPEN_STATUSES = ["awaiting_review", "ready"];

/**
 * Give a photo to open drafts that never got one: a draft's photo is picked
 * when it is created, so drafts made before the library had a match stayed
 * empty for good. Only drafts with no photo AND no recorded choice are
 * touched; an admin's pick, or an admin clearing the photo ("none"), is
 * never overridden (KTD6). Returns how many drafts were filled.
 */
export async function fillMissingDraftPhotos(tenantId: number): Promise<number> {
  const open = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        isNull(socialDraftsTable.photoUrl),
        isNull(socialDraftsTable.photoSource),
        eq(socialDraftsTable.sourceMatchIsJunior, false),
        inArray(socialDraftsTable.status, OPEN_STATUSES),
      ),
    );
  let filled = 0;
  for (const d of open) {
    const photo = await pickDraftPhoto(tenantId, await draftPickOptions(tenantId, d));
    if (!photo) continue;
    const updated = await db
      .update(socialDraftsTable)
      .set(await photoColumns(tenantId, photo))
      .where(
        and(
          eq(socialDraftsTable.id, d.id),
          eq(socialDraftsTable.tenantId, tenantId),
          isNull(socialDraftsTable.photoUrl),
          isNull(socialDraftsTable.photoSource),
        ),
      )
      .returning({ id: socialDraftsTable.id });
    filled += updated.length;
  }
  return filled;
}

/** An automatic pick (or none recorded yet), in SQL — see {@link isAutoPhoto}. */
const autoPhotoSql = () =>
  or(isNull(socialDraftsTable.photoSource), like(socialDraftsTable.photoSource, "auto:%"));

/**
 * At most this many open drafts are re-picked when a photo's type tags change
 * (newest first); older drafts keep their photo until something else refreshes
 * them.
 */
export const REPICK_LIMIT = 200;

/**
 * Re-pick the photo of open senior drafts whose photo was picked automatically
 * — all of the club's, or only those of one grade and card kinds. A photo an
 * admin chose ("manual") or cleared ("none") is never replaced (KTD6). Returns
 * how many drafts changed.
 */
async function repickAutoDraftPhotos(
  tenantId: number,
  scope: { grade: string; kinds: readonly string[] } | null,
  limit?: number,
): Promise<number> {
  const conditions = [
    eq(socialDraftsTable.tenantId, tenantId),
    eq(socialDraftsTable.sourceMatchIsJunior, false),
    inArray(socialDraftsTable.status, OPEN_STATUSES),
    autoPhotoSql(),
  ];
  if (scope) {
    conditions.push(
      inArray(sql<string>`${socialDraftsTable.cardInput}->>'kind'`, [...scope.kinds]),
    );
  }
  const query = db
    .select()
    .from(socialDraftsTable)
    .where(and(...conditions))
    .orderBy(desc(socialDraftsTable.id));
  const open = limit != null ? await query.limit(limit) : await query;
  let changed = 0;
  for (const d of open) {
    const opts = await draftPickOptions(tenantId, d);
    if (opts.junior || (scope && opts.grade !== scope.grade)) continue;
    const photo = await pickDraftPhoto(tenantId, opts);
    const next = await photoColumns(tenantId, photo);
    if (
      next.photoUrl === d.photoUrl &&
      next.photoSource === d.photoSource &&
      JSON.stringify(next.photoFocus) === JSON.stringify(d.photoFocus ?? null)
    )
      continue;
    const updated = await db
      .update(socialDraftsTable)
      .set(next)
      .where(
        and(
          eq(socialDraftsTable.id, d.id),
          eq(socialDraftsTable.tenantId, tenantId),
          autoPhotoSql(),
        ),
      )
      .returning({ id: socialDraftsTable.id });
    changed += updated.length;
  }
  return changed;
}

/**
 * A card photo rule changed (saved or removed): re-pick the photo of every open
 * senior draft of that grade and card kind whose photo was picked
 * automatically.
 */
export async function repickRuleDraftPhotos(
  tenantId: number,
  grade: string,
  kinds: readonly string[],
): Promise<number> {
  if (kinds.length === 0) return 0;
  // A Grand Final win's match result card takes the premiership rule first,
  // so a premiership rule change re-picks match result drafts too.
  const scoped = kinds.includes("premiership") ? [...new Set([...kinds, "matchSummary"])] : kinds;
  return repickAutoDraftPhotos(tenantId, { grade, kinds: scoped });
}

/**
 * A library photo's type tags changed: re-pick the club's newest open drafts
 * whose photo was picked automatically (at most {@link REPICK_LIMIT}), so a
 * newly tagged batting milestone photo reaches the open century drafts.
 */
export async function repickTypedDraftPhotos(tenantId: number): Promise<number> {
  return repickAutoDraftPhotos(tenantId, null, REPICK_LIMIT);
}

export async function enrichDraft(input: EnrichInput): Promise<DraftEnrichment> {
  const kind = typeof input.cardInput.kind === "string" ? input.cardInput.kind : "";
  const junior = input.junior === true || input.cardInput.junior === true;
  const grade = input.grade ?? draftPhotoGrade(input.cardInput);
  const playerId = input.playerId ?? playerIdFromAppPath(input.appPath);
  const [packId, caption, photo] = await Promise.all([
    resolveDraftPack(input.tenantId, kind),
    renderDraftCaption(
      input.tenantId,
      input.engine,
      input.cardInput,
      input.appPath,
      input.seed ?? null,
    ),
    input.photo !== undefined
      ? Promise.resolve(input.photo)
      : pickDraftPhoto(input.tenantId, {
          playerId,
          grade,
          junior,
          kind,
          ruleKinds: photoRuleKinds(input.cardInput),
          seed: input.seed ?? null,
          featuredPlayerId:
            input.featuredPlayerId !== undefined ? input.featuredPlayerId : playerId,
          candidatePlayerIds: input.candidatePlayerIds,
          photoTypes: preferredPhotoTypes(input.cardInput),
          matchFormat: preferredMatchFormat(input.cardInput),
          frameAspect: () => draftFrameAspect(input.tenantId, kind),
        }),
  ]);
  return { packId, caption, ...(await photoColumns(input.tenantId, photo)) };
}
