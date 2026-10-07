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
 * /api/juniors/shirt-numbers routes. Junior entries are keyed on a junior
 * participant, so they are never held and never carry a senior player.
 */

const juniorEntryView = (e: JuniorShirtNumberEntry): RegisterEntryView => ({
  id: e.id,
  season: e.season,
  name: e.name,
  number: e.number,
  participantId: e.participantId,
  playerId: null,
  playerName: null,
  held: false,
  duplicate: e.duplicate,
  source: e.source,
});

/** A junior upload resolution: `link` to a participant, otherwise discard (no held entries). */
export function juniorResolution(r: RowResolution): JuniorShirtNumberRowResolution {
  return r.action === "link" && r.participantId
    ? { rowIndex: r.rowIndex, action: "link", participantId: r.participantId }
    : { rowIndex: r.rowIndex, action: "discard" };
}

export const juniorShirtNumberApi: ShirtNumberRegisterApi = {
  side: "junior",
  supportsHeld: false,
  registerQueryKey: (season) => getListJuniorShirtNumbersQueryKey({ season }),
  fetchRegister: async (season) => {
    const r = await listJuniorShirtNumbers({ season });
    return { season: r.season, seasons: r.seasons, entries: r.entries.map(juniorEntryView) };
  },
  createEntry: ({ season, name, number, participantId }) => {
    if (!participantId) return Promise.reject(new Error("Choose a junior player"));
    return createJuniorShirtNumber({ season, participantId, name, number });
  },
  // Juniors can be renamed or (re)numbered; identity never changes.
  updateEntry: (id, patch) => {
    const body: JuniorShirtNumberEntryUpdate = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.number !== undefined) body.number = patch.number;
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
