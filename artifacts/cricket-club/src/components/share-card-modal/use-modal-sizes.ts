import { useEffect, useMemo, useState } from "react";
import type { CardSize } from "@/lib/share-card";
import { clubSizesFor, DEFAULT_NEW_SIZE, type SizeSwitches } from "@/lib/offered-sizes";

/**
 * The sizes the share card modal offers, and the one shown.
 *
 * Portrait and Story where the club has them on (D7). A stored item (a queued
 * draft) also keeps the older sizes its own design has, whatever the club's
 * switches, so an older square card still opens and downloads at Square after
 * the club's Square goes off (D3). Posting is not decided here: feed posts go
 * out at Portrait (Stage 1).
 */
export function useModalSizes({
  open,
  settings,
  olderSizes,
}: {
  open: boolean;
  settings: SizeSwitches | null | undefined;
  olderSizes?: readonly CardSize[];
}) {
  const olderKey = (olderSizes ?? []).join(",");
  const enabledSizes: CardSize[] = useMemo(
    () => clubSizesFor(settings, olderKey ? (olderKey.split(",") as CardSize[]) : []),
    [settings, olderKey],
  );
  const [activeSize, setActiveSize] = useState<CardSize>(DEFAULT_NEW_SIZE);
  useEffect(() => {
    if (open && enabledSizes.length > 0 && !enabledSizes.includes(activeSize)) {
      setActiveSize(enabledSizes[0]);
    }
  }, [open, enabledSizes, activeSize]);
  return { enabledSizes, activeSize, setActiveSize };
}
