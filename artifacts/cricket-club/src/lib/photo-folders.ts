import { PHOTO_TYPES, PHOTO_TYPE_LABELS, type PhotoType } from "@workspace/scorecard";

/**
 * Photo library folders (Social Studio): a view over each photo's grade and
 * photo type, not stored anywhere. Top level: one folder per grade plus
 * Club-wide (no grade). Inside each: one sub-folder per photo type plus
 * Unsorted (no type). A photo has one type; an older photo that still carries
 * several shows in the folder of its first type in `PHOTO_TYPES` order until
 * it is next moved.
 */

/** URL value of the Club-wide folder (`?grade=club-wide`). */
export const CLUB_WIDE = "club-wide";
/** URL value of the Unsorted sub-folder (`?type=unsorted`). */
export const UNSORTED = "unsorted";

export const CLUB_WIDE_LABEL = "Club-wide";
export const UNSORTED_LABEL = "Unsorted";

/** A top-level folder: a grade name, or {@link CLUB_WIDE}. */
export type GradeFolder = string;
/** A sub-folder: a photo type, or {@link UNSORTED}. */
export type TypeFolder = PhotoType | typeof UNSORTED;

export type FolderPath = { grade: GradeFolder | null; type: TypeFolder | null };

type FolderPhoto = { grade: string | null; photoTypes?: readonly string[] | null };

/** The grade folder a photo sits in. */
export function gradeFolderOf(photo: FolderPhoto): GradeFolder {
  return photo.grade ?? CLUB_WIDE;
}

/** The type sub-folder a photo sits in: its first type by `PHOTO_TYPES` order. */
export function typeFolderOf(photo: FolderPhoto): TypeFolder {
  const types = photo.photoTypes ?? [];
  return PHOTO_TYPES.find((t) => types.includes(t)) ?? UNSORTED;
}

export const TYPE_FOLDERS: readonly TypeFolder[] = [...PHOTO_TYPES, UNSORTED];

export function gradeFolderLabel(grade: GradeFolder): string {
  return grade === CLUB_WIDE ? CLUB_WIDE_LABEL : grade;
}

export function typeFolderLabel(type: TypeFolder): string {
  return type === UNSORTED ? UNSORTED_LABEL : PHOTO_TYPE_LABELS[type];
}

/** "A Grade / Batting" */
export function folderLabel(grade: GradeFolder, type: TypeFolder): string {
  return `${gradeFolderLabel(grade)} / ${typeFolderLabel(type)}`;
}

function isTypeFolder(value: string): value is TypeFolder {
  return (TYPE_FOLDERS as readonly string[]).includes(value);
}

/** The folder in a query string (`?grade=A%20Grade&type=batting`). */
export function parseFolder(search: string): FolderPath {
  const params = new URLSearchParams(search);
  const grade = params.get("grade")?.trim() || null;
  const type = params.get("type")?.trim() || null;
  if (!grade) return { grade: null, type: null };
  return { grade, type: type && isTypeFolder(type) ? type : null };
}

/** `search` with the folder params replaced (other params kept). */
export function folderSearch(search: string, folder: FolderPath): string {
  const params = new URLSearchParams(search);
  params.delete("grade");
  params.delete("type");
  if (folder.grade) {
    params.set("grade", folder.grade);
    if (folder.type) params.set("type", folder.type);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Photo counts per grade folder, and per grade × type sub-folder. */
export function folderCounts(photos: readonly FolderPhoto[]): {
  byGrade: Map<GradeFolder, number>;
  byType: Map<string, number>;
} {
  const byGrade = new Map<GradeFolder, number>();
  const byType = new Map<string, number>();
  for (const p of photos) {
    const g = gradeFolderOf(p);
    const key = `${g}|${typeFolderOf(p)}`;
    byGrade.set(g, (byGrade.get(g) ?? 0) + 1);
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }
  return { byGrade, byType };
}

export const typeCountKey = (grade: GradeFolder, type: TypeFolder) => `${grade}|${type}`;

/** The move / ingest target of a folder: grade (null = Club-wide) and type (null = Unsorted). */
export function folderTarget(
  grade: GradeFolder | null,
  type: TypeFolder | null,
): { grade: string | null; photoType: PhotoType | null } {
  return {
    grade: grade && grade !== CLUB_WIDE ? grade : null,
    photoType: type && type !== UNSORTED ? type : null,
  };
}
