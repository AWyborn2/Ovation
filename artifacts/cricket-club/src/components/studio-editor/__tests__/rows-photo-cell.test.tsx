/**
 * studio-editor-multiselect — a list cell can show each row's photo, so a
 * Team of the Week template gets a photo per player from one styled slot.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { templateDocumentErrors } from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
import { RowsPanel, isImageRowField } from "../rows-panel";
import type { EditorDoc } from "../document";

afterEach(cleanup);

const players: FreeLayer = {
  id: "players",
  kind: "rows",
  name: "Players",
  rows: {
    repeat: "players",
    rowHeight: 20,
    cells: [{ field: "name", x: 0, w: 100, style: { fontSize: 2 } }],
  },
  geometry: { square: { x: 5, y: 30, w: 90, h: 60 } },
};
const doc: EditorDoc = { layers: [players] };

describe("list photo cells", () => {
  it("knows which row fields hold a photo", () => {
    expect(isImageRowField("photo")).toBe(true);
    expect(isImageRowField("name")).toBe(false);
  });

  it("switching a cell to the photo field shows it as a photo, placed in the row", () => {
    const onEdit = vi.fn();
    render(<RowsPanel doc={doc} layer={players} kind="teamOfWeek" size="square" onEdit={onEdit} />);
    const shows = () => screen.getByRole("combobox", { name: "Cell shows" });
    expect(within(shows()).queryByRole("option", { name: "Photo" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Cell field" }), {
      target: { value: "photo" },
    });
    const next = onEdit.mock.calls.at(-1)![0] as EditorDoc;
    const cell = next.layers![0].rows!.cells[0];
    expect(cell).toMatchObject({ field: "photo", show: "image" });
    expect(templateDocumentErrors(JSON.parse(JSON.stringify(next)), "teamOfWeek")).toEqual([]);
  });

  it("a photo cell offers Photo and takes a top and height within the row", () => {
    const withPhoto: FreeLayer = {
      ...players,
      rows: { ...players.rows!, cells: [{ field: "photo", x: 20, w: 60, show: "image" }] },
    };
    const onEdit = vi.fn();
    render(
      <RowsPanel
        doc={{ layers: [withPhoto] }}
        layer={withPhoto}
        kind="teamOfWeek"
        size="square"
        onEdit={onEdit}
      />,
    );
    const shows = screen.getByRole("combobox", { name: "Cell shows" });
    expect(within(shows).getByRole("option", { name: "Photo" })).toBeTruthy();
    expect(screen.getByText(/Each row shows its own photo/)).toBeTruthy();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Cell height" }), {
      target: { value: "46" },
    });
    expect((onEdit.mock.calls.at(-1)![0] as EditorDoc).layers![0].rows!.cells[0].h).toBe(46);
    fireEvent.change(screen.getByRole("combobox", { name: "Cell shows" }), {
      target: { value: "text" },
    });
    expect(
      (onEdit.mock.calls.at(-1)![0] as EditorDoc).layers![0].rows!.cells[0].show,
    ).toBeUndefined();
  });
});
