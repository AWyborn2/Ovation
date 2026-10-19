import type { QueryKey } from "@tanstack/react-query";
import {
  listShirtNumbers,
  getListShirtNumbersQueryKey,
  createShirtNumber,
  updateShirtNumber,
  deleteShirtNumber,
  startShirtNumberSeason,
  addSquadToShirtNumberSeason,
  uploadShirtNumbers,
  commitShirtNumberUpload,
  discardShirtNumberUpload,
} from "@workspace/api-client-react";
import type {
  ShirtNumberCategory,
  ShirtNumberEntry,
  ShirtNumberConflict,
  ShirtNumberRegisterName,
  ShirtNumberCrossRegisterNote,
  ShirtNumberSeasonStartResult,
  ShirtNumberSource,
  ShirtNumberSquadAddResult,
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
 * (junior entries never carry a senior `playerId`; they are held by PlayHQ
 * Profile ID until their player arrives).
 *
 * The senior register has two categories (Men / Female); each gets its own adapter
 * ({@link seniorShirtNumberApiFor}). One person may be on several registers.
 */
export type ShirtNumberSide = "senior" | "junior";

/** The three registers a person can be on in a season. */
export type RegisterName = ShirtNumberRegisterName;

export const REGISTER_LABEL: Record<RegisterName, string> = {
  men: "Men",
  female: "Female",
  juniors: "Juniors",
};

export type RegisterEntryView = {
  id: number;
  season: number;
  name: string;
  number: string | null;
  participantId: string | null;
  /** Senior only: the linked player; always null on the junior side. */
  playerId: number | null;
  playerName: string | null;
  /**
   * Not live yet. Senior: not linked to a player who has played. Junior: kept by a
   * PlayHQ Profile ID until that player arrives under the sheet's name.
   */
  held: boolean;
  /** Junior only: why a held entry is not live (`nameMismatch`: check before linking). */
  heldReason: "waiting" | "nameMismatch" | null;
  /** Junior only: the one club junior whose PlayHQ name matches a held entry's name. */
  suggestedLink: { participantId: string; name: string } | null;
  duplicate: boolean;
  source: ShirtNumberSource;
  /** Admin-only cross-check against the other side's register this season. */
  crossRegister: ShirtNumberCrossRegisterNote[];
  /** Senior only: the senior category this entry is in. */
  category?: ShirtNumberCategory;
  /**
   * The other registers this person is also on this season ("Also in" badges): the
   * entry's own `alsoIn` plus the admin-only register overlap. Filled by the register.
   */
  alsoIn: RegisterName[];
};

export type RegisterView = {
  season: number;
  seasons: number[];
  entries: RegisterEntryView[];
  /** The other register's number per participant id, to prefill the add form (juniors). */
  crossNumbers?: Record<string, string>;
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
  /** Take the number the person wears in the other register (a `same` note). */
  useCrossRegisterNumber?: boolean;
};

export interface ShirtNumberRegisterApi {
  side: ShirtNumberSide;
  /** Which register this adapter reads and writes. */
  register: RegisterName;
  /** Entries can be held (not live yet) and linked to a player later. */
  supportsHeld: boolean;
  /**
   * Juniors: only an upload row whose PlayHQ Profile ID is no club junior yet can be
   * held (by that id); every other unmatched row must be linked or discarded.
   */
  holdOnlyByProfileId: boolean;
  registerQueryKey: (season: number) => QueryKey;
  fetchRegister: (season: number) => Promise<RegisterView>;
  createEntry: (input: EntryCreate) => Promise<WriteResultView>;
  updateEntry: (id: number, patch: EntryPatch) => Promise<WriteResultView>;
  deleteEntry: (id: number) => Promise<void>;
  startSeason: (season: number) => Promise<ShirtNumberSeasonStartResult>;
  /** "Add squad to register": the club's squad register (this side's members) into `season`. */
  addSquad: (season: number) => Promise<ShirtNumberSquadAddResult>;
  /** Senior only: move entries to the other category ("Move to Female"). */
  moveEntry?: (id: number, category: ShirtNumberCategory) => Promise<WriteResultView>;
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
  heldReason: null,
  suggestedLink: null,
  duplicate: e.duplicate,
  source: e.source,
  crossRegister: e.crossRegister ?? [],
  category: e.category,
  alsoIn: e.alsoIn ?? [],
});

/**
 * The senior register adapter for one category. Reads, writes, uploads and "Add squad"
 * all stay within it; duplicate flags are per category. "Start season" rolls every
 * category forward at once (each into itself).
 */
export function seniorShirtNumberApiFor(category: ShirtNumberCategory): ShirtNumberRegisterApi {
  return {
    side: "senior",
    register: category,
    supportsHeld: true,
    holdOnlyByProfileId: false,
    registerQueryKey: (season) => getListShirtNumbersQueryKey({ season, category }),
    fetchRegister: async (season) => {
      const r = await listShirtNumbers({ season, category });
      return { season: r.season, seasons: r.seasons, entries: r.entries.map(seniorEntryView) };
    },
    createEntry: ({ season, name, number, playerId, participantId }) =>
      createShirtNumber({
        season,
        category,
        name,
        number,
        playerId: playerId ?? null,
        participantId: participantId ?? null,
      }),
    updateEntry: (id, patch) => updateShirtNumber(id, patch),
    moveEntry: (id, to) => updateShirtNumber(id, { category: to }),
    deleteEntry: (id) => deleteShirtNumber(id),
    startSeason: (season) => startShirtNumberSeason(season),
    addSquad: (season) => addSquadToShirtNumberSeason(season, { category }),
    upload: (input) => uploadShirtNumbers({ ...input, category }),
    commitUpload: (id, resolutions) =>
      commitShirtNumberUpload(id, {
        resolutions: resolutions.map(({ rowIndex, action, playerId, useCrossRegisterNumber }) => ({
          rowIndex,
          action,
          ...(action === "link" ? { playerId: playerId ?? null } : {}),
          ...(useCrossRegisterNumber && action !== "discard"
            ? { useCrossRegisterNumber: true }
            : {}),
        })),
      }),
    discardUpload: (id) => discardShirtNumberUpload(id),
  };
}

/** The men's register: every senior entry from before the categories existed. */
export const seniorShirtNumberApi: ShirtNumberRegisterApi = seniorShirtNumberApiFor("men");

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
