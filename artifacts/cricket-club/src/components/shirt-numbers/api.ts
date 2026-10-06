import type { QueryKey } from "@tanstack/react-query";
import {
  listShirtNumbers,
  getListShirtNumbersQueryKey,
  createShirtNumber,
  updateShirtNumber,
  deleteShirtNumber,
  startShirtNumberSeason,
  uploadShirtNumbers,
  commitShirtNumberUpload,
  discardShirtNumberUpload,
} from "@workspace/api-client-react";
import type {
  ShirtNumberEntry,
  ShirtNumberConflict,
  ShirtNumberSeasonStartResult,
  ShirtNumberSource,
  ShirtNumberUploadCommitResult,
  ShirtNumberUploadKind,
  ShirtNumberUploadPreview,
  ShirtNumberWarning,
} from "@workspace/api-client-react";
import { handleAdminMutationError } from "@/lib/admin-auth";

/**
 * The register UI is side-agnostic: the senior page passes
 * {@link seniorShirtNumberApi}; the juniors page passes its own adapter over
 * the junior client functions. Entries are normalised to one view shape
 * (junior entries are never held and never carry a senior `playerId`).
 */
export type ShirtNumberSide = "senior" | "junior";

export type RegisterEntryView = {
  id: number;
  season: number;
  name: string;
  number: string | null;
  participantId: string | null;
  /** Senior only: the linked player; always null on the junior side. */
  playerId: number | null;
  playerName: string | null;
  /** Senior only: not yet linked to a player who has played. */
  held: boolean;
  duplicate: boolean;
  source: ShirtNumberSource;
};

export type RegisterView = {
  season: number;
  seasons: number[];
  entries: RegisterEntryView[];
};

export type WriteResultView = { warnings: ShirtNumberWarning[] };

/** A person chosen in the add form or to link a held entry. */
export type PickedPerson = {
  name: string;
  playerId?: number | null;
  participantId?: string | null;
};

export type EntryCreate = PickedPerson & { season: number; number: string | null };
export type EntryPatch = {
  number?: string | null;
  name?: string;
  playerId?: number | null;
  participantId?: string | null;
};

/** One upload row's decision; `hold` exists only where the side supports held entries. */
export type RowResolution = {
  rowIndex: number;
  action: "link" | "hold" | "discard";
  playerId?: number | null;
  participantId?: string | null;
};

export interface ShirtNumberRegisterApi {
  side: ShirtNumberSide;
  /** Senior: entries can be held (unlinked) and linked to a player later. */
  supportsHeld: boolean;
  registerQueryKey: (season: number) => QueryKey;
  fetchRegister: (season: number) => Promise<RegisterView>;
  createEntry: (input: EntryCreate) => Promise<WriteResultView>;
  updateEntry: (id: number, patch: EntryPatch) => Promise<WriteResultView>;
  deleteEntry: (id: number) => Promise<void>;
  startSeason: (season: number) => Promise<ShirtNumberSeasonStartResult>;
  upload: (input: {
    file: File;
    kind: ShirtNumberUploadKind;
    season: number;
  }) => Promise<ShirtNumberUploadPreview>;
  commitUpload: (
    id: number,
    resolutions: RowResolution[],
  ) => Promise<ShirtNumberUploadCommitResult>;
  discardUpload: (id: number) => Promise<void>;
}

const seniorEntryView = (e: ShirtNumberEntry): RegisterEntryView => ({
  id: e.id,
  season: e.season,
  name: e.name,
  number: e.number,
  participantId: e.participantId,
  playerId: e.playerId,
  playerName: e.playerName ?? null,
  held: e.held,
  duplicate: e.duplicate,
  source: e.source,
});

export const seniorShirtNumberApi: ShirtNumberRegisterApi = {
  side: "senior",
  supportsHeld: true,
  registerQueryKey: (season) => getListShirtNumbersQueryKey({ season }),
  fetchRegister: async (season) => {
    const r = await listShirtNumbers({ season });
    return { season: r.season, seasons: r.seasons, entries: r.entries.map(seniorEntryView) };
  },
  createEntry: ({ season, name, number, playerId, participantId }) =>
    createShirtNumber({
      season,
      name,
      number,
      playerId: playerId ?? null,
      participantId: participantId ?? null,
    }),
  updateEntry: (id, patch) => updateShirtNumber(id, patch),
  deleteEntry: (id) => deleteShirtNumber(id),
  startSeason: (season) => startShirtNumberSeason(season),
  upload: (input) => uploadShirtNumbers(input),
  commitUpload: (id, resolutions) =>
    commitShirtNumberUpload(id, {
      resolutions: resolutions.map(({ rowIndex, action, playerId }) => ({
        rowIndex,
        action,
        ...(action === "link" ? { playerId: playerId ?? null } : {}),
      })),
    }),
  discardUpload: (id) => discardShirtNumberUpload(id),
};

/** The block-policy conflict body from a 409, if this error is one. */
export function conflictOf(e: unknown): ShirtNumberConflict | null {
  const err = e as { status?: number; data?: unknown } | null;
  if (err?.status !== 409) return null;
  const data = err.data as Partial<ShirtNumberConflict> | null | undefined;
  if (!data || typeof data.error !== "string") return null;
  return { error: data.error, warnings: Array.isArray(data.warnings) ? data.warnings : [] };
}

/** A readable message for a failed request: the server's `error` text when it sent one. */
export function errorMessage(e: unknown): string {
  const err = e as { status?: number; data?: unknown } | null;
  if (err?.status === 401) return handleAdminMutationError(e) ?? "Request failed";
  const data = err?.data as { error?: unknown } | null | undefined;
  if (data && typeof data.error === "string" && data.error.trim()) return data.error;
  if (err?.status === 413) return "That file is too large (2 MB maximum).";
  return handleAdminMutationError(e) ?? "Request failed";
}
