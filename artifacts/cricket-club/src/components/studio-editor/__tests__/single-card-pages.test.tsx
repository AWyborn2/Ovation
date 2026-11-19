/**
 * A single card or draft (retest 7, #1): a Match Day card draws its fixture
 * page only, so its editor doesn't list the template's title, junior day and
 * sponsors pages as "empty", nor count them in the format menu's "pages
 * empty". A template keeps every page (there the empty notes help).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { TemplateEditorV2, type EditorTemplate } from "@/pages/admin-template-editor";
import { previewSample } from "@/lib/kind-templates/samples";
import { buildPackData } from "@/lib/pack-card-data";
import { renderAt } from "@/test/render";
import { editorPageList, singleCardPages } from "../set-doc";
import { openTemplate } from "../template-doc";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const box = { x: 10, y: 10, w: 80, h: 20 };
const MATCH_DAY = {
  layers: [
    {
      id: "grade",
      kind: "text",
      name: "Grade",
      content: "{{grade}}",
      geometry: { square: box },
    },
  ],
};

function openEditor(draft: boolean) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const payload = /social-settings/.test(url)
        ? { settings: {}, captionTemplates: [], activeSponsors: [] }
        : [];
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  const template: EditorTemplate = {
    id: 1008,
    kind: "matchDay",
    name: "Match Day card",
    version: 1,
    document: MATCH_DAY,
    fitStatus: "pass",
  };
  renderAt(
    <TemplateEditorV2
      template={template}
      viewport={{ w: 1440, h: 900 }}
      host={{
        club: true,
        backHref: "/admin/social",
        save: async () => template,
        reload: async () => template,
        status: () => null,
      }}
      draftMode={
        draft
          ? {
              input: previewSample("matchDay", "Test CC") as unknown as Record<string, unknown>,
              data: buildPackData(),
            }
          : undefined
      }
    />,
    "/admin/social/editor/1008",
  );
}

const formatOptions = () =>
  Array.from((screen.getByRole("combobox", { name: "Format" }) as HTMLSelectElement).options).map(
    (o) => o.textContent ?? "",
  );

describe("a single card's pages", () => {
  it("lists only the page a single Match Day card draws", async () => {
    openEditor(true);
    await screen.findByRole("button", { name: "Save" });
    // One page: no page strip, so no "Title page · empty" and the like.
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
    expect(screen.queryByText(/Title page|Junior day|Sponsors page/)).toBeNull();
    // The format menu counts only that page: the square has layers, so it says nothing.
    const options = formatOptions();
    expect(options.find((o) => o.startsWith("Square"))).toBe("Square");
    expect(options.some((o) => /pages? empty/.test(o))).toBe(false);
  });

  it("keeps every page, and its empty notes, when editing the template", async () => {
    openEditor(false);
    const strip = await screen.findByRole("navigation", { name: "Pages" });
    expect(strip.textContent).toMatch(/Title page/);
    expect(strip.textContent).toMatch(/Sponsors page/);
    expect(formatOptions().find((o) => o.startsWith("Square"))).toBe("Square · 3 pages empty");
  });

  it("picks the page the card's input draws", () => {
    const pages = editorPageList(openTemplate(MATCH_DAY, "matchDay").doc, "matchDay");
    expect(pages.map((p) => p.page)).toEqual(["fixture", "title", "day", "sponsors"]);
    expect(singleCardPages(pages, "matchDay", { kind: "matchDay" }).map((p) => p.page)).toEqual([
      "fixture",
    ]);
    // A junior day slide draws the day page; a carousel title its title page.
    expect(
      singleCardPages(pages, "matchDay", { kind: "matchDay", carouselDay: {} }).map((p) => p.page),
    ).toEqual(["day"]);
    expect(
      singleCardPages(pages, "matchDay", {
        kind: "matchDay",
        carouselPage: { page: "title" },
      }).map((p) => p.page),
    ).toEqual(["title"]);
    // No kind on the input: the template kind's primary page.
    expect(singleCardPages(pages, "matchDay", {}).map((p) => p.page)).toEqual(["fixture"]);
  });
});
