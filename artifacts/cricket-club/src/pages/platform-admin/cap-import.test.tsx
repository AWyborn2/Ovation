/**
 * Cap register import card: the preview shows row-numbered errors, how many
 * caps would link per list, and every unlinked cap with why.
 */
import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, render, within } from "@testing-library/react";
import type { CapImportPlannedCap, CapImportPreview } from "@workspace/api-client-react";
import { CapPreviewView, capSummary } from "./cap-import";

afterEach(cleanup);

const cap = (over: Partial<CapImportPlannedCap>): CapImportPlannedCap => ({
  row: 2,
  category: "male",
  capNumber: 1,
  name: "Leigh McIntosh",
  games: 196,
  playerId: 10,
  status: "linked",
  note: "",
  ...over,
});

const PREVIEW: CapImportPreview = {
  rowCount: 3,
  errors: [],
  refusedCategories: [],
  centralUnavailable: null,
  caps: [
    cap({}),
    cap({
      row: 3,
      capNumber: 2,
      name: "Mitch Brown",
      playerId: null,
      status: "unmatched",
      note: 'close name: "Mitchell Brown" (player #7)',
    }),
    cap({ row: 4, category: "female", capNumber: 1, name: "Matilda Gray", playerId: 12 }),
  ],
};

describe("capSummary", () => {
  it("counts linked and unlinked caps per list and skips empty lists", () => {
    expect(capSummary(PREVIEW.caps)).toEqual([
      { category: "male", total: 2, linked: 1, unlinked: 1 },
      { category: "female", total: 1, linked: 1, unlinked: 0 },
    ]);
    expect(capSummary([])).toEqual([]);
  });
});

describe("CapPreviewView", () => {
  it("shows the per-list summary and each unlinked cap with its reason", () => {
    render(<CapPreviewView preview={PREVIEW} />);
    const lists = screen.getByRole("list", { name: "Cap lists" });
    expect(within(lists).getByText(/2 caps · 1 linked to a player · 1 unlinked/)).toBeTruthy();
    expect(within(lists).getByText(/1 caps · 1 linked to a player · 0 unlinked/)).toBeTruthy();
    const table = screen.getByRole("table", { name: "Unlinked caps" });
    expect(within(table).getByText("Mitch Brown")).toBeTruthy();
    expect(within(table).getByText("No matching player")).toBeTruthy();
    expect(within(table).getByText(/Mitchell Brown/)).toBeTruthy();
    expect(within(table).queryByText("Leigh McIntosh")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lists errors and warns when central was unreadable", () => {
    render(
      <CapPreviewView
        preview={{
          ...PREVIEW,
          errors: ["Row 5: male cap #1 repeats row 2."],
          centralUnavailable: "connection refused",
        }}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(/1 problem/)).toBeTruthy();
    expect(within(alert).getByText("Row 5: male cap #1 repeats row 2.")).toBeTruthy();
    expect(screen.getByText(/connection refused/)).toBeTruthy();
  });
});
