import { useQueryClient } from "@tanstack/react-query";
import {
  getGetVotingConfigTallyQueryKey,
  getListVotingConfigBallotsQueryKey,
} from "@workspace/api-client-react";
import type { SelectedPlayer } from "@/components/player-typeahead";

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

export function formatSeasonRange(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

export function splitName(id: number, fullName: string): SelectedPlayer {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { id, givenName: fullName.trim(), surname: "" };
  const surname = parts[parts.length - 1];
  const givenName = parts.slice(0, -1).join(" ");
  return { id, givenName, surname };
}

export function invalidateBallotsAndTally(
  queryClient: ReturnType<typeof useQueryClient>,
  configId: number,
) {
  queryClient.invalidateQueries({
    queryKey: getListVotingConfigBallotsQueryKey(configId),
  });
  queryClient.invalidateQueries({
    queryKey: getGetVotingConfigTallyQueryKey(configId),
  });
}
