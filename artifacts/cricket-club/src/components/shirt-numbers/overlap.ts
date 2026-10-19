import type { QueryClient } from "@tanstack/react-query";
import {
  createJuniorShirtNumber,
  createShirtNumber,
  getGetShirtNumberRegisterOverlapQueryKey,
  getListJuniorShirtNumbersQueryKey,
  getListShirtNumbersQueryKey,
} from "@workspace/api-client-react";
import type { ShirtNumberRegisterOverlap } from "@workspace/api-client-react";
import type { RegisterEntryView, RegisterName, WriteResultView } from "./api";

/**
 * One person can be on several shirt-number registers in a season (a junior who also
 * plays seniors, a woman in a men's side). That is allowed and never blocked; these
 * helpers only make it VISIBLE ("Also in" badges) and quick to do ("Also add to…").
 *
 * The cross-register facts come from the admin-only overlap read under
 * /api/juniors/shirt-numbers/overlap (flags and entry ids only), plus each senior
 * entry's own `alsoIn` for the other senior category.
 */

const REGISTER_ORDER: readonly RegisterName[] = ["men", "female", "juniors"];

/**
 * The entries with their `alsoIn` filled: the entry's own senior `alsoIn` plus every
 * register the overlap puts the same person on, minus the register being shown. Pure.
 */
export function withAlsoIn(
  entries: readonly RegisterEntryView[],
  register: RegisterName,
  overlap: ShirtNumberRegisterOverlap | undefined,
): RegisterEntryView[] {
  const fromOverlap = new Map<number, Set<RegisterName>>();
  for (const person of overlap?.people ?? []) {
    const ids = register === "juniors" ? person.juniorEntryIds : person.seniorEntryIds;
    for (const id of ids) {
      const set = fromOverlap.get(id) ?? new Set<RegisterName>();
      for (const r of person.registers) set.add(r);
      fromOverlap.set(id, set);
    }
  }
  return entries.map((e) => {
    const set = new Set<RegisterName>([...e.alsoIn, ...(fromOverlap.get(e.id) ?? [])]);
    set.delete(register);
    return { ...e, alsoIn: REGISTER_ORDER.filter((r) => set.has(r)) };
  });
}

/**
 * The registers an entry can still be copied to, each with why not when it can't:
 * a junior entry needs a PlayHQ Profile ID, so a senior entry without one cannot be
 * copied to Juniors. Pure.
 */
export function alsoAddTargets(
  entry: RegisterEntryView,
  register: RegisterName,
): { register: RegisterName; disabledReason: string | null }[] {
  return REGISTER_ORDER.filter((r) => r !== register && !entry.alsoIn.includes(r)).map((r) => ({
    register: r,
    disabledReason:
      r === "juniors" && !entry.participantId
        ? "Needs a PlayHQ Profile ID to go on the juniors register"
        : null,
  }));
}

/**
 * "Also add to…": a normal create on the destination register with the name, Profile
 * ID and number pre-filled (no cross-table write endpoint). A senior copy carries the
 * player link only between the senior categories; a copy from Juniors is held until the
 * PlayHQ sync links it.
 */
export function alsoAddEntry(
  entry: RegisterEntryView,
  to: RegisterName,
  season: number,
): Promise<WriteResultView> {
  if (to === "juniors") {
    if (!entry.participantId) {
      return Promise.reject(new Error("Needs a PlayHQ Profile ID to go on the juniors register"));
    }
    return createJuniorShirtNumber({
      season,
      participantId: entry.participantId,
      name: entry.name,
      number: entry.number,
    });
  }
  return createShirtNumber({
    season,
    category: to,
    name: entry.name,
    number: entry.number,
    playerId: entry.playerId,
    participantId: entry.participantId,
  });
}

/** Refresh every register view of a season and its overlap after a cross-register write. */
export function invalidateRegisters(queryClient: QueryClient, season: number): void {
  for (const key of [
    getListShirtNumbersQueryKey({ season, category: "men" }),
    getListShirtNumbersQueryKey({ season, category: "female" }),
    getListJuniorShirtNumbersQueryKey({ season }),
    getGetShirtNumberRegisterOverlapQueryKey({ season }),
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}
