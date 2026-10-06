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
  type PhotoType,
} from "@workspace/scorecard";
import { DEFAULT_TEMPLATES, ROUND_SET_CAPTIONS } from "./social-cards-helpers";
import { objectUrl } from "./photo-store";

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
  /** A junior card never gets a photo (also inferred from `cardInput.junior`). */
  junior?: boolean;
  /** Stable per-draft seed for a random photo rule (the draft's source key). */
  seed?: string | null;
  /**
   * The featured player for a "player" photo rule, when it differs from the
   * linked player (a match result features the club's top performer).
   */
  featuredPlayerId?: number | null;
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

/** The Instagram caption the composer would produce for this card. */
export async function renderDraftCaption(
  tenantId: number,
  engine: string,
  cardInput: Record<string, unknown>,
  appPath: string,
  /** The draft's source key; picks a whole-round draft's caption variation. */
  seed: string | null = null,
): Promise<string> {
  const variations = ROUND_SET_CAPTIONS[engine];
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
          eq(captionTemplatesTable.platform, "instagram"),
        ),
      ),
  ]);
  const template =
    tpl?.template ??
    DEFAULT_TEMPLATES.find((t) => t.engine === captionEngine && t.platform === "instagram")
      ?.template ??
    "";
  return renderWithSettings(template, cardInput, appPath, settings ?? null);
}

function renderWithSettings(
  template: string,
  cardInput: Record<string, unknown>,
  appPath: string,
  settings: { clubUrl: string | null; clubHashtag: string | null } | null,
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
  return truncateForPlatform(raw, "instagram");
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

/** The type preference, then the format preference (when any), then newest first. */
const preferredThenNewest = (types: readonly PhotoType[], format?: MatchFormat | null) => [
  ...[typeRank(types), formatRank(format)].filter((r): r is SQL => r !== null),
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
      ),
    )
    .orderBy(...preferredThenNewest(types, format))
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
): Promise<string | null> {
  const rows = await db
    .select({
      id: clubPhotosTable.id,
      objectPath: clubPhotosTable.objectPath,
      photoTypes: clubPhotosTable.photoTypes,
      matchFormat: clubPhotosTable.matchFormat,
    })
    .from(clubPhotosTable)
    .where(and(eq(clubPhotosTable.tenantId, tenantId), eq(clubPhotosTable.grade, grade)))
    .orderBy(...newestFirst());
  if (rows.length === 0) return null;
  const ruled = ruleType ? preferredPool(rows, [ruleType]) : rows;
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
};

type PhotoPick = { url: string; source: PhotoSource };

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
      const photo = await playerPhoto(tenantId, featured, types, format);
      if (photo) return { url: photo.url, source: "auto:rule-player" };
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
  const ruled = await pickByRule(tenantId, opts);
  if (ruled) return ruled;

  const types = opts.photoTypes ?? [];
  const format = opts.matchFormat ?? null;
  if (opts.playerId != null) {
    const photo = await playerPhoto(tenantId, opts.playerId, types, format);
    if (photo)
      return {
        url: photo.url,
        source: photo.from === "library" ? "auto:library-player" : "auto:headshot",
      };
  }

  if (opts.grade) {
    // The card's preferred photo types first, then its match format; then a
    // team shot (no individual player tags) over a player's action photo; then
    // the newest.
    const playerTagged = sql`EXISTS (SELECT 1 FROM ${clubPhotoPlayersTable} WHERE ${clubPhotoPlayersTable.photoId} = ${clubPhotosTable.id} AND ${clubPhotoPlayersTable.tenantId} = ${tenantId})`;
    const ranks = [typeRank(types), formatRank(format)].filter((r): r is SQL => r !== null);
    const [gradePhoto] = await db
      .select({ objectPath: clubPhotosTable.objectPath })
      .from(clubPhotosTable)
      .where(and(eq(clubPhotosTable.tenantId, tenantId), eq(clubPhotosTable.grade, opts.grade)))
      .orderBy(...ranks, playerTagged, ...newestFirst())
      .limit(1);
    if (gradePhoto) return { url: objectUrl(gradePhoto.objectPath), source: "auto:library-grade" };
  }
  return null;
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
    featuredPlayerId:
      kind === "matchSummary"
        ? async () => {
            const { matchDraftFeaturedPlayer } = await import("./draft-featured-player");
            return matchDraftFeaturedPlayer(tenantId, d);
          }
        : playerId,
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
      .set({ photoUrl: photo.url, photoSource: photo.source })
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
    const next = { photoUrl: photo?.url ?? null, photoSource: photo?.source ?? null };
    if (next.photoUrl === d.photoUrl && next.photoSource === d.photoSource) continue;
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
    pickDraftPhoto(input.tenantId, {
      playerId,
      grade,
      junior,
      kind,
      ruleKinds: photoRuleKinds(input.cardInput),
      seed: input.seed ?? null,
      featuredPlayerId: input.featuredPlayerId !== undefined ? input.featuredPlayerId : playerId,
      photoTypes: preferredPhotoTypes(input.cardInput),
      matchFormat: preferredMatchFormat(input.cardInput),
    }),
  ]);
  return {
    packId,
    caption,
    photoUrl: photo?.url ?? null,
    photoSource: photo?.source ?? null,
  };
}
