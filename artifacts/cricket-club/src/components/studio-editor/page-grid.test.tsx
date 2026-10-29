import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PageOverview } from "./page-grid";

afterEach(cleanup);

const items = ["Cover", "A Grade", "Sponsors"].map((label, i) => ({ id: `s${i}`, label }));

describe("page overview", () => {
  it("counts the slide on show and opens a grid that moves, deletes and picks slides", () => {
    const onSelect = vi.fn();
    const onMove = vi.fn();
    const onDelete = vi.fn();
    render(
      <PageOverview
        items={items}
        current="s1"
        onSelect={onSelect}
        thumb={(item) => <span>{item.label} thumb</span>}
        aspect={1}
        onMove={onMove}
        onDelete={onDelete}
        label="Slides"
      />,
    );
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "See all slides" }));
    fireEvent.click(screen.getByRole("button", { name: "Move A Grade later" }));
    expect(onMove).toHaveBeenCalledWith("s1", 2);
    fireEvent.click(screen.getByRole("button", { name: "Delete Sponsors" }));
    expect(onDelete).toHaveBeenCalledWith("s2");
    fireEvent.click(screen.getByRole("button", { name: "1. Cover" }));
    expect(onSelect).toHaveBeenCalledWith("s0");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
