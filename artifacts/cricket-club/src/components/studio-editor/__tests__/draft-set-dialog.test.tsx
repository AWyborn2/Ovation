/** "Make a carousel set" on a draft starts from its look's pages (full draft editor plan, D9). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { SetDocument } from "@workspace/scorecard/kind-templates";
import { renderAt } from "../../../test/render";
import { DraftSetDialog } from "../draft-set-dialog";

const box = (id: string) => ({
  id,
  kind: "shape",
  geometry: { square: { x: 0, y: 0, w: 100, h: 100 } },
  style: { background: "#123456" },
});

const LOOK_SET = {
  formatVersion: 2,
  set: "results",
  pages: [
    {
      id: "cover",
      role: "fixed",
      slot: "cover",
      kind: "matchDay",
      page: "title",
      layers: [box("c")],
    },
    {
      id: "result",
      role: "repeat",
      slot: "result",
      kind: "matchSummary",
      page: "result",
      layers: [box("r")],
    },
    {
      id: "day",
      role: "repeat",
      slot: "day",
      kind: "matchSummary",
      page: "day",
      layers: [box("d")],
    },
    {
      id: "sponsors",
      role: "fixed",
      slot: "sponsors",
      kind: "matchDay",
      page: "sponsors",
      layers: [box("s")],
    },
  ],
};

const DESIGN = { formatVersion: 2, pages: { result: { layers: [box("mine")] } } };

function stubApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      let body: unknown = [];
      if (/template-library/.test(url))
        body = {
          templates: [
            {
              id: 5,
              kind: "set:results",
              name: "Club Kit results",
              look: { id: 10, slug: "club-kit", name: "Club Kit" },
              document: LOOK_SET,
            },
          ],
        };
      else if (/club-templates\/3$/.test(url))
        body = { id: 3, kind: "matchSummary", basedOn: { look: { id: 10, name: "Club Kit" } } };
      else if (/social-settings/.test(url))
        body = { settings: {}, captionTemplates: [], activeSponsors: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("DraftSetDialog", () => {
  it("offers the look's cover, result and sponsors pages, and builds the set from the ticks", async () => {
    stubApi();
    const onMake = vi.fn();
    renderAt(
      <DraftSetDialog
        open
        onClose={() => {}}
        kind="matchSummary"
        document={DESIGN}
        templateRef={{ copyId: 3, version: 1 }}
        busy={false}
        onMake={onMake}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Make a carousel set" });
    const cover = await within(dialog).findByRole("checkbox", { name: "Cover" });
    const result = within(dialog).getByRole("checkbox", { name: "The look's result page" });
    const sponsors = within(dialog).getByRole("checkbox", { name: "Sponsors" });
    // No junior day page; the cover and sponsors start ticked, the look's result doesn't.
    expect(within(dialog).queryByRole("checkbox", { name: /junior day/i })).toBeNull();
    expect(cover).toHaveAttribute("aria-checked", "true");
    expect(sponsors).toHaveAttribute("aria-checked", "true");
    expect(result).toHaveAttribute("aria-checked", "false");

    fireEvent.click(sponsors);
    fireEvent.click(within(dialog).getByRole("button", { name: "Make a 2-page set" }));
    await waitFor(() => expect(onMake).toHaveBeenCalled());
    const set = onMake.mock.calls[0]![0] as SetDocument;
    expect(set.set).toBe("free");
    expect(set.pages.map((p) => p.id)).toEqual(["look-cover", "page-1"]);
  });

  it("offers the design and a copy for a card no set draws", async () => {
    stubApi();
    const onMake = vi.fn();
    renderAt(
      <DraftSetDialog
        open
        onClose={() => {}}
        kind="milestone"
        document={{ formatVersion: 2, pages: { card: { layers: [box("m")] } } }}
        busy={false}
        onMake={onMake}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Make a carousel set" });
    expect(within(dialog).queryByText("Look")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Make a 2-page set" }));
    const set = onMake.mock.calls[0]![0] as SetDocument;
    expect(set.pages.map((p) => p.id)).toEqual(["page-1", "page-2"]);
  });
});
