/** The Elements panel's element library (editable-elements plan, D3, D4). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderAt } from "../../../test/render";
import { installApiMock } from "../../../test/mock-api";
import type { FreeLayer } from "@/lib/pack-render";
import { LibraryElements } from "../library-elements";

const element = (
  id: number,
  name: string,
  look: { id: number; slug: string; name: string } | null,
) => ({
  id,
  slug: look ? `${look.slug}/bands/${id}` : null,
  name,
  category: "bands",
  tags: ["band"],
  origin: look ? "bundle" : "club",
  authorName: look ? "Ovation" : "Seaview CC",
  mine: false,
  look,
  listed: true,
  document: {
    formatVersion: 2,
    layers: [
      {
        id: "e1",
        kind: "shape",
        geometry: { square: { x: 0, y: 80, w: 100, h: 10 } },
        style: { fill: "var(--gold)" },
      },
    ],
  },
  thumbnailUrl: null,
  createdAt: "2026-10-22T00:00:00.000Z",
});

const KIT = { id: 1, slug: "club-kit", name: "Club Kit" };

const look = (id: number, slug: string, name: string, family?: string) => ({
  id,
  slug,
  name,
  description: null,
  authorName: "Ovation",
  templates: [],
  ...(family ? { family } : {}),
});

function setup(onAdd = vi.fn()) {
  const api = installApiMock({
    "/template-library/elements": {
      elements: [
        element(7, "Gold band", KIT),
        element(8, "Seaview strip", null),
        { ...element(9, "Our chip", null), authorName: "Demo CC", mine: true },
        { ...element(10, "Glass panel", KIT), tags: ["glass", "subtle"] },
      ],
      nextCursor: 8,
    },
    "/template-library/looks": {
      looks: [
        look(1, "club-kit", "Club Kit"),
        look(20, "omg-broadcast", "Broadcast", "Ovation Match Graphics"),
        look(2, "gold-foil", "Gold Foil"),
        look(21, "omg-t20", "T20", "Ovation Match Graphics"),
      ],
    },
  });
  renderAt(<LibraryElements size="story" onAdd={onAdd} />);
  return { api, onAdd };
}

const elementCalls = (calls: string[]) =>
  calls.filter((u) => u.includes("/template-library/elements")).map((u) => new URL(u, "http://x"));

describe("LibraryElements", () => {
  it("lists elements with their look or the club that saved them", async () => {
    setup();
    expect(await screen.findByRole("button", { name: "Add Gold band" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Seaview strip" })).toBeTruthy();
    expect(screen.getByText("Seaview CC")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Club Kit" })).toBeTruthy();
  });

  it("adds an element's layers as fresh native layers at the size being edited", async () => {
    const { onAdd } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Add Gold band" }));
    const layers = onAdd.mock.calls[0]![0] as FreeLayer[];
    expect(layers).toHaveLength(1);
    expect(layers[0]!.kind).toBe("shape");
    expect(layers[0]!.id).not.toBe("e1");
    expect(layers[0]!.geometry.story).toEqual({ x: 0, y: 80, w: 100, h: 10 });
  });

  it("filters by look and category, and searches as you type", async () => {
    const { api } = setup();
    await screen.findByRole("button", { name: "Add Gold band" });
    fireEvent.change(screen.getByRole("combobox", { name: "Look" }), {
      target: { value: "club-kit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rules and dividers" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search the element library" }), {
      target: { value: "gold" },
    });
    await waitFor(() =>
      expect(
        elementCalls(api.calls).some(
          (u) =>
            u.searchParams.get("look") === "club-kit" &&
            u.searchParams.get("category") === "rules" &&
            u.searchParams.get("q") === "gold",
        ),
      ).toBe(true),
    );
  });

  it("lists a design system as one look, with a heading and a page per style (M4)", async () => {
    const { api } = setup();
    await screen.findByRole("button", { name: "Add Gold band" });
    const group = screen.getByRole("group", { name: "Ovation Match Graphics" });
    expect(
      Array.from(group.querySelectorAll("option")).map((o) => [o.value, o.textContent]),
    ).toEqual([
      ["family:Ovation Match Graphics", "Ovation Match Graphics"],
      ["omg-broadcast", "Ovation Match Graphics · Broadcast"],
      ["omg-t20", "Ovation Match Graphics · T20"],
    ]);
    fireEvent.change(screen.getByRole("combobox", { name: "Look" }), {
      target: { value: "family:Ovation Match Graphics" },
    });
    expect(await screen.findByRole("heading", { name: "Broadcast" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "T20" })).toBeTruthy();
    await waitFor(() => {
      const looks = elementCalls(api.calls).map((u) => u.searchParams.get("look"));
      expect(looks).toContain("omg-broadcast");
      expect(looks).toContain("omg-t20");
    });
  });

  it("loads the next page on request", async () => {
    const { api } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "More elements" }));
    await waitFor(() =>
      expect(elementCalls(api.calls).some((u) => u.searchParams.get("cursor") === "8")).toBe(true),
    );
  });

  it("shows the club's own elements, and lets it take one out of the library", async () => {
    const { api } = setup();
    await screen.findByRole("button", { name: "Add Gold band" });
    fireEvent.change(screen.getByRole("combobox", { name: "Look" }), {
      target: { value: "__mine" },
    });
    await waitFor(() =>
      expect(elementCalls(api.calls).some((u) => u.searchParams.get("mine") === "true")).toBe(true),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Take out of the library" }));
    await waitFor(() =>
      expect(api.calls.some((u) => u.includes("/template-library/elements/9/unlist"))).toBe(true),
    );
  });

  it("reports another club's element, but never Ovation's or the club's own", async () => {
    const { api } = setup();
    await screen.findByRole("button", { name: "Add Gold band" });
    expect(screen.queryByRole("button", { name: "Report Gold band" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Report Our chip" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Report Seaview strip" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Reason" }), {
      target: { value: "Copied our art" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText(/Ovation will review it/)).toBeTruthy();
    expect(api.calls.some((u) => u.includes("/template-library/elements/8/report"))).toBe(true);
  });

  it("marks a subtle element so it's findable as such", async () => {
    setup();
    const tile = (await screen.findByRole("button", { name: "Add Glass panel" })) as HTMLElement;
    expect(tile.textContent).toMatch(/Subtle/);
    expect(screen.getByRole("button", { name: "Add Gold band" }).textContent).not.toMatch(/Subtle/);
  });
});
