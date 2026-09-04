import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { ThemeMode } from "@/lib/theme-tokens";

/** Stored preference: an explicit choice, or "system" to track OS preference. */
export type ThemePreference = ThemeMode | "system";

const STORAGE_KEY = "ovation-theme";

const prefersDark = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage unavailable (privacy mode, SSR-adjacent contexts) — fall
    // through to the OS-preference default.
  }
  return "system";
}

function resolveMode(preference: ThemePreference): ThemeMode {
  return preference === "system" ? (prefersDark() ? "dark" : "light") : preference;
}

interface ThemeContextValue {
  /** The resolved light/dark mode actually in effect. */
  mode: ThemeMode;
  /** The stored preference ("system" tracks the OS setting live). */
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  /** Toggle between light and dark, replacing any "system" tracking. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The resolved theme mode, plus controls to change it. */
export function useThemeMode(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used within a ThemeProvider");
  }
  return ctx;
}

/**
 * Owns the resolved light/dark mode: reconciles with whatever `index.html`'s
 * anti-flash inline script already set on `<html>` (so mounting doesn't cause
 * a second flip), persists explicit choices to localStorage, and — while the
 * stored preference is "system" — live-updates on OS preference change. An
 * explicit toggle stops tracking the OS and persists the concrete choice.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [mode, setModeState] = useState<ThemeMode>(() => resolveMode(preference));

  const applyClass = useCallback((m: ThemeMode) => {
    document.documentElement.classList.toggle("dark", m === "dark");
  }, []);

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref);
      try {
        localStorage.setItem(STORAGE_KEY, pref);
      } catch {
        // Best-effort persistence only.
      }
      const resolved = resolveMode(pref);
      setModeState(resolved);
      applyClass(resolved);
    },
    [applyClass],
  );

  const toggle = useCallback(() => {
    setPreference(mode === "dark" ? "light" : "dark");
  }, [mode, setPreference]);

  // Reconcile on mount with whatever the inline script already painted, and
  // wire the live OS-preference listener while "system" is in effect.
  useEffect(() => {
    applyClass(mode);
    if (preference !== "system" || typeof matchMedia !== "function") return;
    const mql = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved = resolveMode("system");
      setModeState(resolved);
      applyClass(resolved);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preference]);

  return (
    <ThemeContext.Provider value={{ mode, preference, setPreference, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
