import { useCallback } from "react";
import { useLocation, useSearch } from "wouter";

/**
 * A string state value mirrored in the URL query (`?name=value`), so filters and
 * tabs survive reloads and are shareable. Setting the default value removes the
 * param. History is replaced, not pushed, so filtering doesn't flood Back.
 */
export function useSearchParamState(
  name: string,
  defaultValue: string,
): [string, (next: string) => void] {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const value = new URLSearchParams(search).get(name) ?? defaultValue;

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(search);
      if (next === defaultValue || next === "") params.delete(name);
      else params.set(name, next);
      const qs = params.toString();
      navigate(qs ? `${location}?${qs}` : location, { replace: true });
    },
    [search, location, navigate, name, defaultValue],
  );

  return [value, setValue];
}
