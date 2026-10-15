import {
  listJuniorShirtNumbers,
  getListJuniorShirtNumbersQueryKey,
  createJuniorShirtNumber,
  updateJuniorShirtNumber,
  deleteJuniorShirtNumber,
  startJuniorShirtNumberSeason,
  addSquadToJuniorShirtNumberSeason,
  uploadJuniorShirtNumbers,
  commitJuniorShirtNumberUpload,
  discardJuniorShirtNumberUpload,
} from "@workspace/api-client-react";
import type {
  JuniorShirtNumberEntry,
  JuniorShirtNumberEntryUpdate,
  JuniorShirtNumberRowResolution,
} from "@workspace/api-client-react";
import type { RegisterEntryView, RowResolution, ShirtNumberRegisterApi } from "./api";

/**
 * The juniors register adapter (plan U10, R17): the same register UI over the
 * /api/juniors/shirt-numbers routes. Junior entries are keyed on a PlayHQ
 * participant and never carry a senior player. An entry uploaded before its
 * player is in the app is held by Profile ID ("Waiting for PlayHQ") and goes live
 * when the sync brings that player in under the sheet's name.
 */

const juniorEntryView = (e: JuniorShirtNumberEntry): RegisterEntryView => ({
  id: e.id,
  season: e.season,
  name: e.name,
  number: e.number,
  participantId: e.participantId,
  playerId: null,
  playerName: e.playerName ?? null,
  held: e.linkStatus !== "linked",
  heldReason: e.linkStatus === "linked" ? null : e.linkStatus,
  suggestedLink: e.suggestedLink ?? null,
  duplicate: e.duplicate,
  source: e.source,
  crossRegister: e.crossRegister ?? [],
});

/** A junior upload resolution: `link` to a participant, `hold` by Profile ID, or discard. */
export function juniorResolution(r: RowResolution): JuniorShirtNumberRowResolution {
  const cross = r.useCrossRegisterNumber ? { useCrossRegisterNumber: true } : {};
  if (r.action === "link" && r.participantId) {
    return { rowIndex: r.rowIndex, action: "link", participantId: r.participantId, ...cross };
  }
  if (r.action === "hold") return { rowIndex: r.rowIndex, action: "hold", ...cross };
  return { rowIndex: r.rowIndex, action: "discard" };
}

export const juniorShirtNumberApi: ShirtNumberRegisterApi = {
  side: "junior",
  supportsHeld: true,
  holdOnlyByProfileId: true,
  registerQueryKey: (season) => getListJuniorShirtNumbersQueryKey({ season }),
  fetchRegister: async (season) => {
    const r = await listJuniorShirtNumbers({ season });
    return {
      season: r.season,
      seasons: r.seasons,
      entries: r.entries.map(juniorEntryView),
      crossNumbers: Object.fromEntries(
        (r.seniorNumbers ?? []).map((s) => [s.participantId, s.number]),
      ),
    };
  },
  createEntry: ({ season, name, number, participantId }) => {
    if (!participantId) return Promise.reject(new Error("Choose a junior player"));
    return createJuniorShirtNumber({ season, participantId, name, number });
  },
  // Juniors can be renamed, (re)numbered, or linked to a club junior (which makes a
  // held entry live).
  updateEntry: (id, patch) => {
    const body: JuniorShirtNumberEntryUpdate = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.number !== undefined) body.number = patch.number;
    if (patch.participantId) body.participantId = patch.participantId;
    return updateJuniorShirtNumber(id, body);
  },
  deleteEntry: (id) => deleteJuniorShirtNumber(id),
  startSeason: (season) => startJuniorShirtNumberSeason(season),
  addSquad: (season) => addSquadToJuniorShirtNumberSeason(season),
  upload: (input) => uploadJuniorShirtNumbers(input),
  commitUpload: (id, resolutions) =>
    commitJuniorShirtNumberUpload(id, { resolutions: resolutions.map(juniorResolution) }),
  discardUpload: (id) => discardJuniorShirtNumberUpload(id),
};
