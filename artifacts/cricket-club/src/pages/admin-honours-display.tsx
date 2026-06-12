import { useEffect, useMemo, useState } from "react";
import {
  useGetHonourDisplay,
  useUpdateHonourDisplaySettings,
  useGenerateKioskToken,
  useRevokeKioskToken,
  getGetHonourDisplayQueryKey,
  type HonourDisplayBundle,
  type HonourDisplaySettingsUpdate,
  type BoardDisplayConfig,
  type CompositeDef,
  type CompositeColumnRef,
  type DisplayBoard,
  type HonourSkin,
  type HonourColourOverrides,
  type HonourBackground,
  type GridCatalogEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Save,
  Loader2,
  ArrowUp,
  ArrowDown,
  Plus,
  X,
  Tv,
  Copy,
  Check,
  Link2,
  Trash2,
  Columns3,
  Palette,
  Paintbrush,
  Image as ImageIcon,
  Upload,
  Pencil,
  Grid3x3,
} from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { LoadingState, QueryError } from "@/components/data-states";
import { TEMPLATES, isBuiltinSkin } from "@/components/honours-display/types";
import type { TemplateId } from "@/components/honours-display/types";
import { TEXTURES } from "@/components/honours-display/theme";
import { CLIENT_DEFAULT_DISPLAY } from "@/components/honours-display/useApproachingBoard";

// Web-safe title-font stacks an admin can pick per club / skin / board. Kept to
// stacks that don't need a web-font load so they render the same on the TV.
const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Default (skin)", value: "" },
  { label: "Serif — Georgia", value: 'Georgia, "Times New Roman", serif' },
  { label: "Sans — System", value: "system-ui, -apple-system, sans-serif" },
  { label: "Condensed — Arial Narrow", value: '"Arial Narrow", Arial, sans-serif' },
  { label: "Slab — Rockwell", value: 'Rockwell, Georgia, serif' },
  { label: "Mono — Courier", value: '"Courier New", monospace' },
];

const TEXT_SIZES = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
] as const;

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

export default function AdminHonoursDisplay() {
  const qc = useQueryClient();
  const bundleQ = useGetHonourDisplay();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Honour boards display &amp; kiosk</h1>
        <p className="text-muted-foreground mt-1">
          Pick the single skin every honour board renders in, and configure the
          auto-rotating clubroom TV kiosk. These pages are admin-only: the display lives
          at <code>/honours-display</code> and the TV mode opens from a short{" "}
          <code>/tv/&lt;code&gt;</code> link you generate below — easy to type into
          a wall-mounted TV. Each board keeps its natural layout — the skin only
          changes the look.
        </p>
      </div>

      {bundleQ.isError ? (
        <QueryError onRetry={() => bundleQ.refetch()} />
      ) : bundleQ.isLoading ? (
        <LoadingState label="Loading honour display settings…" />
      ) : bundleQ.data ? (
        <SettingsForm
          bundle={bundleQ.data}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: getGetHonourDisplayQueryKey() })
          }
        />
      ) : (
        <QueryError onRetry={() => bundleQ.refetch()} />
      )}
    </div>
  );
}

const TEMPLATE_BLURB: Record<TemplateId, string> = {
  p1: "Carved heritage timber board with gold lettering.",
  p2: "Painted club-colours plaque in navy & gold.",
  p3: "Frosted glass / etched modern panel.",
  p4: "Clean light card — best on small screens.",
  p5: "Broadcast hero styling on black.",
  p6: "Soft, rounded cards on a light backdrop.",
  p7: "App-style flags with bright accents (light).",
  p8: "App-style flags with bright accents (dark).",
};

function SettingsForm({
  bundle,
  onSaved,
}: {
  bundle: HonourDisplayBundle;
  onSaved: () => void;
}) {
  const { boards, settings, brand } = bundle;
  const boardTitle = useMemo(
    () => new Map(boards.map((b) => [b.id, b.title])),
    [boards],
  );

  const [defaultTemplate, setDefaultTemplate] = useState<string>(
    settings.defaultTemplate,
  );
  const [sequence, setSequence] = useState<string[]>(settings.kioskSequence ?? []);
  const [dwell, setDwell] = useState(String(settings.kioskDwellMs));
  const [speed, setSpeed] = useState(String(settings.kioskScrollSpeed));
  const [endHold, setEndHold] = useState(String(settings.kioskEndHoldMs));
  const [boardConfigs, setBoardConfigs] = useState<
    Record<string, BoardDisplayConfig>
  >(settings.boardConfigs ?? {});
  const [composites, setComposites] = useState<CompositeDef[]>(
    settings.composites ?? [],
  );
  const [skins, setSkins] = useState<HonourSkin[]>(settings.skins ?? []);
  const [colourOverrides, setColourOverrides] = useState<HonourColourOverrides>(
    settings.colourOverrides ?? {},
  );
  const [defaultFont, setDefaultFont] = useState<string>(
    settings.defaultFont ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDefaultTemplate(settings.defaultTemplate);
    setSequence(settings.kioskSequence ?? []);
    setDwell(String(settings.kioskDwellMs));
    setSpeed(String(settings.kioskScrollSpeed));
    setEndHold(String(settings.kioskEndHoldMs));
    setBoardConfigs(settings.boardConfigs ?? {});
    setComposites(settings.composites ?? []);
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

  const moveSeq = (idx: number, dir: -1 | 1) => {
    setSequence((prev) => {
      const next = prev.slice();
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  };
  const removeSeq = (idx: number) =>
    setSequence((prev) => prev.filter((_, i) => i !== idx));
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
    for (const c of composites) {
      if (!c.title.trim()) {
        return setError("Every composite board needs a title.");
      }
      if (c.columns.length < 2) {
        return setError(
          `Composite "${c.title || "Untitled"}" needs at least 2 columns.`,
        );
      }
      if (c.columns.some((col) => !col.boardId || !col.heading.trim())) {
        return setError(
          `Composite "${c.title}" has a column missing a source board or heading.`,
        );
      }
    }
    for (const sk of skins) {
      if (!sk.name.trim()) return setError("Every theme needs a name.");
    }
    // Guard against saving a default that points at a deleted custom skin.
    if (
      !isBuiltinSkin(defaultTemplate) &&
      !skins.some((s) => s.id === defaultTemplate)
    ) {
      return setError(
        "The selected default theme no longer exists — pick another.",
      );
    }
    const data: HonourDisplaySettingsUpdate = {
      defaultTemplate,
      kioskSequence: sequence,
      kioskDwellMs: d,
      kioskScrollSpeed: s,
      kioskEndHoldMs: e,
      boardConfigs,
      composites,
      skins,
      colourOverrides: {
        background: colourOverrides.background || null,
        text: colourOverrides.text || null,
        accent: colourOverrides.accent || null,
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
  const realTunable = boards.filter((b) => !b.id.startsWith("composite:"));
  const tunableBoards = realTunable.some((b) => b.id === "approaching")
    ? realTunable
    : [...realTunable, APPROACHING_TUNABLE_BOARD];
  // List-layout boards eligible to be a composite column source (no composites,
  // no approaching — the server refuses both as column refs).
  const sourceBoards = boards.filter(
    (b) =>
      b.layout === "list" &&
      !b.id.startsWith("composite:") &&
      b.id !== "approaching",
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
    setComposites((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  const removeComposite = (id: string) =>
    setComposites((prev) => prev.filter((c) => c.id !== id));

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
        accent: brand.secondaryColour,
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

  // Grid-capable boards keyed by id → their selectable column options.
  const gridCatalog: GridCatalogEntry[] = bundle.gridCatalog ?? [];
  const gridById = useMemo(
    () => new Map(gridCatalog.map((g) => [g.id, g])),
    [gridCatalog],
  );

  return (
    <div className="space-y-6">
      {/* Skin picker — built-ins + admin themes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" /> Skin / theme
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            The one skin every board renders in. Each board still uses its own natural
            layout (premierships, team of the decade, lists) — only the look changes.
            Pick a built-in or author your own theme below.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDefaultTemplate(t.id)}
                className={`text-left border rounded-lg p-3 transition ${
                  defaultTemplate === t.id
                    ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                    : "hover:border-primary/50"
                }`}
                data-testid={`template-${t.id}`}
              >
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {TEMPLATE_BLURB[t.id]}
                </div>
              </button>
            ))}
            {skins.map((sk) => (
              <button
                key={sk.id}
                type="button"
                onClick={() => setDefaultTemplate(sk.id)}
                className={`text-left border rounded-lg p-3 transition ${
                  defaultTemplate === sk.id
                    ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                    : "hover:border-primary/50"
                }`}
                data-testid={`skin-${sk.id}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded-full border"
                    style={{ background: sk.accent }}
                  />
                  <div className="text-sm font-semibold truncate">{sk.name}</div>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Custom theme
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Paintbrush className="h-4 w-4" /> Your themes
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addSkin}
                data-testid="button-add-skin"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New theme
              </Button>
            </div>
            {skins.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No custom themes yet — built-ins p1–p8 are always available.
              </p>
            ) : (
              <div className="space-y-3">
                {skins.map((sk) => (
                  <SkinEditor
                    key={sk.id}
                    skin={sk}
                    isDefault={defaultTemplate === sk.id}
                    onPatch={(patch) => patchSkin(sk.id, patch)}
                    onRemove={() => removeSkin(sk.id)}
                    onSetDefault={() => setDefaultTemplate(sk.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Global colour overrides + default font */}
      <Card>
        <CardHeader>
          <CardTitle>Global colours &amp; font</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Club-wide tweaks layered on top of the active skin. Leave a colour
            blank to keep the skin's own colour. These apply everywhere on the
            display and kiosk.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
            <ColourField
              label="Background"
              value={colourOverrides.background ?? ""}
              onChange={(v) =>
                setColourOverrides((p) => ({ ...p, background: v }))
              }
              testId="override-background"
            />
            <ColourField
              label="Text"
              value={colourOverrides.text ?? ""}
              onChange={(v) => setColourOverrides((p) => ({ ...p, text: v }))}
              testId="override-text"
            />
            <ColourField
              label="Accent"
              value={colourOverrides.accent ?? ""}
              onChange={(v) => setColourOverrides((p) => ({ ...p, accent: v }))}
              testId="override-accent"
            />
          </div>
          <label className="space-y-1 block max-w-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Default title font
            </span>
            <select
              className="w-full px-2 py-1.5 rounded border bg-card text-sm"
              value={defaultFont}
              onChange={(e) => setDefaultFont(e.target.value)}
              data-testid="select-default-font"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      {/* Kiosk config */}
      <Card>
        <CardHeader>
          <CardTitle>TV kiosk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
              Rotation sequence
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Boards shown in order on the clubroom TV. Empty = every board in default order.
            </p>
            <ul className="space-y-1 max-w-2xl">
              {sequence.map((id, idx) => (
                <li
                  key={`${id}-${idx}`}
                  className="flex items-center gap-2 border rounded px-3 py-2 bg-card"
                  data-testid={`seq-row-${idx}`}
                >
                  <span className="text-xs font-mono text-muted-foreground w-5">{idx + 1}</span>
                  <span className="flex-1 text-sm font-medium">
                    {boardTitle.get(id) ?? `${id} (missing)`}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={idx === 0}
                    onClick={() => moveSeq(idx, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={idx === sequence.length - 1}
                    onClick={() => moveSeq(idx, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removeSeq(idx)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
              {sequence.length === 0 && (
                <li className="text-xs text-muted-foreground italic">
                  No sequence set — the kiosk shows every board in default order.
                </li>
              )}
            </ul>
            {unusedBoards.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <select
                  className="px-2 py-1.5 rounded border bg-card text-sm min-w-[14rem]"
                  defaultValue=""
                  onChange={(e) => {
                    addToSeq(e.target.value);
                    e.target.value = "";
                  }}
                  data-testid="add-to-seq"
                >
                  <option value="">Add a board to the sequence…</option>
                  {unusedBoards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
                <Plus className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Dwell before scroll (ms)
              </span>
              <Input
                type="number"
                value={dwell}
                onChange={(e) => setDwell(e.target.value)}
                data-testid="input-dwell"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Scroll speed (px/sec)
              </span>
              <Input
                type="number"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                data-testid="input-speed"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Hold after scroll (ms)
              </span>
              <Input
                type="number"
                value={endHold}
                onChange={(e) => setEndHold(e.target.value)}
                data-testid="input-endhold"
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Per-board display controls */}
      <Card>
        <CardHeader>
          <CardTitle>Per-board display</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Override how each board appears on the display and TV kiosk.
            <strong> Columns</strong> spreads a long list across 2–3 columns.
            <strong> Transition</strong> chooses how tall boards advance on the
            kiosk: <em>scroll</em> credit-rolls the whole board; <em>slide</em>{" "}
            pages through it a screen at a time. <strong>Fit</strong> fills the
            full screen width instead of the narrow centred cap. Expand a board
            to override its heading, text size, density, font, crest and
            background — and, for grid-capable boards, the season-grid columns.
          </p>
          <div className="space-y-2">
            {tunableBoards.map((b) => (
              <BoardConfigEditor
                key={b.id}
                board={b}
                cfg={boardConfigs[b.id]}
                grid={gridById.get(b.id) ?? null}
                onPatch={(patch) => setConfig(b.id, patch)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Composite "columns" boards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Columns3 className="h-5 w-5" /> Composite boards
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Place several existing list boards side-by-side as columns — like the
            club's physical honour board. Add at least two columns; each pulls
            from a list board. Turn on <strong>Season-aligned</strong> to add a
            leading SEASON column and line rows up by season (only works when
            every chosen board is season-based — otherwise it falls back to plain
            side-by-side columns).
          </p>
          <div className="space-y-4">
            {composites.map((c) => (
              <CompositeEditor
                key={c.id}
                composite={c}
                sourceBoards={sourceBoards}
                onPatch={(patch) => patchComposite(c.id, patch)}
                onRemove={() => removeComposite(c.id)}
              />
            ))}
            {composites.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No composite boards yet.
              </p>
            )}
          </div>
          <Button type="button" variant="outline" onClick={addComposite}>
            <Plus className="h-4 w-4 mr-2" /> Add composite board
          </Button>
        </CardContent>
      </Card>

      {error && <div className="text-sm text-destructive">{error}</div>}
      <div className="flex justify-end">
        <Button onClick={save} disabled={update.isPending} data-testid="button-save-honour-display">
          {update.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save settings
        </Button>
      </div>

      <KioskLinkCard token={settings.kioskToken ?? null} onChanged={onSaved} />
    </div>
  );
}

function CompositeEditor({
  composite,
  sourceBoards,
  onPatch,
  onRemove,
}: {
  composite: CompositeDef;
  sourceBoards: DisplayBoard[];
  onPatch: (patch: Partial<CompositeDef>) => void;
  onRemove: () => void;
}) {
  const sourceById = useMemo(
    () => new Map(sourceBoards.map((b) => [b.id, b])),
    [sourceBoards],
  );

  // Season-aligned needs every chosen column to be a season-based list board.
  const seasonEligible =
    composite.columns.length >= 2 &&
    composite.columns.every((col) => {
      const b = sourceById.get(col.boardId);
      return (
        !!b &&
        b.entries.length > 0 &&
        b.entries.every((e) => (e.season ?? "").trim() !== "")
      );
    });

  const setCol = (i: number, patch: Partial<CompositeColumnRef>) =>
    onPatch({
      columns: composite.columns.map((c, idx) =>
        idx === i ? { ...c, ...patch } : c,
      ),
    });
  const addCol = () =>
    onPatch({ columns: [...composite.columns, { boardId: "", heading: "" }] });
  const removeCol = (i: number) =>
    onPatch({ columns: composite.columns.filter((_, idx) => idx !== i) });
  const moveCol = (i: number, dir: -1 | 1) => {
    const next = composite.columns.slice();
    const t = i + dir;
    if (t < 0 || t >= next.length) return;
    [next[i], next[t]] = [next[t]!, next[i]!];
    onPatch({ columns: next });
  };

  return (
    <div
      className="border rounded-lg p-4 space-y-3 bg-muted/30"
      data-testid={`composite-${composite.id}`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 flex-1 min-w-[12rem]">
          <span className="text-xs font-medium text-muted-foreground">Title</span>
          <Input
            value={composite.title}
            placeholder="e.g. Club Captains"
            onChange={(e) => onPatch({ title: e.target.value })}
            data-testid={`composite-title-${composite.id}`}
          />
        </label>
        <label className="space-y-1 flex-1 min-w-[12rem]">
          <span className="text-xs font-medium text-muted-foreground">
            Subtitle (optional)
          </span>
          <Input
            value={composite.subtitle ?? ""}
            onChange={(e) => onPatch({ subtitle: e.target.value })}
            data-testid={`composite-subtitle-${composite.id}`}
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onRemove}
          data-testid={`composite-remove-${composite.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={composite.seasonAligned}
            onChange={(e) => onPatch({ seasonAligned: e.target.checked })}
            data-testid={`composite-seasonaligned-${composite.id}`}
          />
          <span className="text-muted-foreground">Season-aligned</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Transition</span>
          <select
            className="px-2 py-1 rounded border bg-background text-sm"
            value={composite.transition ?? "slide"}
            onChange={(e) =>
              onPatch({ transition: e.target.value as "scroll" | "slide" })
            }
            data-testid={`composite-transition-${composite.id}`}
          >
            <option value="scroll">Scroll</option>
            <option value="slide">Slide</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={composite.fit ?? true}
            onChange={(e) => onPatch({ fit: e.target.checked })}
            data-testid={`composite-fit-${composite.id}`}
          />
          <span className="text-muted-foreground">Full width</span>
        </label>
      </div>

      {composite.seasonAligned && !seasonEligible && (
        <p className="text-xs text-amber-600">
          Season-aligned won't apply until every column is a season-based list
          board — it will fall back to plain side-by-side columns.
        </p>
      )}

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Columns</span>
        {composite.columns.map((col, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground w-5">
              {i + 1}
            </span>
            <select
              className="px-2 py-1.5 rounded border bg-background text-sm min-w-[12rem]"
              value={col.boardId}
              onChange={(e) => {
                const board = sourceById.get(e.target.value);
                setCol(i, {
                  boardId: e.target.value,
                  heading: col.heading || board?.title || "",
                });
              }}
              data-testid={`composite-col-board-${composite.id}-${i}`}
            >
              <option value="">Select a list board…</option>
              {sourceBoards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
            <Input
              className="flex-1 min-w-[10rem]"
              value={col.heading}
              placeholder="Column heading"
              onChange={(e) => setCol(i, { heading: e.target.value })}
              data-testid={`composite-col-heading-${composite.id}-${i}`}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={i === 0}
              onClick={() => moveCol(i, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={i === composite.columns.length - 1}
              onClick={() => moveCol(i, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => removeCol(i)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCol}
          data-testid={`composite-add-col-${composite.id}`}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add column
        </Button>
      </div>
    </div>
  );
}

/** A colour swatch + hex text input pair. Empty value = inherit. */
function ColourField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 rounded border bg-transparent p-0.5"
          data-testid={testId ? `${testId}-swatch` : undefined}
        />
        <Input
          value={value}
          placeholder="inherit"
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
          data-testid={testId}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onChange("")}
            title="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </label>
  );
}

/**
 * Background source picker — none / image URL (with upload) / built-in texture.
 * Emits a HonourBackground (or null to clear).
 */
function BackgroundPicker({
  value,
  onChange,
  testId,
}: {
  value?: HonourBackground | null;
  onChange: (bg: HonourBackground | null) => void;
  testId?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const upload = useUpload({ onError: (e) => setError(e.message) });
  const kind = value?.kind ?? "none";

  const handleFile = async (file: File) => {
    setError(null);
    const r = await upload.uploadFile(file);
    if (r) onChange({ kind: "url", value: `/api/storage${r.objectPath}` });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Background</span>
        <select
          className="px-2 py-1 rounded border bg-background text-sm"
          value={kind}
          onChange={(e) => {
            const k = e.target.value;
            if (k === "none") onChange(null);
            else if (k === "texture")
              onChange({ kind: "texture", value: TEXTURES[0]!.id });
            else onChange({ kind: "url", value: value?.kind === "url" ? value.value : "" });
          }}
          data-testid={testId}
        >
          <option value="none">None</option>
          <option value="url">Image</option>
          <option value="texture">Texture</option>
        </select>
      </div>

      {kind === "url" && (
        <div className="space-y-2">
          <Input
            value={value?.value ?? ""}
            placeholder="https://… or upload below"
            onChange={(e) => onChange({ kind: "url", value: e.target.value })}
            className="text-xs"
            data-testid={testId ? `${testId}-url` : undefined}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs inline-flex items-center gap-1.5 cursor-pointer text-primary">
              <Upload className="h-3.5 w-3.5" />
              {upload.isUploading ? "Uploading…" : "Upload image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                disabled={upload.isUploading}
                onChange={(e) =>
                  e.target.files?.[0] && handleFile(e.target.files[0])
                }
                data-testid={testId ? `${testId}-file` : undefined}
              />
            </label>
            {value?.value && (
              <img
                src={value.value}
                alt="bg preview"
                className="h-8 w-12 object-cover rounded border"
              />
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      {kind === "texture" && (
        <div className="flex flex-wrap gap-2">
          {TEXTURES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange({ kind: "texture", value: t.id })}
              className={`h-10 w-14 rounded border text-[10px] grid place-items-end p-0.5 ${
                value?.value === t.id ? "ring-2 ring-primary" : ""
              }`}
              style={{ background: t.css, backgroundColor: "#e5e5e5" }}
              title={t.label}
              data-testid={testId ? `${testId}-tex-${t.id}` : undefined}
            >
              <span className="bg-background/70 px-1 rounded">{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Editor card for a single admin-authored skin/theme. */
function SkinEditor({
  skin,
  isDefault,
  onPatch,
  onRemove,
  onSetDefault,
}: {
  skin: HonourSkin;
  isDefault: boolean;
  onPatch: (patch: Partial<HonourSkin>) => void;
  onRemove: () => void;
  onSetDefault: () => void;
}) {
  const colours: { key: keyof HonourSkin; label: string }[] = [
    { key: "background", label: "Page background" },
    { key: "boardBg", label: "Board surface" },
    { key: "ink", label: "Text" },
    { key: "muted", label: "Muted text" },
    { key: "accent", label: "Accent" },
    { key: "accentInk", label: "Text on accent" },
  ];
  return (
    <div
      className="border rounded-lg p-4 space-y-3 bg-muted/30"
      data-testid={`skin-editor-${skin.id}`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 flex-1 min-w-[12rem]">
          <span className="text-xs font-medium text-muted-foreground">
            Theme name
          </span>
          <Input
            value={skin.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            data-testid={`skin-name-${skin.id}`}
          />
        </label>
        {isDefault ? (
          <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary font-medium">
            Club default
          </span>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onSetDefault}>
            <Check className="h-3.5 w-3.5 mr-1.5" /> Set default
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onRemove}
          data-testid={`skin-remove-${skin.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {colours.map((c) => (
          <ColourField
            key={c.key}
            label={c.label}
            value={(skin[c.key] as string) ?? ""}
            onChange={(v) => onPatch({ [c.key]: v } as Partial<HonourSkin>)}
            testId={`skin-${skin.id}-${c.key}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Title font
          </span>
          <select
            className="w-full px-2 py-1.5 rounded border bg-card text-sm"
            value={
              FONT_OPTIONS.some((f) => f.value === skin.font)
                ? skin.font
                : "Georgia, serif"
            }
            onChange={(e) => onPatch({ font: e.target.value })}
            data-testid={`skin-font-${skin.id}`}
          >
            {FONT_OPTIONS.filter((f) => f.value).map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
            <option value="Georgia, serif">Georgia (serif)</option>
          </select>
        </label>
        <BackgroundPicker
          value={skin.backgroundImage}
          onChange={(bg) => onPatch({ backgroundImage: bg })}
          testId={`skin-bg-${skin.id}`}
        />
      </div>

      {/* Mini swatch preview of the theme. */}
      <div
        className="rounded-md p-3 flex items-center gap-3"
        style={{ background: skin.background, color: skin.ink }}
      >
        <span
          className="h-8 w-8 rounded-full grid place-items-center text-xs font-bold"
          style={{ background: skin.accent, color: skin.accentInk }}
        >
          HH
        </span>
        <div
          className="flex-1 rounded px-2 py-1.5 text-sm"
          style={{ background: skin.boardBg }}
        >
          <span style={{ fontFamily: skin.font }}>Sample board heading</span>
          <span className="ml-2 text-xs" style={{ color: skin.muted }}>
            subtitle
          </span>
        </div>
      </div>
    </div>
  );
}

/** Expandable per-board styling editor. */
function BoardConfigEditor({
  board,
  cfg,
  grid,
  onPatch,
}: {
  board: DisplayBoard;
  cfg?: BoardDisplayConfig;
  grid: GridCatalogEntry | null;
  onPatch: (patch: Partial<BoardDisplayConfig>) => void;
}) {
  const [open, setOpen] = useState(false);
  const cols = cfg?.columns ?? board.display.columns;
  const transition = cfg?.transition ?? board.display.transition;
  const fit = cfg?.fit ?? board.display.fit;
  const isList = board.layout === "list";
  const logo = cfg?.logo ?? true;
  const gridColumns = cfg?.gridColumns ?? [];

  const toggleGridCol = (key: string) => {
    const next = gridColumns.includes(key)
      ? gridColumns.filter((k) => k !== key)
      : [...gridColumns, key];
    onPatch({ gridColumns: next });
  };

  return (
    <div
      className="border rounded bg-card"
      data-testid={`board-config-${board.id}`}
    >
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 min-w-[12rem] text-left text-sm font-medium flex items-center gap-1.5"
          data-testid={`board-expand-${board.id}`}
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          {board.title}
          {grid && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary">
              <Grid3x3 className="h-3 w-3" />
              {gridColumns.length > 0 ? "grid" : "grid-capable"}
            </span>
          )}
        </button>
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Columns</span>
          <select
            className="px-2 py-1 rounded border bg-background text-sm disabled:opacity-40"
            value={isList ? cols : 1}
            disabled={!isList}
            title={
              isList ? undefined : "Only list boards support multi-column flow"
            }
            onChange={(e) => onPatch({ columns: Number(e.target.value) })}
            data-testid={`board-columns-${board.id}`}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Transition</span>
          <select
            className="px-2 py-1 rounded border bg-background text-sm"
            value={transition}
            onChange={(e) =>
              onPatch({ transition: e.target.value as "scroll" | "slide" })
            }
            data-testid={`board-transition-${board.id}`}
          >
            <option value="scroll">Scroll</option>
            <option value="slide">Slide</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={fit}
            onChange={(e) => onPatch({ fit: e.target.checked })}
            data-testid={`board-fit-${board.id}`}
          />
          <span className="text-muted-foreground">Full width</span>
        </label>
      </div>

      {open && (
        <div className="border-t px-3 py-3 space-y-3 bg-muted/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Heading override
              </span>
              <Input
                value={cfg?.heading ?? ""}
                placeholder={board.title}
                onChange={(e) =>
                  onPatch({ heading: e.target.value || null })
                }
                data-testid={`board-heading-${board.id}`}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Subtitle override
              </span>
              <Input
                value={cfg?.subtitle ?? ""}
                placeholder={board.subtitle ?? "—"}
                onChange={(e) =>
                  onPatch({ subtitle: e.target.value || null })
                }
                data-testid={`board-subtitle-${board.id}`}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Text size</span>
              <select
                className="px-2 py-1 rounded border bg-background text-sm"
                value={cfg?.textSize ?? "md"}
                onChange={(e) =>
                  onPatch({
                    textSize: e.target.value as "sm" | "md" | "lg",
                  })
                }
                data-testid={`board-textsize-${board.id}`}
              >
                {TEXT_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Density</span>
              <select
                className="px-2 py-1 rounded border bg-background text-sm"
                value={cfg?.density ?? "comfortable"}
                onChange={(e) =>
                  onPatch({
                    density: e.target.value as "comfortable" | "compact",
                  })
                }
                data-testid={`board-density-${board.id}`}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Font</span>
              <select
                className="px-2 py-1 rounded border bg-background text-sm"
                value={cfg?.font ?? ""}
                onChange={(e) => onPatch({ font: e.target.value || null })}
                data-testid={`board-font-${board.id}`}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.label} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={logo}
                onChange={(e) => onPatch({ logo: e.target.checked })}
                data-testid={`board-logo-${board.id}`}
              />
              <span className="text-muted-foreground">Show crest</span>
            </label>
          </div>

          <BackgroundPicker
            value={cfg?.background}
            onChange={(bg) => onPatch({ background: bg })}
            testId={`board-bg-${board.id}`}
          />

          {grid && (
            <div className="space-y-1.5 border-t pt-3">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Grid3x3 className="h-3.5 w-3.5" /> Season-grid columns
              </span>
              <p className="text-[11px] text-muted-foreground">
                Pick columns to render this board as a season grid (rows ×
                columns). Leave all unchecked to keep its natural layout.
              </p>
              <div className="flex flex-wrap gap-2">
                {grid.options.map((opt) => {
                  const on = gridColumns.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => toggleGridCol(opt.key)}
                      className={`text-xs px-2 py-1 rounded border transition ${
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:border-primary/50"
                      }`}
                      data-testid={`board-gridcol-${board.id}-${opt.key}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KioskLinkCard({
  token,
  onChanged,
}: {
  token: string | null;
  onChanged: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kioskUrl = useMemo(() => {
    if (!token) return null;
    const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(
      /\/+$/,
      "/",
    );
    return `${base}tv/${encodeURIComponent(token)}`;
  }, [token]);

  const generate = useGenerateKioskToken({
    mutation: {
      onSuccess: () => {
        setError(null);
        setCopied(false);
        onChanged();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });
  const revoke = useRevokeKioskToken({
    mutation: {
      onSuccess: () => {
        setError(null);
        setCopied(false);
        onChanged();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });
  const busy = generate.isPending || revoke.isPending;

  const copy = async () => {
    if (!kioskUrl) return;
    try {
      await navigator.clipboard.writeText(kioskUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the link and copy it manually.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tv className="h-5 w-5" /> Clubroom TV link
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Generate a private <strong>short link</strong> that loads <em>only</em>{" "}
          the rotating kiosk — no admin sign-in needed. It's a brief{" "}
          <code>/tv/&lt;code&gt;</code> address that's easy to type straight into a
          wall-mounted TV or Raspberry Pi browser (it auto-runs the rotation). The
          link doesn't expose any other admin page. Revoke it any time to stop a
          lost or shared link working.
        </p>

        {token && kioskUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={kioskUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
                data-testid="input-kiosk-url"
              />
              <Button
                type="button"
                variant="outline"
                onClick={copy}
                data-testid="button-copy-kiosk-url"
              >
                {copied ? (
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => generate.mutate()}
                data-testid="button-regenerate-kiosk-token"
              >
                {generate.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Regenerate link
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => revoke.mutate()}
                data-testid="button-revoke-kiosk-token"
              >
                {revoke.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Revoke link
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Regenerating or revoking immediately stops the current link from
              working — re-open the kiosk on the TV with the new link afterwards.
            </p>
          </div>
        ) : (
          <Button
            type="button"
            disabled={busy}
            onClick={() => generate.mutate()}
            data-testid="button-generate-kiosk-token"
          >
            {generate.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4 mr-2" />
            )}
            Generate kiosk link
          </Button>
        )}

        {error && <div className="text-sm text-destructive">{error}</div>}
      </CardContent>
    </Card>
  );
}
