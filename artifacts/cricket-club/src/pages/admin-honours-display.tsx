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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { LoadingState, QueryError } from "@/components/data-states";
import { TEMPLATES } from "@/components/honours-display/types";
import type { TemplateId } from "@/components/honours-display/types";
import { CLIENT_DEFAULT_DISPLAY } from "@/components/honours-display/useApproachingBoard";

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
          at <code>/honours-display</code> and the TV mode at{" "}
          <code>/honours-display/kiosk</code>. Each board keeps its natural layout — the
          skin only changes the look.
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
  const { boards, settings } = bundle;
  const boardTitle = useMemo(
    () => new Map(boards.map((b) => [b.id, b.title])),
    [boards],
  );

  const [defaultTemplate, setDefaultTemplate] = useState<TemplateId>(
    settings.defaultTemplate as TemplateId,
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDefaultTemplate(settings.defaultTemplate as TemplateId);
    setSequence(settings.kioskSequence ?? []);
    setDwell(String(settings.kioskDwellMs));
    setSpeed(String(settings.kioskScrollSpeed));
    setEndHold(String(settings.kioskEndHoldMs));
    setBoardConfigs(settings.boardConfigs ?? {});
    setComposites(settings.composites ?? []);
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
    const data: HonourDisplaySettingsUpdate = {
      defaultTemplate,
      kioskSequence: sequence,
      kioskDwellMs: d,
      kioskScrollSpeed: s,
      kioskEndHoldMs: e,
      boardConfigs,
      composites,
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

  return (
    <div className="space-y-6">
      {/* Single skin picker */}
      <Card>
        <CardHeader>
          <CardTitle>Skin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            The one skin every board renders in. Each board still uses its own natural
            layout (premierships, team of the decade, lists) — only the look changes.
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
          </div>
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
            full screen width instead of the narrow centred cap.
          </p>
          <div className="space-y-1.5">
            {tunableBoards.map((b) => {
              const cfg = boardConfigs[b.id];
              const cols = cfg?.columns ?? b.display.columns;
              const transition = cfg?.transition ?? b.display.transition;
              const fit = cfg?.fit ?? b.display.fit;
              const isList = b.layout === "list";
              return (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center gap-3 border rounded px-3 py-2 bg-card"
                  data-testid={`board-config-${b.id}`}
                >
                  <span className="flex-1 min-w-[12rem] text-sm font-medium">
                    {b.title}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Columns</span>
                    <select
                      className="px-2 py-1 rounded border bg-background text-sm disabled:opacity-40"
                      value={isList ? cols : 1}
                      disabled={!isList}
                      title={
                        isList
                          ? undefined
                          : "Only list boards support multi-column flow"
                      }
                      onChange={(e) =>
                        setConfig(b.id, { columns: Number(e.target.value) })
                      }
                      data-testid={`board-columns-${b.id}`}
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
                        setConfig(b.id, {
                          transition: e.target.value as "scroll" | "slide",
                        })
                      }
                      data-testid={`board-transition-${b.id}`}
                    >
                      <option value="scroll">Scroll</option>
                      <option value="slide">Slide</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={fit}
                      onChange={(e) =>
                        setConfig(b.id, { fit: e.target.checked })
                      }
                      data-testid={`board-fit-${b.id}`}
                    />
                    <span className="text-muted-foreground">Full width</span>
                  </label>
                </div>
              );
            })}
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
    return `${base}honours-display/kiosk?token=${encodeURIComponent(token)}`;
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
          Generate a private link that loads <em>only</em> the rotating kiosk —
          no admin sign-in needed. Open it on a wall-mounted TV or Raspberry Pi
          browser (it auto-runs the rotation). The link doesn't expose any other
          admin page. Revoke it any time to stop a lost or shared link working.
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
