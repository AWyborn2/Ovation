import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateSocialSettings,
  getGetSocialSettingsQueryKey,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import type { PackColourMode } from "@/lib/pack-render";

export type PackColourModes = {
  /** The mode a pack renders in for this club ("club" unless switched off). */
  modeFor: (packId: string) => PackColourMode;
  /** Switch one pack; the previews repaint before the save returns. */
  setMode: (packId: string, mode: PackColourMode) => void;
  /** The pack with a save in flight, if any. */
  pendingPackId: string | null;
  error: string | null;
  clearError: () => void;
};

/**
 * The club's per-pack "Club colours / Pack's own look" switch.
 *
 * The mode lives on the social settings bundle (`settings.packColourModes`),
 * which every pack surface already reads to build its `PackCardData`. A switch
 * therefore writes the new mode into the cached bundle first — every mounted
 * preview repaints at once — then PATCHes just that pack (the server merges it
 * into the stored map), rolling the cache back if the save fails.
 */
export function usePackColourModes(bundle: SocialSettingsBundle | undefined): PackColourModes {
  const qc = useQueryClient();
  const key = getGetSocialSettingsQueryKey();
  const [pendingPackId, setPendingPackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateSocialSettings();

  const modeFor = (packId: string): PackColourMode =>
    bundle?.settings.packColourModes?.[packId] === "pack" ? "pack" : "club";

  const setMode = (packId: string, mode: PackColourMode) => {
    setError(null);
    const previous = qc.getQueryData<SocialSettingsBundle>(key);
    if (previous) {
      qc.setQueryData<SocialSettingsBundle>(key, {
        ...previous,
        settings: {
          ...previous.settings,
          packColourModes: { ...(previous.settings.packColourModes ?? {}), [packId]: mode },
        },
      });
    }
    setPendingPackId(packId);
    update.mutate(
      { data: { packColourModes: { [packId]: mode } } },
      {
        onError: (e: unknown) => {
          if (previous) qc.setQueryData(key, previous);
          setError(handleAdminMutationError(e));
        },
        onSettled: () => {
          setPendingPackId(null);
          qc.invalidateQueries({ queryKey: key });
        },
      },
    );
  };

  return { modeFor, setMode, pendingPackId, error, clearError: () => setError(null) };
}
