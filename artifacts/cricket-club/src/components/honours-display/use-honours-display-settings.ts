import { useCallback, useEffect, useMemo, useState } from "react";
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
  type KioskPhotoSlideshow,
  type KioskLook,
  type CustomGridDef,
} from "@workspace/api-client-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { TEMPLATES, isBuiltinSkin } from "./types";
import { CLIENT_DEFAULT_DISPLAY } from "./use-approaching-board";
import type { SkinOption } from "./editors/constants";
import {
  isListLikeLayout,
  resolveClubLook,
  resolveKioskDisplay,
  type KioskLookSource,
} from "@workspace/scorecard/kiosk-display";
import { duplicateItem, moveItem } from "./settings/rotation-list";
import { withoutMotion } from "./settings/tv-motion-fields";

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

type HonoursDisplaySettings = HonourDisplayBundle["settings"];

/** The form's draft fields, seeded from the saved settings. */
function seedDraft(settings: HonoursDisplaySettings) {
  return {
    defaultTemplate: settings.defaultTemplate,
    sequence: settings.kioskSequence ?? [],
    dwell: String(settings.kioskDwellMs),
    speed: String(settings.kioskScrollSpeed),
    endHold: String(settings.kioskEndHoldMs),
    kioskLook: settings.kioskLook ?? {},
    sponsorStrip: settings.kioskSponsorStrip,
    sponsorSlides: settings.kioskSponsorSlides,
    sponsorSlideEvery: String(settings.kioskSponsorSlideEvery),
    sponsorSlideStyle: (settings.kioskSponsorSlideStyle ?? "grid") as SponsorSlideStyle,
    sponsorIds: settings.kioskSponsorIds ?? [],
    kioskAds: settings.kioskAds ?? [],
    slideshows: settings.kioskPhotoSlideshows ?? [],
    boardConfigs: settings.boardConfigs ?? {},
    composites: settings.composites ?? [],
    customGrids: settings.customGrids ?? [],
    skins: settings.skins ?? [],
    colourOverrides: settings.colourOverrides ?? {},
    defaultFont: settings.defaultFont ?? "",
  };
}
type HonoursDisplayDraft = ReturnType<typeof seedDraft>;

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
  const { boards: bundleBoards, settings, brand } = bundle;
  // Boards the rotation can hold. The TV adds the client-built approaching
  // board after the rest, so it can be placed here too.
  const boards = useMemo(
    () =>
      bundleBoards.some((b) => b.id === "approaching")
        ? bundleBoards
        : [...bundleBoards, APPROACHING_TUNABLE_BOARD],
    [bundleBoards],
  );
  const boardTitle = useMemo(() => new Map(boards.map((b) => [b.id, b.title])), [boards]);

  // The loaded values every field starts from; Reset returns to them and the
  // save bar compares the draft against them.
  const seeded = useMemo(() => seedDraft(settings), [settings]);

  const [defaultTemplate, setDefaultTemplate] = useState<string>(seeded.defaultTemplate);
  const [sequence, setSequence] = useState<string[]>(seeded.sequence);
  const [dwell, setDwell] = useState(seeded.dwell);
  const [speed, setSpeed] = useState(seeded.speed);
  const [endHold, setEndHold] = useState(seeded.endHold);
  const [kioskLook, setKioskLook] = useState<KioskLook>(seeded.kioskLook);
  const [sponsorStrip, setSponsorStrip] = useState(seeded.sponsorStrip);
  const [sponsorSlides, setSponsorSlides] = useState(seeded.sponsorSlides);
  const [sponsorSlideEvery, setSponsorSlideEvery] = useState(seeded.sponsorSlideEvery);
  const [sponsorSlideStyle, setSponsorSlideStyle] = useState<SponsorSlideStyle>(
    seeded.sponsorSlideStyle,
  );
  const [sponsorIds, setSponsorIds] = useState<number[]>(seeded.sponsorIds);
  const [kioskAds, setKioskAds] = useState<KioskAd[]>(seeded.kioskAds);
  const [slideshows, setSlideshows] = useState<KioskPhotoSlideshow[]>(seeded.slideshows);
  const [boardConfigs, setBoardConfigs] = useState<Record<string, BoardDisplayConfig>>(
    seeded.boardConfigs,
  );
  const [composites, setComposites] = useState<CompositeDef[]>(seeded.composites);
  const [customGrids, setCustomGrids] = useState<CustomGridDef[]>(seeded.customGrids);
  const [skins, setSkins] = useState<HonourSkin[]>(seeded.skins);
  const [colourOverrides, setColourOverrides] = useState<HonourColourOverrides>(
    seeded.colourOverrides,
  );
  const [defaultFont, setDefaultFont] = useState<string>(seeded.defaultFont);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setDefaultTemplate(seeded.defaultTemplate);
    setSequence(seeded.sequence);
    setDwell(seeded.dwell);
    setSpeed(seeded.speed);
    setEndHold(seeded.endHold);
    setKioskLook(seeded.kioskLook);
    setSponsorStrip(seeded.sponsorStrip);
    setSponsorSlides(seeded.sponsorSlides);
    setSponsorSlideEvery(seeded.sponsorSlideEvery);
    setSponsorSlideStyle(seeded.sponsorSlideStyle);
    setSponsorIds(seeded.sponsorIds);
    setKioskAds(seeded.kioskAds);
    setSlideshows(seeded.slideshows);
    setBoardConfigs(seeded.boardConfigs);
    setComposites(seeded.composites);
    setCustomGrids(seeded.customGrids);
    setSkins(seeded.skins);
    setColourOverrides(seeded.colourOverrides);
    setDefaultFont(seeded.defaultFont);
    setError(null);
  }, [seeded]);

  // Re-seed whenever the server bundle changes (e.g. after a save refetch).
  useEffect(reset, [reset]);

  const draft: HonoursDisplayDraft = {
    defaultTemplate,
    sequence,
    dwell,
    speed,
    endHold,
    kioskLook,
    sponsorStrip,
    sponsorSlides,
    sponsorSlideEvery,
    sponsorSlideStyle,
    sponsorIds,
    kioskAds,
    slideshows,
    boardConfigs,
    composites,
    customGrids,
    skins,
    colourOverrides,
    defaultFont,
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(seeded);

  // ---- Live preview (B4) -------------------------------------------------
  // The settings as the TV would get them if saved now. A number field that
  // doesn't parse yet keeps its saved value rather than breaking the preview.
  const num = (v: string, saved: number) => {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? saved : n;
  };
  const draftSettings = (): HonoursDisplaySettings => ({
    ...settings,
    defaultTemplate,
    kioskSequence: sequence,
    kioskDwellMs: num(dwell, settings.kioskDwellMs),
    kioskScrollSpeed: num(speed, settings.kioskScrollSpeed),
    kioskEndHoldMs: num(endHold, settings.kioskEndHoldMs),
    kioskLook,
    kioskSponsorStrip: sponsorStrip,
    kioskSponsorSlides: sponsorSlides,
    kioskSponsorSlideEvery: num(sponsorSlideEvery, settings.kioskSponsorSlideEvery),
    kioskSponsorSlideStyle: sponsorSlideStyle,
    kioskSponsorIds: sponsorIds,
    kioskAds,
    kioskPhotoSlideshows: slideshows,
    boardConfigs,
    composites,
    customGrids,
    skins,
    colourOverrides,
    defaultFont: defaultFont || null,
  });
  /** The bundle the preview plays: the whole rotation, or just one item. */
  const previewBundle = (token: string | null): HonourDisplayBundle => {
    const draftSet = draftSettings();
    return {
      ...bundle,
      settings: token
        ? { ...draftSet, kioskSequence: [token], kioskSponsorSlides: false }
        : draftSet,
    };
  };

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

  // Rotation builder (B2). An empty sequence plays every board in order, so
  // the first edit starts from that implied list rather than from nothing.
  const editSeq = (fn: (list: string[]) => string[]) =>
    setSequence((prev) => fn(prev.length ? prev : boards.map((b) => b.id)));
  const moveSeqTo = (from: number, to: number) => setSequence((prev) => moveItem(prev, from, to));
  const moveSeq = (idx: number, dir: -1 | 1) => moveSeqTo(idx, idx + dir);
  const duplicateSeq = (idx: number) => setSequence((prev) => duplicateItem(prev, idx));
  const removeSeq = (idx: number) => setSequence((prev) => prev.filter((_, i) => i !== idx));
  const addToSeq = (id: string) => {
    if (id) editSeq((list) => [...list, id]);
  };
  const startSeqFromAllBoards = () => editSeq((list) => list);

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
    for (const sh of slideshows) {
      if (!sh.name.trim()) return setError("Every photo slideshow needs a name.");
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
      kioskLook,
      kioskSponsorStrip: sponsorStrip,
      kioskSponsorSlides: sponsorSlides,
      kioskSponsorSlideEvery: safeEvery,
      kioskSponsorSlideStyle: sponsorSlideStyle,
      kioskSponsorIds: sponsorIds,
      kioskAds,
      kioskPhotoSlideshows: slideshows,
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

  const boardById = useMemo(() => new Map(boards.map((b) => [b.id, b])), [boards]);

  // Boards an admin can tune (real boards + approaching), excluding composites
  // which carry their own transition/fit on the composite definition. The
  // approaching board is client-only, so append it as a synthetic row unless the
  // bundle somehow already carries one.
  // Custom grids are configured in their own builder (skin/fill/footnote live on
  // the definition), so exclude them from the generic per-board tuner too.
  const tunableBoards = boards.filter(
    (b) => !b.id.startsWith("composite:") && !b.id.startsWith("grid:"),
  );

  // Skin choices for the per-board / per-grid skin selects (built-ins + custom).
  const skinOptions: SkinOption[] = [
    ...TEMPLATES.map((t) => ({ value: t.id, label: t.label })),
    ...skins.map((s) => ({ value: s.id, label: s.name })),
  ];

  // Resolve a sequence item to a display label (boards + sponsor/ad tokens).
  const seqLabel = (id: string): string => {
    if (id === "sponsor") return "Sponsor wall";
    if (id.startsWith("ad:")) {
      const ad = kioskAds.find((a) => a.id === id);
      return ad ? ad.name || "Untitled ad" : "Missing ad";
    }
    if (id.startsWith("photos:")) {
      const sh = slideshows.find((x) => x.id === id);
      return sh ? sh.name || "Untitled slideshow" : "Missing slideshow";
    }
    return boardTitle.get(id) ?? `${id} (missing)`;
  };
  // List-layout boards eligible to be a composite column source (no composites,
  // no approaching — the server refuses both as column refs).
  const sourceBoards = boards.filter(
    (b) => isListLikeLayout(b.layout) && !b.id.startsWith("composite:") && b.id !== "approaching",
  );

  const setConfig = (id: string, patch: Partial<BoardDisplayConfig>) =>
    setBoardConfigs((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // ---- TV look (B3) ------------------------------------------------------
  // The club's TV defaults as the TV resolves them: the saved look, then the
  // legacy kiosk timings, then built-ins.
  const lookSource = (look: KioskLook): KioskLookSource => ({
    kioskLook: look,
    kioskDwellMs: Number(dwell),
    kioskEndHoldMs: Number(endHold),
    kioskScrollSpeed: Number(speed),
  });
  const resolveLook = (look: KioskLook) => resolveClubLook(lookSource(look));
  const clubLook = resolveLook(kioskLook);
  const patchLook = (patch: KioskLook) => setKioskLook((prev) => ({ ...prev, ...patch }));
  const resetLook = () => setKioskLook({});
  // One board's TV settings over the club look; Reset keeps its content and
  // style settings (heading, skin, …) and clears only the motion fields.
  const resolveBoard = (board: DisplayBoard, cfg: BoardDisplayConfig) =>
    resolveKioskDisplay(board, cfg, clubLook);
  const resetBoardMotion = (id: string) =>
    setBoardConfigs((prev) => {
      if (!prev[id]) return prev;
      const { top: _top, ...rest } = withoutMotion(prev[id]);
      return { ...prev, [id]: rest };
    });

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

  // ---- Photo slideshows (D2) --------------------------------------------
  /**
   * Add a slideshow with sensible defaults and place it at the end of the
   * rotation. The "recent" preset is the plan's one-click Recent moments: the
   * last 21 days from both libraries, random.
   */
  const addSlideshow = (preset: "default" | "recent" = "default") => {
    const id = `photos:${crypto.randomUUID()}`;
    setSlideshows((prev) => [
      ...prev,
      {
        id,
        name:
          preset === "recent"
            ? "Recent moments"
            : prev.length
              ? `Photos ${prev.length + 1}`
              : "Club photos",
        library: preset === "recent" ? "both" : "senior",
        source: preset === "recent" ? "recent" : "all",
        recentDays: preset === "recent" ? 21 : null,
        types: null,
        grades: null,
        order: "random",
        perPass: 10,
        secondsPerPhoto: 6,
        captions: true,
      },
    ]);
    editSeq((list) => [...list, id]);
    return id;
  };
  const patchSlideshow = (id: string, patch: Partial<KioskPhotoSlideshow>) =>
    setSlideshows((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeSlideshow = (id: string) => {
    setSlideshows((prev) => prev.filter((x) => x.id !== id));
    setSequence((prev) => prev.filter((s) => s !== id));
    // Boards that took their photo background from it go back to none.
    setBoardConfigs((prev) => {
      const next = { ...prev };
      for (const [boardId, cfg] of Object.entries(prev)) {
        if (cfg.photoBackground?.slideshowId === id) {
          next[boardId] = { ...cfg, photoBackground: null };
        }
      }
      return next;
    });
  };
  /** Photos the server picked for each saved slideshow (an unsaved one has none yet). */
  const slideshowPhotoCount = useMemo(
    () => new Map((bundle.photoSlideshows ?? []).map((x) => [x.id, x.photos.length])),
    [bundle.photoSlideshows],
  );

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
    moveSeqTo,
    duplicateSeq,
    removeSeq,
    addToSeq,
    startSeqFromAllBoards,
    boards,
    boardById,
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
    // Photo slideshows
    slideshows,
    addSlideshow,
    patchSlideshow,
    removeSlideshow,
    slideshowPhotoCount,
    // TV look + per-board TV settings
    kioskLook,
    clubLook,
    resolveLook,
    patchLook,
    resetLook,
    resolveBoard,
    resetBoardMotion,
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
    // Live preview
    previewBundle,
    // Submit
    error,
    save,
    reset,
    dirty,
    isSaving: update.isPending,
  };
}

export type HonoursDisplayForm = ReturnType<typeof useHonoursDisplaySettings>;
