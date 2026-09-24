import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import {
  db,
  cardTemplatesTable,
  captionTemplatesTable,
  socialSettingsTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
  playerImagesTable,
} from "@workspace/db";
import {
  captionAppLink,
  renderCaption,
  resolvePackIdForKind,
  truncateForPlatform,
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
 * How a draft's photo was chosen. `auto:*` picks are re-run when a correction
 * refreshes the draft; a photo an admin chose is never replaced (KTD6).
 */
export type PhotoSource = "auto:library-player" | "auto:headshot" | "auto:library-grade" | "manual";

export type EnrichInput = {
  tenantId: number;
  engine: string;
  cardInput: Record<string, unknown>;
  appPath: string;
  /** The player the card celebrates, when there is one. */
  playerId?: number | null;
  /** The grade for a team/grade photo; defaults to the card input's `grade`. */
  grade?: string | null;
  /** A junior card never gets a photo (also inferred from `cardInput.junior`). */
  junior?: boolean;
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
 * R5's photo order for a senior card: a library photo tagged with the player
 * (newest first), the player's headshot, then a photo of the grade. Junior
 * cards never get a photo (KTD15).
 */
export async function pickDraftPhoto(
  tenantId: number,
  opts: { playerId: number | null; grade: string | null; junior: boolean },
): Promise<{ url: string; source: PhotoSource } | null> {
  if (opts.junior) return null;
  const newest = [
    desc(sql`coalesce(${clubPhotosTable.takenAt}, ${clubPhotosTable.createdAt})`),
    desc(clubPhotosTable.id),
  ];

  if (opts.playerId != null) {
    const [tagged] = await db
      .select({ objectPath: clubPhotosTable.objectPath })
      .from(clubPhotosTable)
      .innerJoin(clubPhotoPlayersTable, eq(clubPhotoPlayersTable.photoId, clubPhotosTable.id))
      .where(
        and(
          eq(clubPhotosTable.tenantId, tenantId),
          eq(clubPhotoPlayersTable.tenantId, tenantId),
          eq(clubPhotoPlayersTable.playerId, opts.playerId),
        ),
      )
      .orderBy(...newest)
      .limit(1);
    if (tagged) return { url: objectUrl(tagged.objectPath), source: "auto:library-player" };

    const [headshot] = await db
      .select({ imageUrl: playerImagesTable.imageUrl })
      .from(playerImagesTable)
      .where(
        and(
          eq(playerImagesTable.tenantId, tenantId),
          eq(playerImagesTable.playerId, opts.playerId),
          eq(playerImagesTable.isDefault, true),
        ),
      )
      .limit(1);
    if (headshot?.imageUrl) return { url: headshot.imageUrl, source: "auto:headshot" };
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
      .orderBy(...newest)
      .limit(1);
    const [gradePhoto] = team
      ? [team]
      : await db
          .select({ objectPath: clubPhotosTable.objectPath })
          .from(clubPhotosTable)
          .where(and(eq(clubPhotosTable.tenantId, tenantId), eq(clubPhotosTable.grade, opts.grade)))
          .orderBy(...newest)
          .limit(1);
    if (gradePhoto) return { url: objectUrl(gradePhoto.objectPath), source: "auto:library-grade" };
  }
  return null;
}

export async function enrichDraft(input: EnrichInput): Promise<DraftEnrichment> {
  const kind = typeof input.cardInput.kind === "string" ? input.cardInput.kind : "";
  const junior = input.junior === true || input.cardInput.junior === true;
  const grade =
    input.grade ?? (typeof input.cardInput.grade === "string" ? input.cardInput.grade : null);
  const playerId = input.playerId ?? playerIdFromAppPath(input.appPath);
  const [packId, caption, photo] = await Promise.all([
    resolveDraftPack(input.tenantId, kind),
    renderDraftCaption(input.tenantId, input.engine, input.cardInput, input.appPath),
    pickDraftPhoto(input.tenantId, { playerId, grade, junior }),
  ]);
  return {
    packId,
    caption,
    photoUrl: photo?.url ?? null,
    photoSource: photo?.source ?? null,
  };
}
