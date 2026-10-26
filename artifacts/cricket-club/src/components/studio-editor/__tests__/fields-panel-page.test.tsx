/** Every live field, image and list a page has (full draft editor plan, stage 3). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FieldsPanel } from "../fields-panel";

afterEach(cleanup);

describe("FieldsPanel with a page", () => {
  it("offers a match summary's innings, crests and lists, and finds a field by search", () => {
    const onAdd = vi.fn();
    render(
      <FieldsPanel
        kind="matchSummary"
        page="result"
        size="square"
        values={{}}
        textSelected={false}
        onInsert={() => {}}
        onAdd={onAdd}
      />,
    );
    expect(screen.getByRole("button", { name: "Add Innings 1 score (W/R)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Opposition logo" })).toBeTruthy();
    expect(screen.getByText("Innings 1 batting")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search fields" }), {
      target: { value: "venue" },
    });
    expect(screen.getByRole("button", { name: "Add Venue" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Innings 1 score (W/R)" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add Opposition logo" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "image", content: "{{opposition.logo}}" }),
    );
  });
});
