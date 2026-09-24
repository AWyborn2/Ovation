import { useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { applySlots, parseSlots, type Slots } from "./compare-data";

/**
 * The compared players, kept in the URL as `a`, `b`, `c`. Changes merge into
 * the current query string in one navigation, so the season bar's `from`,
 * `to` and `d` survive every pick, swap and removal (KTD8).
 */
export function useComparePlayers(): {
  slots: Slots;
  setSlots: (patch: Partial<Slots>) => void;
} {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const slots = useMemo(() => parseSlots(search), [search]);
  const setSlots = useCallback(
    (patch: Partial<Slots>) => {
      const qs = applySlots(search, patch);
      if (qs === new URLSearchParams(search).toString()) return;
      navigate(qs ? `${location}?${qs}` : location, { replace: true });
    },
    [search, location, navigate],
  );
  return { slots, setSlots };
}
