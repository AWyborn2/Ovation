import { useEffect, useMemo, useState } from "react";
import {
  useGetHonourDisplay,
  useUpdateHonourDisplaySettings,
  getGetHonourDisplayQueryKey,
  type HonourDisplayBundle,
  type HonourDisplaySettingsUpdate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, Loader2, ArrowUp, ArrowDown, Plus, X } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { LoadingState, QueryError } from "@/components/data-states";
import { TEMPLATES } from "@/components/honours-display/types";
import type { TemplateId } from "@/components/honours-display/types";

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
  p7: "App-style flags with bright accents.",
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDefaultTemplate(settings.defaultTemplate as TemplateId);
    setSequence(settings.kioskSequence ?? []);
    setDwell(String(settings.kioskDwellMs));
    setSpeed(String(settings.kioskScrollSpeed));
    setEndHold(String(settings.kioskEndHoldMs));
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
    const data: HonourDisplaySettingsUpdate = {
      defaultTemplate,
      kioskSequence: sequence,
      kioskDwellMs: d,
      kioskScrollSpeed: s,
      kioskEndHoldMs: e,
    };
    update.mutate({ data });
  };

  const unusedBoards = boards.filter((b) => !sequence.includes(b.id));

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
    </div>
  );
}
