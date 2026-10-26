/**
 * Full draft editor, stages 4 and 5: a result's performance lists. Added
 * from the Fields panel they ask straight away whose, how many and sorted
 * how, and start unfiltered when skipped (D4); the list settings choose the
 * same, and which performances count.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  pageRepeat,
  templateDocumentErrors,
  type RowsPick,
} from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
import { FieldsPanel } from "../fields-panel";
import { RowsPanel } from "../rows-panel";
import { rowsLayer, setRowsPick } from "../template-ops";
import type { EditorDoc } from "../document";

afterEach(cleanup);

const added = (repeat: string): FreeLayer =>
  rowsLayer(pageRepeat("matchSummary", "result", repeat)!, "square");

/** The list's pick after the panel's last edit. */
const lastPick = (onEdit: ReturnType<typeof vi.fn>): RowsPick | undefined =>
  (onEdit.mock.calls.at(-1)![0] as EditorDoc).layers![0].rows!.pick;

const v2Errors = (layer: FreeLayer) =>
  templateDocumentErrors(
    JSON.parse(JSON.stringify({ formatVersion: 2, pages: { result: { layers: [layer] } } })),
    "matchSummary",
  );

function panel(layer: FreeLayer, clubLabel?: string) {
  const onEdit = vi.fn();
  render(
    <RowsPanel
      doc={{ layers: [layer] }}
      layer={layer}
      kind="matchSummary"
      page="result"
      size="square"
      clubLabel={clubLabel}
      onEdit={onEdit}
    />,
  );
  return onEdit;
}

describe("adding a performance list", () => {
  it("starts as a name and its runs or figures, unfiltered (D4)", () => {
    const batting = added("performances.batting");
    expect(batting.rows!.cells.map((c) => c.field)).toEqual(["name", "runs"]);
    expect(batting.rows!.pick).toBeUndefined();
    expect(v2Errors(batting)).toEqual([]);
    const bowling = added("performances.bowling");
    expect(bowling.rows!.cells.map((c) => c.field)).toEqual(["name", "figures"]);
    expect(bowling.rows!.pick).toBeUndefined();
  });

  it("an innings list starts as a name and figures, with no choice (every row)", () => {
    const innings = added("innings1.bowling");
    expect(innings.rows!.cells.map((c) => c.field)).toEqual(["name", "figures"]);
    expect(innings.rows!.pick).toBeUndefined();
  });

  it("setRowsPick merges a change and removes an emptied choice", () => {
    const innings = added("innings1.batting");
    const doc = setRowsPick({ layers: [innings] }, innings.id, { count: 1 });
    expect(doc.layers![0].rows!.pick).toEqual({ count: 1 });
    const cleared = setRowsPick(doc, innings.id, { count: undefined });
    expect(cleared.layers![0].rows!.pick).toBeUndefined();
  });
});

describe("the list settings' row choice", () => {
  it("names the list and shows an unfiltered list as both teams, all, scorecard order", () => {
    panel(added("performances.batting"), "HHCC");
    expect(screen.getByText("Performances: batting")).toBeTruthy();
    expect(screen.getByRole("button", { name: "HHCC", pressed: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Both", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All", pressed: true })).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement).value).toBe("");
  });

  it("shows a saved choice without a side as both teams", () => {
    const layer = added("performances.batting");
    panel({ ...layer, rows: { ...layer.rows!, pick: { count: 3, sort: "runs" } } }, "HHCC");
    expect(screen.getByRole("button", { name: "Both", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Top 3", pressed: true })).toBeTruthy();
  });

  it("switches whose performances show", () => {
    const onEdit = panel(added("performances.batting"));
    fireEvent.click(screen.getByRole("button", { name: "Opposition" }));
    expect(lastPick(onEdit)).toEqual({ side: "opposition" });
    // Without a short name the club's button reads "Club".
    fireEvent.click(screen.getByRole("button", { name: "Club" }));
    expect(lastPick(onEdit)).toEqual({ side: "club" });
  });

  it("chooses how many: the best, all, or a number", () => {
    const layer = added("performances.bowling");
    const onEdit = panel(layer);
    fireEvent.click(screen.getByRole("button", { name: "Best" }));
    expect(lastPick(onEdit)).toEqual({ count: 1 });
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(lastPick(onEdit)?.count).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Number of rows" }), {
      target: { value: "7" },
    });
    expect(lastPick(onEdit)?.count).toBe(7);
    // Capped at 30.
    fireEvent.change(screen.getByRole("spinbutton", { name: "Number of rows" }), {
      target: { value: "99" },
    });
    expect(lastPick(onEdit)?.count).toBe(30);
    const next = (onEdit.mock.calls.at(-1)![0] as EditorDoc).layers![0];
    expect(v2Errors(next)).toEqual([]);
  });

  it("sorts by each stat's own measures, or keeps scorecard order", () => {
    const onEdit = panel(added("performances.batting"));
    const sort = screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement;
    expect([...sort.options].map((o) => o.text)).toEqual([
      "Scorecard order",
      "Runs",
      "Balls faced",
      "Strike rate",
    ]);
    fireEvent.change(sort, { target: { value: "strikeRate" } });
    expect(lastPick(onEdit)).toEqual({ sort: "strikeRate" });
    cleanup();
    const layer = added("performances.bowling");
    const onBowl = panel({ ...layer, rows: { ...layer.rows!, pick: { sort: "economy" } } });
    const bowlSort = screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement;
    expect([...bowlSort.options].map((o) => o.text)).toEqual([
      "Scorecard order",
      "Wickets",
      "Economy",
    ]);
    expect(bowlSort.value).toBe("economy");
    fireEvent.change(bowlSort, { target: { value: "" } });
    expect(lastPick(onBowl)).toBeUndefined();
  });

  it("shows stage 4's figures sort as wickets", () => {
    const layer = added("performances.bowling");
    panel({ ...layer, rows: { ...layer.rows!, pick: { sort: "figures" } } });
    expect((screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement).value).toBe(
      "wickets",
    );
  });

  it("filters a batting list by runs and not outs, a bowling list by wickets", () => {
    const onEdit = panel(added("performances.batting"));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum runs" }), {
      target: { value: "50" },
    });
    expect(lastPick(onEdit)).toEqual({ minRuns: 50 });
    fireEvent.click(screen.getByRole("checkbox", { name: "Not outs only" }));
    expect(lastPick(onEdit)).toEqual({ notOutOnly: true });
    expect(screen.queryByRole("spinbutton", { name: "Minimum wickets" })).toBeNull();
    cleanup();
    const bowling = added("performances.bowling");
    const onBowl = panel(bowling);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum wickets" }), {
      target: { value: "99" },
    });
    // Capped at 10, and valid as saved.
    expect(lastPick(onBowl)).toEqual({ minWickets: 10 });
    const next = (onBowl.mock.calls.at(-1)![0] as EditorDoc).layers![0];
    expect(v2Errors(next)).toEqual([]);
    expect(screen.queryByRole("checkbox", { name: "Not outs only" })).toBeNull();
  });

  it("clears a minimum when emptied", () => {
    const layer = added("performances.batting");
    const onEdit = panel({ ...layer, rows: { ...layer.rows!, pick: { minRuns: 30, count: 2 } } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum runs" }), {
      target: { value: "" },
    });
    expect(lastPick(onEdit)).toEqual({ count: 2 });
  });

  it("an innings list has no Whose; another list has no row choice", () => {
    panel(added("innings2.batting"));
    expect(screen.queryByRole("group", { name: "Whose" })).toBeNull();
    expect(screen.getByRole("button", { name: "All", pressed: true })).toBeTruthy();
    cleanup();
    panel(added("innings2.pairs"));
    expect(screen.queryByRole("group", { name: "Which rows" })).toBeNull();
  });
});

describe("the add chooser (D4)", () => {
  function fields() {
    const onAdd = vi.fn();
    render(
      <FieldsPanel
        kind="matchSummary"
        page="result"
        size="square"
        values={{ "club.short": "HHCC" }}
        textSelected={false}
        onInsert={vi.fn()}
        onAdd={onAdd}
      />,
    );
    return onAdd;
  }
  const added = (onAdd: ReturnType<typeof vi.fn>) => onAdd.mock.calls.at(-1)![0] as FreeLayer;

  it("asks whose, how many and sort before adding a performance list", () => {
    const onAdd = fields();
    fireEvent.click(screen.getByRole("button", { name: /Performances: batting/ }));
    expect(onAdd).not.toHaveBeenCalled();
    const chooser = screen.getByRole("group", { name: "Set up Performances: batting" });
    expect(chooser).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "HHCC" }));
    fireEvent.click(screen.getByRole("button", { name: "Best" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), {
      target: { value: "runs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add list" }));
    const layer = added(onAdd);
    expect(layer.rows!.repeat).toBe("performances.batting");
    expect(layer.rows!.pick).toEqual({ side: "club", count: 1, sort: "runs" });
    expect(v2Errors(layer)).toEqual([]);
    // The chooser closes once the list is added.
    expect(screen.queryByRole("group", { name: "Set up Performances: batting" })).toBeNull();
  });

  it("adds the list unfiltered when skipped", () => {
    const onAdd = fields();
    fireEvent.click(screen.getByRole("button", { name: /Performances: bowling/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skip, show all" }));
    expect(added(onAdd).rows!.pick).toBeUndefined();
    expect(added(onAdd).rows!.repeat).toBe("performances.bowling");
  });

  it("adds an innings list straight away", () => {
    const onAdd = fields();
    fireEvent.click(screen.getByRole("button", { name: /Innings 1 batting/ }));
    expect(added(onAdd).rows!.repeat).toBe("innings1.batting");
    expect(screen.queryByRole("group", { name: /Set up/ })).toBeNull();
  });
});
