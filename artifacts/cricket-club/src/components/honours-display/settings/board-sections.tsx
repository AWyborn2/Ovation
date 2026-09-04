import { Columns3, Grid3x3, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BoardConfigEditor, CompositeEditor, CustomGridEditor } from "../editors";
import type { HonoursDisplayForm } from "../use-honours-display-settings";

/** Per-board display overrides (columns, transition, fit, heading, skin, …). */
export function PerBoardSection({ form }: { form: HonoursDisplayForm }) {
  const { tunableBoards, boardConfigs, gridById, skinOptions, setConfig } = form;
  return (
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
              skinOptions={skinOptions}
              onPatch={(patch) => setConfig(b.id, patch)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Composite "columns" boards built from existing list boards. */
export function CompositeSection({ form }: { form: HonoursDisplayForm }) {
  const { composites, sourceBoards, addComposite, patchComposite, removeComposite } =
    form;
  return (
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
  );
}

/** Custom grid boards (season × freely chosen columns). */
export function CustomGridSection({ form }: { form: HonoursDisplayForm }) {
  const {
    customGrids,
    gridCatalog,
    skinOptions,
    addCustomGrid,
    patchCustomGrid,
    removeCustomGrid,
  } = form;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Grid3x3 className="h-5 w-5" /> Custom grid boards
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Build a season-grid board like a real honour board: the season runs
          down the left and each column is a title/award you choose. Columns can
          pull from committee offices, awards, grade captains or premierships —
          or be typed in by hand. Set a season range to pre-list blank future
          seasons, add a footnote, pick a skin, and choose how it fills the TV.
        </p>
        <div className="space-y-4">
          {customGrids.map((g) => (
            <CustomGridEditor
              key={g.id}
              gridDef={g}
              catalog={gridCatalog}
              skinOptions={skinOptions}
              onPatch={(patch) => patchCustomGrid(g.id, patch)}
              onRemove={() => removeCustomGrid(g.id)}
            />
          ))}
          {customGrids.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No custom grid boards yet.
            </p>
          )}
        </div>
        <Button type="button" variant="outline" onClick={addCustomGrid}>
          <Plus className="h-4 w-4 mr-2" /> Add custom grid board
        </Button>
      </CardContent>
    </Card>
  );
}
