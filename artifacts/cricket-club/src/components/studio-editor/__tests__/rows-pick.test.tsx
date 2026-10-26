/**
 * Full draft editor, stage 4: a result's performance lists. Added from the
 * Fields panel they start as the club's top three (D4); the list settings
 * choose whose, how many and sorted how.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  pageRepeat,
  templateDocumentErrors,
  type RowsPick,
} from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
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
  it("starts as a name and its runs, the club's top three (D4)", () => {
    const batting = added("performances.batting");
    expect(batting.rows!.cells.map((c) => c.field)).toEqual(["name", "runs"]);
    expect(batting.rows!.pick).toEqual({ side: "club", count: 3, sort: "runs" });
    expect(v2Errors(batting)).toEqual([]);
    const bowling = added("performances.bowling");
    expect(bowling.rows!.cells.map((c) => c.field)).toEqual(["name", "figures"]);
    expect(bowling.rows!.pick).toEqual({ side: "club", count: 3, sort: "wickets" });
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
  it("names the list and the club by its short name", () => {
    panel(added("performances.batting"), "HHCC");
    expect(screen.getByText("Performances: batting")).toBeTruthy();
    expect(screen.getByRole("button", { name: "HHCC", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Top 3", pressed: true })).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement).value).toBe(
      "runs",
    );
  });

  it("switches whose performances show", () => {
    const onEdit = panel(added("performances.batting"));
    fireEvent.click(screen.getByRole("button", { name: "Opposition" }));
    expect(lastPick(onEdit)).toEqual({ side: "opposition", count: 3, sort: "runs" });
    fireEvent.click(screen.getByRole("button", { name: "Both" }));
    expect(lastPick(onEdit)).toMatchObject({ side: "both" });
    // Without a short name the club's button reads "Club".
    expect(screen.getByRole("button", { name: "Club" })).toBeTruthy();
  });

  it("chooses how many: the best, all, or a number", () => {
    const layer = added("performances.bowling");
    const onEdit = panel(layer);
    fireEvent.click(screen.getByRole("button", { name: "Best" }));
    expect(lastPick(onEdit)).toEqual({ side: "club", count: 1, sort: "wickets" });
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

  it("sorts best first or keeps the order listed", () => {
    const onEdit = panel(added("performances.bowling"));
    fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), {
      target: { value: "" },
    });
    expect(lastPick(onEdit)).toEqual({ side: "club", count: 3 });
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
