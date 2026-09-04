import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCardThemes,
  getListCardThemesQueryKey,
  useCreateCardTheme,
  type CardTheme as ApiCardTheme,
  type CardThemeInput,
} from "@workspace/api-client-react";

/**
 * Theme selection + per-card style tokens (U9) + "save as theme".
 * Junior cards are locked to the brown junior palette, so `selectedTheme`
 * is undefined for them and the style panel is never shown.
 */
export function useThemeStyle({ open, isJunior }: { open: boolean; isJunior: boolean }) {
  const themesQ = useListCardThemes({
    query: { enabled: open, queryKey: getListCardThemesQueryKey() },
  });
  const themes = (themesQ.data ?? []) as ApiCardTheme[];
  const [selectedThemeId, setSelectedThemeId] = useState<number | null>(null);
  useEffect(() => {
    if (!open || themes.length === 0) return;
    if (selectedThemeId !== null && themes.some((t) => t.id === selectedThemeId)) return;
    const def = themes.find((t) => t.isDefault) ?? themes[0];
    setSelectedThemeId(def.id);
  }, [open, themes, selectedThemeId]);
  const selectedTheme = useMemo(
    () => (isJunior ? undefined : themes.find((t) => t.id === selectedThemeId)),
    [isJunior, themes, selectedThemeId],
  );

  // --- Style token panel (U9) ------------------------------------------------
  // Per-card overrides on top of the selected theme: accent colour, panel
  // colour and display font. `null` = inherit the theme's value. Reset whenever
  // the modal opens or the selected theme changes (a new theme is a fresh base).
  const [styleAccent, setStyleAccent] = useState<string | null>(null);
  const [stylePanel, setStylePanel] = useState<string | null>(null);
  const [styleFont, setStyleFont] = useState<string | null>(null);
  useEffect(() => {
    setStyleAccent(null);
    setStylePanel(null);
    setStyleFont(null);
  }, [open, selectedThemeId]);

  // The effective accent/panel/font shown in the pickers (override ?? theme).
  const effAccent = styleAccent ?? selectedTheme?.accent ?? "#FBAC27";
  const effPanel = stylePanel ?? selectedTheme?.bgPanel ?? "#42342B";
  const effFont =
    styleFont ??
    ((selectedTheme as { displayFont?: string } | undefined)?.displayFont || "anton");

  // Fold the overrides onto the selected theme so BOTH the live PackCard preview
  // and the server still render (the harness only threads `theme`) resolve to
  // identical tokens (KTD6: junior > override > theme > brand).
  const effectiveTheme = useMemo<ApiCardTheme | null | undefined>(() => {
    if (!selectedTheme) return selectedTheme;
    if (!styleAccent && !stylePanel && !styleFont) return selectedTheme;
    return {
      ...selectedTheme,
      ...(styleAccent ? { accent: styleAccent } : {}),
      ...(stylePanel ? { bgPanel: stylePanel } : {}),
      ...(styleFont ? { displayFont: styleFont } : {}),
    } as ApiCardTheme;
  }, [selectedTheme, styleAccent, stylePanel, styleFont]);

  // Save-as-theme affordance.
  const qc = useQueryClient();
  const [saveThemeName, setSaveThemeName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [saveThemeError, setSaveThemeError] = useState<string | null>(null);
  const createTheme = useCreateCardTheme();
  const handleSaveTheme = () => {
    setSaveThemeError(null);
    const name = saveThemeName.trim();
    if (!name) {
      setSaveThemeError("Theme name required.");
      return;
    }
    createTheme.mutate(
      {
        data: {
          name,
          bgDark: selectedTheme?.bgDark ?? "#101216",
          bgPanel: effPanel,
          accent: effAccent,
          textLight: selectedTheme?.textLight ?? "#F5F2E8",
          displayFont: effFont as CardThemeInput["displayFont"],
          isDefault: saveAsDefault,
          displayOrder: themes.length,
        },
      },
      {
        onSuccess: (created: ApiCardTheme) => {
          setSaveThemeName("");
          setSaveAsDefault(false);
          // Refresh the theme list and switch selection to the new theme; its
          // saved tokens now match, so the per-card overrides reset cleanly.
          qc.invalidateQueries({ queryKey: getListCardThemesQueryKey() });
          if (created && typeof created.id === "number") setSelectedThemeId(created.id);
        },
        onError: (e: unknown) =>
          setSaveThemeError(e instanceof Error ? e.message : "Could not save theme."),
      },
    );
  };

  const resetStyle = () => {
    setStyleAccent(null);
    setStylePanel(null);
    setStyleFont(null);
  };

  return {
    themes,
    selectedThemeId,
    setSelectedThemeId,
    selectedTheme,
    styleAccent,
    setStyleAccent,
    stylePanel,
    setStylePanel,
    styleFont,
    setStyleFont,
    resetStyle,
    effAccent,
    effPanel,
    effFont,
    effectiveTheme,
    saveThemeName,
    setSaveThemeName,
    saveAsDefault,
    setSaveAsDefault,
    saveThemeError,
    createTheme,
    handleSaveTheme,
  };
}

export type ThemeStyle = ReturnType<typeof useThemeStyle>;
