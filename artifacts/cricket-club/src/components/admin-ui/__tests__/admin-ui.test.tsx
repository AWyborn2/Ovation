/**
 * Social Studio U7 — the shared admin primitives: table search and filter
 * chips, row click into the edit drawer (Escape closes), the dirty-only save
 * bar, horizontal scroll, and tokens-only styling.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { DataTable, EditDrawer, SaveBar, SettingsCard, SettingsRow, StatusPill } from "..";

afterEach(cleanup);

type Player = { id: number; name: string; grade: string };
const PLAYERS: Player[] = [
  { id: 1, name: "Sam Keeper", grade: "A Grade" },
  { id: 2, name: "Alex Stone", grade: "B Grade" },
  { id: 3, name: "Kim Fast", grade: "A Grade" },
];

function Harness() {
  const [open, setOpen] = useState<Player | null>(null);
  const [name, setName] = useState("Club");
  const [saved, setSaved] = useState("Club");
  return (
    <div>
      <DataTable
        label="Players"
        rows={PLAYERS}
        getRowId={(p) => p.id}
        columns={[
          { key: "name", header: "Name", cell: (p) => p.name },
          { key: "grade", header: "Grade", cell: (p) => <StatusPill>{p.grade}</StatusPill> },
        ]}
        searchText={(p) => p.name}
        searchPlaceholder="Search players"
        filters={[{ id: "a", label: "A Grade", predicate: (p) => p.grade === "A Grade" }]}
        onRowClick={setOpen}
        emptyState="No players match."
      />
      <EditDrawer
        open={open != null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open?.name ?? ""}
        onSave={() => setOpen(null)}
        onDelete={() => setOpen(null)}
      >
        <p>Editing {open?.name}</p>
      </EditDrawer>
      <SettingsCard title="Club details">
        <SettingsRow label="Club name" helper="Shown in the header" htmlFor="club-name">
          <input id="club-name" value={name} onChange={(e) => setName(e.target.value)} />
        </SettingsRow>
      </SettingsCard>
      <SaveBar
        dirty={name !== saved}
        onSave={() => setSaved(name)}
        onReset={() => setName(saved)}
      />
    </div>
  );
}

const bodyRows = () =>
  within(screen.getByRole("table", { name: "Players" }))
    .getAllByRole("row")
    .slice(1);

describe("DataTable", () => {
  it("search filters rows, a chip narrows them, and clearing restores them", () => {
    render(<Harness />);
    expect(bodyRows()).toHaveLength(3);

    fireEvent.change(screen.getByLabelText("Search players"), { target: { value: "stone" } });
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Alex Stone")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search players"), { target: { value: "" } });
    const chip = screen.getByRole("button", { name: "A Grade" });
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(bodyRows()).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("Search players"), { target: { value: "stone" } });
    expect(screen.getByText("No players match.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search players"), { target: { value: "" } });
    fireEvent.click(chip);
    expect(bodyRows()).toHaveLength(3);
  });

  it("scrolls horizontally inside its card instead of overflowing the page", () => {
    render(<Harness />);
    const table = screen.getByRole("table", { name: "Players" });
    expect(table.style.minWidth).toBe("720px");
    expect(table.parentElement?.className).toContain("overflow-x-auto");
  });
});

describe("EditDrawer", () => {
  it("opens with the clicked row and closes on Escape", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Kim Fast"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Editing Kim Fast")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeTruthy();

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("opens from the keyboard", async () => {
    render(<Harness />);
    const row = screen.getByText("Sam Keeper").closest("tr")!;
    fireEvent.keyDown(row, { key: "Enter" });
    expect(await screen.findByText("Editing Sam Keeper")).toBeTruthy();
  });
});

describe("SaveBar", () => {
  it("appears after an edit and disappears after save or reset", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Club name");
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();

    fireEvent.change(input, { target: { value: "Club FC" } });
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
    expect((input as HTMLInputElement).value).toBe("Club");

    fireEvent.change(input, { target: { value: "Club FC" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
  });
});

describe("tokens only", () => {
  it("the admin-ui components carry no raw hex colours", () => {
    const dir = join(__dirname, "..");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
      const src = readFileSync(join(dir, f), "utf8");
      expect({ f, hex: src.match(/#[0-9a-fA-F]{3,8}\b/g) }).toEqual({ f, hex: null });
    }
  });
});
