import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { HonoursDisplayForm } from "../use-honours-display-settings";

/** TV kiosk rotation sequence + scroll timings. */
export function KioskSection({ form }: { form: HonoursDisplayForm }) {
  const {
    sequence,
    seqLabel,
    moveSeq,
    removeSeq,
    addToSeq,
    unusedBoards,
    kioskAds,
    dwell,
    setDwell,
    speed,
    setSpeed,
    endHold,
    setEndHold,
  } = form;
  return (
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
                  {seqLabel(id)}
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {unusedBoards.length > 0 && (
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
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addToSeq("sponsor")}
              data-testid="add-sponsor-to-seq"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Sponsor slide
            </Button>
            {kioskAds.length > 0 && (
              <select
                className="px-2 py-1.5 rounded border bg-card text-sm"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) addToSeq(e.target.value);
                  e.target.value = "";
                }}
                data-testid="add-ad-to-seq"
              >
                <option value="">Place an ad…</option>
                {kioskAds.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || "Untitled ad"}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            You can drop a sponsor slide or an ad creative anywhere in the
            order. The same sponsor slide / ad can appear more than once.
          </p>
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
  );
}
