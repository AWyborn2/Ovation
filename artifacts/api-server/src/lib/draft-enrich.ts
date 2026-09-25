import { and, desc, eq, inArray, isNull, like, notInArray, or, sql } from "drizzle-orm";
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
  type SocialDraftRow,
} from "@workspace/db";
import {
  captionAppLink,
  renderCaption,
  resolvePackIdForKind,
  truncateForPlatform,
  isFillInPlayerId,
} from "@workspace/scorecard";
import { DEFAULT_TEMPLATES } from "./social-cards-helpers";
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
): Promise<string> {
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

/** A player's newest tagged library photo, then their default headshot. */
async function playerPhoto(
  tenantId: number,
  playerId: number,
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
    .orderBy(...newestFirst())
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

/** A photo of the grade, chosen per draft by its seed (see {@link seededPick}). */
async function randomGradePhoto(
  tenantId: number,
  grade: string,
  seed: string | null,
): Promise<string | null> {
  const rows = await db
    .select({ id: clubPhotosTable.id, objectPath: clubPhotosTable.objectPath })
    .from(clubPhotosTable)
    .where(and(eq(clubPhotosTable.tenantId, tenantId), eq(clubPhotosTable.grade, grade)))
    .orderBy(...newestFirst());
  if (rows.length === 0) return null;
  return objectUrl(seededPick(rows, seed).objectPath);
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
  /** Stable per-draft seed for a random rule (the draft's source key or id). */
  seed?: string | null;
  /** The card's featured player for a "player" rule; defaults to `playerId`. */
  featuredPlayerId?: FeaturedPlayer;
};

type PhotoPick = { url: string; source: PhotoSource };

/** Apply the club's photo rule for (grade, kind); null = no rule, or it found nothing. */
async function pickByRule(tenantId: number, opts: PhotoPickOptions): Promise<PhotoPick | null> {
  if (!opts.kind || !opts.grade) return null;
  const [rule] = await db
    .select()
    .from(cardPhotoRulesTable)
    .where(
      and(
        eq(cardPhotoRulesTable.tenantId, tenantId),
        eq(cardPhotoRulesTable.grade, opts.grade),
        eq(cardPhotoRulesTable.cardKind, opts.kind),
      ),
    );
  if (!rule) return null;

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
      const photo = await playerPhoto(tenantId, featured);
      if (photo) return { url: photo.url, source: "auto:rule-player" };
    }
  }

  // "random", and a "player" rule with no photo of the player.
  const url = await randomGradePhoto(tenantId, opts.grade, opts.seed ?? null);
  return url ? { url, source: "auto:rule-random" } : null;
}

/**
 * A senior card's photo. The club's rule for (grade, card kind) comes first
 * (a fixed photo, a random grade photo, or the featured player); with no rule —
 * or a rule that finds nothing — R5's automatic order: a library photo tagged
 * with the player (newest first), the player's headshot, then a photo of the
 * grade. Junior cards never get a photo, whatever the rule says (KTD15).
 */
export async function pickDraftPhoto(
  tenantId: number,
  opts: PhotoPickOptions,
): Promise<PhotoPick | null> {
  if (opts.junior) return null;
  const ruled = await pickByRule(tenantId, opts);
  if (ruled) return ruled;

  if (opts.playerId != null) {
    const photo = await playerPhoto(tenantId, opts.playerId);
    if (photo)
      return {
        url: photo.url,
        source: photo.from === "library" ? "auto:library-player" : "auto:headshot",
      };
  }

  if (opts.grade) {
    // Prefer a team shot (no individual tags) over a player's action photo.
    const taggedIds = db
      .select({ id: clubPhotoPlayersTable.photoId })
      .from(clubPhotoPlayersTable)
      .where(eq(clubPhotoPlayersTable.tenantId, tenantId));
    const [team] = await db
      .select({ objectPath: clubPhotosTable.objectPath })
      .from(clubPhotosTable)
      .where(
        and(
          eq(clubPhotosTable.tenantId, tenantId),
          eq(clubPhotosTable.grade, opts.grade),
          notInArray(clubPhotosTable.id, taggedIds),
        ),
      )
      .orderBy(...newestFirst())
      .limit(1);
    const [gradePhoto] = team
      ? [team]
      : await db
          .select({ objectPath: clubPhotosTable.objectPath })
          .from(clubPhotosTable)
          .where(and(eq(clubPhotosTable.tenantId, tenantId), eq(clubPhotosTable.grade, opts.grade)))
          .orderBy(...newestFirst())
          .limit(1);
    if (gradePhoto) return { url: objectUrl(gradePhoto.objectPath), source: "auto:library-grade" };
  }
  return null;
}

/** What an existing draft's photo pick needs, read back from the stored row. */
function draftPickOptions(tenantId: number, d: SocialDraftRow): PhotoPickOptions {
  const input = (d.cardInput ?? {}) as Record<string, unknown>;
  const kind = typeof input.kind === "string" ? input.kind : null;
  const playerId = playerIdFromAppPath(d.appPath);
  return {
    playerId,
    grade: draftPhotoGrade(input),
    junior: d.sourceMatchIsJunior || input.junior === true,
    kind,
    // Drafts are created with their source key as the seed (enrichDraft).
    seed: d.sourceKey ?? `draft:${d.id}`,
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
    const photo = await pickDraftPhoto(tenantId, draftPickOptions(tenantId, d));
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
 * A card photo rule changed (saved or removed): re-pick the photo of every open
 * senior draft of that grade and card kind whose photo was picked
 * automatically. A photo an admin chose ("manual") or cleared ("none") is
 * never replaced (KTD6). Returns how many drafts changed.
 */
export async function repickRuleDraftPhotos(
  tenantId: number,
  grade: string,
  kinds: readonly string[],
): Promise<number> {
  if (kinds.length === 0) return 0;
  const open = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        eq(socialDraftsTable.sourceMatchIsJunior, false),
        inArray(socialDraftsTable.status, OPEN_STATUSES),
        inArray(sql<string>`${socialDraftsTable.cardInput}->>'kind'`, [...kinds]),
        autoPhotoSql(),
      ),
    );
  let changed = 0;
  for (const d of open) {
    const opts = draftPickOptions(tenantId, d);
    if (opts.junior || opts.grade !== grade) continue;
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

export async function enrichDraft(input: EnrichInput): Promise<DraftEnrichment> {
  const kind = typeof input.cardInput.kind === "string" ? input.cardInput.kind : "";
  const junior = input.junior === true || input.cardInput.junior === true;
  const grade = input.grade ?? draftPhotoGrade(input.cardInput);
  const playerId = input.playerId ?? playerIdFromAppPath(input.appPath);
  const [packId, caption, photo] = await Promise.all([
    resolveDraftPack(input.tenantId, kind),
    renderDraftCaption(input.tenantId, input.engine, input.cardInput, input.appPath),
    pickDraftPhoto(input.tenantId, {
      playerId,
      grade,
      junior,
      kind,
      seed: input.seed ?? null,
      featuredPlayerId: input.featuredPlayerId !== undefined ? input.featuredPlayerId : playerId,
    }),
  ]);
  return {
    packId,
    caption,
    photoUrl: photo?.url ?? null,
    photoSource: photo?.source ?? null,
  };
}
