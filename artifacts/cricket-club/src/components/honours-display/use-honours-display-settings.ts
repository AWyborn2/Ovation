import { useEffect, useMemo, useState } from "react";
import {
  useUpdateHonourDisplaySettings,
  useListSponsors,
  type HonourDisplayBundle,
  type HonourDisplaySettingsUpdate,
  type BoardDisplayConfig,
  type CompositeDef,
  type DisplayBoard,
  type HonourSkin,
  type HonourColourOverrides,
  type GridCatalogEntry,
  type KioskAd,
  type CustomGridDef,
} from "@workspace/api-client-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { TEMPLATES, isBuiltinSkin } from "./types";
import { CLIENT_DEFAULT_DISPLAY } from "./use-approaching-board";
import type { SkinOption } from "./editors/constants";

// The "approaching milestones" board is built client-side (no server row), so it
// never appears in the bundle. This synthetic row lets an admin still tune its
// display via boardConfigs['approaching'] (consumed by applyBoardConfig on the
// public display + kiosk).
const APPROACHING_TUNABLE_BOARD: DisplayBoard = {
  id: "approaching",
  category: "approaching_milestones",
  layout: "list",
  title: "Approaching Milestones",
  subtitle: "Players closing in on a club milestone",
  entries: [],
  display: { ...CLIENT_DEFAULT_DISPLAY },
};

export type SponsorSlideStyle = "grid" | "single";

/**
 * Draft state for the honours display / kiosk settings form (plan.md §5.6).
 *
 * Owns every editable field, re-seeds from the server bundle when it changes,
 * validates and submits via `useUpdateHonourDisplaySettings`, and exposes the
 * derived lists the section components render (tunable boards, skin options,
 * composite source boards, active sponsors). The sections under `./settings/`
 * are presentational over this object.
 */
export function useHonoursDisplaySettings(bundle: HonourDisplayBundle, onSaved: () => void) {
  const { boards, settings, brand } = bundle;
  const boardTitle = useMemo(() => new Map(boards.map((b) => [b.id, b.title])), [boards]);

  const [defaultTemplate, setDefaultTemplate] = useState<string>(settings.defaultTemplate);
  const [sequence, setSequence] = useState<string[]>(settings.kioskSequence ?? []);
  const [dwell, setDwell] = useState(String(settings.kioskDwellMs));
  const [speed, setSpeed] = useState(String(settings.kioskScrollSpeed));
  const [endHold, setEndHold] = useState(String(settings.kioskEndHoldMs));
  const [sponsorStrip, setSponsorStrip] = useState(settings.kioskSponsorStrip);
  const [sponsorSlides, setSponsorSlides] = useState(settings.kioskSponsorSlides);
  const [sponsorSlideEvery, setSponsorSlideEvery] = useState(
    String(settings.kioskSponsorSlideEvery),
  );
  const [sponsorSlideStyle, setSponsorSlideStyle] = useState<SponsorSlideStyle>(
    settings.kioskSponsorSlideStyle ?? "grid",
  );
  const [sponsorIds, setSponsorIds] = useState<number[]>(settings.kioskSponsorIds ?? []);
  const [kioskAds, setKioskAds] = useState<KioskAd[]>(settings.kioskAds ?? []);
  const [boardConfigs, setBoardConfigs] = useState<Record<string, BoardDisplayConfig>>(
    settings.boardConfigs ?? {},
  );
  const [composites, setComposites] = useState<CompositeDef[]>(settings.composites ?? []);
  const [customGrids, setCustomGrids] = useState<CustomGridDef[]>(settings.customGrids ?? []);
  const [skins, setSkins] = useState<HonourSkin[]>(settings.skins ?? []);
  const [colourOverrides, setColourOverrides] = useState<HonourColourOverrides>(
    settings.colourOverrides ?? {},
  );
  const [defaultFont, setDefaultFont] = useState<string>(settings.defaultFont ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDefaultTemplate(settings.defaultTemplate);
    setSequence(settings.kioskSequence ?? []);
    setDwell(String(settings.kioskDwellMs));
    setSpeed(String(settings.kioskScrollSpeed));
    setEndHold(String(settings.kioskEndHoldMs));
    setSponsorStrip(settings.kioskSponsorStrip);
    setSponsorSlides(settings.kioskSponsorSlides);
    setSponsorSlideEvery(String(settings.kioskSponsorSlideEvery));
    setSponsorSlideStyle(settings.kioskSponsorSlideStyle ?? "grid");
    setSponsorIds(settings.kioskSponsorIds ?? []);
    setKioskAds(settings.kioskAds ?? []);
    setBoardConfigs(settings.boardConfigs ?? {});
    setComposites(settings.composites ?? []);
    setCustomGrids(settings.customGrids ?? []);
    setSkins(settings.skins ?? []);
    setColourOverrides(settings.colourOverrides ?? {});
    setDefaultFont(settings.defaultFont ?? "");
  }, [settings]);

  const update = useUpdateHonourDisplaySettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        onSaved();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  // Read-only preview of the club sponsor library (same list the kiosk shows).
  // Sponsors are managed under Social → Sponsors; here we only toggle their use.
  const sponsorsQ = useListSponsors();
  const sponsors = sponsorsQ.data ?? [];
  // Mirror the kiosk's server-side active-window filter (active-sponsors.ts) so
  // the preview shows exactly what the TV will: a null bound is open-ended, and
  // dates compare lexically as YYYY-MM-DD. Ordered by displayOrder like the feed.
  const today = new Date().toISOString().slice(0, 10);
  const activeSponsors = sponsors
    .filter((s) => (!s.activeFrom || s.activeFrom <= today) && (!s.activeTo || s.activeTo >= today))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);

  const moveSeq = (idx: number, dir: -1 | 1) => {
    setSequence((prev) => {
      const next = prev.slice();
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  };
  const removeSeq = (idx: number) => setSequence((prev) => prev.filter((_, i) => i !== idx));
  const addToSeq = (id: string) => {
    if (id) setSequence((prev) => [...prev, id]);
  };

  const save = () => {
    setError(null);
    const d = parseInt(dwell, 10);
    const s = parseInt(speed, 10);
    const e = parseInt(endHold, 10);
    if ([d, s, e].some((n) => isNaN(n) || n < 0)) {
      return setError("Kiosk timings must be non-negative numbers.");
    }
    if (s < 1) return setError("Scroll speed must be at least 1 px/sec.");
    const every = parseInt(sponsorSlideEvery, 10);
    if (sponsorSlides && (isNaN(every) || every < 1)) {
      return setError("Sponsor slide frequency must be at least 1 board.");
    }
    // Slides off → a stale/invalid value in the (hidden) input must not block
    // saving unrelated settings; fall back to the persisted value.
    const safeEvery = !isNaN(every) && every >= 1 ? every : settings.kioskSponsorSlideEvery;
    for (const c of composites) {
      if (!c.title.trim()) {
        return setError("Every composite board needs a title.");
      }
      if (c.columns.length < 2) {
        return setError(`Composite "${c.title || "Untitled"}" needs at least 2 columns.`);
      }
      if (c.columns.some((col) => !col.boardId || !col.heading.trim())) {
        return setError(`Composite "${c.title}" has a column missing a source board or heading.`);
      }
    }
    for (const sk of skins) {
      if (!sk.name.trim()) return setError("Every theme needs a name.");
    }
    for (const g of customGrids) {
      if (!g.title.trim()) return setError("Every custom grid board needs a title.");
      if (g.columns.length < 1) {
        return setError(`Custom grid "${g.title || "Untitled"}" needs at least one column.`);
      }
      if (g.columns.some((c) => !c.label.trim())) {
        return setError(`Custom grid "${g.title}" has a column missing a heading.`);
      }
      if (g.columns.some((c) => c.source !== "manual" && !(c.sourceKey ?? "").trim())) {
        return setError(`Custom grid "${g.title}" has a column missing its data source selection.`);
      }
    }
    // Guard against saving a default that points at a deleted custom skin.
    if (!isBuiltinSkin(defaultTemplate) && !skins.some((s) => s.id === defaultTemplate)) {
      return setError("The selected default theme no longer exists — pick another.");
    }
    const data: HonourDisplaySettingsUpdate = {
      defaultTemplate,
      kioskSequence: sequence,
      kioskDwellMs: d,
      kioskScrollSpeed: s,
      kioskEndHoldMs: e,
      kioskSponsorStrip: sponsorStrip,
      kioskSponsorSlides: sponsorSlides,
      kioskSponsorSlideEvery: safeEvery,
      kioskSponsorSlideStyle: sponsorSlideStyle,
      kioskSponsorIds: sponsorIds,
      kioskAds,
      boardConfigs,
      composites,
      customGrids,
      skins,
      colourOverrides: {
        background: colourOverrides.background || null,
        text: colourOverrides.text || null,
        accent: colourOverrides.accent || null,
        heading: colourOverrides.heading || null,
        season: colourOverrides.season || null,
      },
      defaultFont: defaultFont || null,
    };
    update.mutate({ data });
  };

  const unusedBoards = boards.filter((b) => !sequence.includes(b.id));

  // Boards an admin can tune (real boards + approaching), excluding composites
  // which carry their own transition/fit on the composite definition. The
  // approaching board is client-only, so append it as a synthetic row unless the
  // bundle somehow already carries one.
  // Custom grids are configured in their own builder (skin/fill/footnote live on
  // the definition), so exclude them from the generic per-board tuner too.
  const realTunable = boards.filter(
    (b) => !b.id.startsWith("composite:") && !b.id.startsWith("grid:"),
  );
  const tunableBoards = realTunable.some((b) => b.id === "approaching")
    ? realTunable
    : [...realTunable, APPROACHING_TUNABLE_BOARD];

  // Skin choices for the per-board / per-grid skin selects (built-ins + custom).
  const skinOptions: SkinOption[] = [
    ...TEMPLATES.map((t) => ({ value: t.id, label: t.label })),
    ...skins.map((s) => ({ value: s.id, label: s.name })),
  ];

  // Resolve a sequence item to a display label (boards + sponsor/ad tokens).
  const seqLabel = (id: string): string => {
    if (id === "sponsor") return "✦ Sponsor slide";
    if (id.startsWith("ad:")) {
      const ad = kioskAds.find((a) => a.id === id);
      return ad ? `▣ Ad — ${ad.name || "Untitled"}` : `${id} (missing ad)`;
    }
    return boardTitle.get(id) ?? `${id} (missing)`;
  };
  // List-layout boards eligible to be a composite column source (no composites,
  // no approaching — the server refuses both as column refs).
  const sourceBoards = boards.filter(
    (b) => b.layout === "list" && !b.id.startsWith("composite:") && b.id !== "approaching",
  );

  const setConfig = (id: string, patch: Partial<BoardDisplayConfig>) =>
    setBoardConfigs((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const addComposite = () =>
    setComposites((prev) => [
      ...prev,
      {
        id: `composite:${crypto.randomUUID()}`,
        title: "",
        subtitle: "",
        seasonAligned: false,
        columns: [],
        transition: "slide",
        fit: true,
      },
    ]);
  const patchComposite = (id: string, patch: Partial<CompositeDef>) =>
    setComposites((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeComposite = (id: string) => setComposites((prev) => prev.filter((c) => c.id !== id));

  // ---- Custom grid boards ------------------------------------------------
  const addCustomGrid = () =>
    setCustomGrids((prev) => [
      ...prev,
      {
        id: `grid:${crypto.randomUUID()}`,
        title: "",
        subtitle: "",
        footnote: "",
        skin: null,
        seasonFrom: null,
        seasonTo: null,
        fillMode: "wrap",
        wrapBlocks: 2,
        columns: [],
      },
    ]);
  const patchCustomGrid = (id: string, patch: Partial<CustomGridDef>) =>
    setCustomGrids((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const removeCustomGrid = (id: string) => {
    setCustomGrids((prev) => prev.filter((g) => g.id !== id));
    setSequence((prev) => prev.filter((s) => s !== id));
  };

  // ---- Kiosk ad creatives ------------------------------------------------
  const addAd = (ad: KioskAd) => setKioskAds((prev) => [...prev, ad]);
  const patchAd = (id: string, patch: Partial<KioskAd>) =>
    setKioskAds((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAd = (id: string) => {
    setKioskAds((prev) => prev.filter((a) => a.id !== id));
    setSequence((prev) => prev.filter((s) => s !== id));
  };

  const toggleSponsorId = (id: number) =>
    setSponsorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // ---- Admin skins -------------------------------------------------------
  const addSkin = () => {
    const id = `custom:${crypto.randomUUID()}`;
    setSkins((prev) => [
      ...prev,
      {
        id,
        name: `Theme ${prev.length + 1}`,
        background: "#1b1b1b",
        boardBg: "#262626",
        ink: "#f5f5f5",
        muted: "#a3a3a3",
        accent: brand.primaryColour,
        accentInk: "#1b1b1b",
        font: "Georgia, serif",
        backgroundImage: null,
      },
    ]);
    setDefaultTemplate(id);
  };
  const patchSkin = (id: string, patch: Partial<HonourSkin>) =>
    setSkins((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeSkin = (id: string) => {
    setSkins((prev) => prev.filter((s) => s.id !== id));
    if (defaultTemplate === id) setDefaultTemplate("p1");
  };

  const setColourOverride = (key: keyof HonourColourOverrides, v: string) =>
    setColourOverrides((p) => ({ ...p, [key]: v }));

  // Grid-capable boards keyed by id → their selectable column options.
  const gridCatalog: GridCatalogEntry[] = bundle.gridCatalog ?? [];
  const gridById = useMemo(() => new Map(gridCatalog.map((g) => [g.id, g])), [gridCatalog]);

  return {
    settings,
    // Skin / theme
    defaultTemplate,
    setDefaultTemplate,
    skins,
    addSkin,
    patchSkin,
    removeSkin,
    // Global colours + font
    colourOverrides,
    setColourOverride,
    defaultFont,
    setDefaultFont,
    // Kiosk rotation + timings
    sequence,
    seqLabel,
    moveSeq,
    removeSeq,
    addToSeq,
    unusedBoards,
    dwell,
    setDwell,
    speed,
    setSpeed,
    endHold,
    setEndHold,
    // Sponsor advertising
    sponsorStrip,
    setSponsorStrip,
    sponsorSlides,
    setSponsorSlides,
    sponsorSlideEvery,
    setSponsorSlideEvery,
    sponsorSlideStyle,
    setSponsorSlideStyle,
    sponsorIds,
    toggleSponsorId,
    sponsorsLoading: sponsorsQ.isLoading,
    sponsors,
    activeSponsors,
    kioskAds,
    addAd,
    patchAd,
    removeAd,
    // Per-board display
    tunableBoards,
    boardConfigs,
    setConfig,
    gridById,
    skinOptions,
    // Composite boards
    composites,
    sourceBoards,
    addComposite,
    patchComposite,
    removeComposite,
    // Custom grid boards
    customGrids,
    gridCatalog,
    addCustomGrid,
    patchCustomGrid,
    removeCustomGrid,
    // Submit
    error,
    save,
    isSaving: update.isPending,
  };
}

export type HonoursDisplayForm = ReturnType<typeof useHonoursDisplaySettings>;
