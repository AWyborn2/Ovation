/**
 * Photo position (New Studio): a draft's photo layer shows Left–right,
 * Up–down and Zoom sliders and Reset in the Layer panel; the position is
 * saved per size on the layer and reopens as saved. A set slide's own is kept
 * in the set's arrangement and drawn on that slide alone, and Edit this slide
 * moves it onto the slide's own layout.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { SetDocument, TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import { TemplateEditorV2, type EditorTemplate } from "@/pages/admin-template-editor";
import { previewSample } from "@/lib/kind-templates/samples";
import { buildPackData } from "@/lib/pack-card-data";
import type { FreeLayer } from "@/lib/pack-render";
import { renderAt } from "@/test/render";
import {
  newSlideLayout,
  openSetTemplate,
  pageRenderDocument,
  slidePhotoPosition,
  storedSetDocument,
  withSlideDesign,
  withSlidePhotoPosition,
} from "../set-doc";
import { PhotoPositionSection } from "../photo-position";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const box = { x: 0, y: 0, w: 100, h: 60 };
const PHOTO: FreeLayer = {
  id: "ph",
  kind: "photo",
  name: "Photo",
  geometry: { portrait: box, story: box },
};

function openEditor(document: unknown, save: (doc: Record<string, unknown>) => void) {
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
    id: 7,
    kind: "player",
    name: "Player card",
    version: 1,
    document: document as Record<string, unknown>,
    fitStatus: "pass",
  };
  renderAt(
    <TemplateEditorV2
      template={template}
      viewport={{ w: 1440, h: 900 }}
      initialFormat="portrait"
      host={{
        club: true,
        backHref: "/admin/social",
        save: async (version, doc) => {
          save(doc);
          return { ...template, version: version + 1, document: doc };
        },
        reload: async () => template,
        status: () => null,
      }}
      draftMode={{
        input: previewSample("player", "Test CC") as unknown as Record<string, unknown>,
        data: { ...buildPackData(), photoUrl: "https://example.test/bowler.jpg" },
      }}
    />,
    "/admin/social/editor/7",
  );
}

const overlay = (id: string) => document.querySelector(`[data-testid="layer-${id}"]`);
const slider = (name: string) => screen.getByRole("slider", { name }) as HTMLInputElement;

async function selectPhoto() {
  await waitFor(() => expect(overlay("ph")).toBeTruthy());
  fireEvent.pointerDown(overlay("ph")!);
  fireEvent.pointerUp(overlay("ph")!);
  // The toolbar's Replace: the photo and its Photo position, beside the rail.
  fireEvent.click(
    within(screen.getByRole("toolbar", { name: "Layer tools" })).getByRole("button", {
      name: "Replace",
    }),
  );
  await screen.findByRole("region", { name: "Photo position" });
}

describe("Photo position in the draft editor", () => {
  it("moves the photo with the sliders, resets, and saves per size", async () => {
    const saved: Array<Record<string, unknown>> = [];
    openEditor({ formatVersion: 2, pages: { card: { layers: [PHOTO] } } }, (d) => saved.push(d));
    await selectPhoto();
    expect(screen.getByText(/Not moved yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset photo position" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText(/zoom in for more photo to move through/)).toBeTruthy();
    // The ranges are the photo placement sliders'.
    expect([slider("Photo left–right").min, slider("Photo left–right").max]).toEqual(["0", "1"]);
    expect([slider("Photo zoom").min, slider("Photo zoom").max]).toEqual(["0.5", "3"]);

    fireEvent.change(slider("Photo left–right"), { target: { value: "0.8" } });
    fireEvent.pointerUp(slider("Photo left–right"));
    fireEvent.change(slider("Photo up–down"), { target: { value: "0.2" } });
    fireEvent.keyUp(slider("Photo up–down"));
    fireEvent.change(slider("Photo zoom"), { target: { value: "1.5" } });
    fireEvent.pointerUp(slider("Photo zoom"));
    expect(slider("Photo left–right").value).toBe("0.8");
    expect(screen.getByText("1.50×")).toBeTruthy();
    // The canvas draws it.
    await waitFor(() =>
      expect(document.body.innerHTML).toMatch(/object-position:80% 20%|object-position: 80% 20%/),
    );

    // Reset puts the size back; move it again and save.
    fireEvent.click(screen.getByRole("button", { name: "Reset photo position" }));
    expect(slider("Photo left–right").value).toBe("0.5");
    expect(screen.getByText(/Not moved yet/)).toBeTruthy();
    fireEvent.change(slider("Photo left–right"), { target: { value: "0.9" } });
    fireEvent.pointerUp(slider("Photo left–right"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const layers = (saved[0] as { pages: { card: { layers: FreeLayer[] } } }).pages.card.layers;
    expect(layers.find((l) => l.id === "ph")!.photoPosition).toEqual({
      portrait: { focalX: 0.9, focalY: 0.5, zoom: 1 },
    });
    cleanup();

    // Reopened from what was saved: Portrait shows it, Story was never moved.
    openEditor(saved[0], () => undefined);
    await selectPhoto();
    expect(slider("Photo left–right").value).toBe("0.9");
    fireEvent.change(screen.getByRole("combobox", { name: "Format" }), {
      target: { value: "story" },
    });
    // A new size clears the selection: pick the photo again on Story.
    fireEvent.pointerDown(overlay("ph")!);
    fireEvent.pointerUp(overlay("ph")!);
    if (!screen.queryByRole("region", { name: "Photo position" })) await selectPhoto();
    await waitFor(() => expect(slider("Photo left–right").value).toBe("0.5"));
    expect(screen.getByText(/Not moved yet/)).toBeTruthy();
  });

  it("shows no Photo position for a layer that isn't a photo", async () => {
    const text = {
      id: "tx",
      kind: "text",
      content: "Hi",
      geometry: { portrait: box, story: box },
    } as FreeLayer;
    openEditor({ formatVersion: 2, pages: { card: { layers: [text] } } }, () => undefined);
    await waitFor(() => expect(overlay("tx")).toBeTruthy());
    fireEvent.pointerDown(overlay("tx")!);
    fireEvent.pointerUp(overlay("tx")!);
    // A text layer has no Replace; its Edit has no Photo position.
    const bar = screen.getByRole("toolbar", { name: "Layer tools" });
    expect(within(bar).queryByRole("button", { name: "Replace" })).toBeNull();
    fireEvent.click(within(bar).getByRole("button", { name: "Edit" }));
    await screen.findByRole("region", { name: "Show when" });
    expect(screen.queryByRole("region", { name: "Photo position" })).toBeNull();
  });
});

describe("the Photo position section", () => {
  it("reports a drag as it goes and once more when it ends; Reset clears", () => {
    const onChange = vi.fn();
    renderAt(
      <PhotoPositionSection
        control={{
          size: "story",
          value: { focalX: 0.3, focalY: 0.4, zoom: 2 },
          onChange,
          scope: "slide",
        }}
      />,
      "/",
    );
    expect(screen.getByText(/This slide only, at Story/)).toBeTruthy();
    fireEvent.change(slider("Photo zoom"), { target: { value: "2.5" } });
    expect(onChange).toHaveBeenLastCalledWith({ focalX: 0.3, focalY: 0.4, zoom: 2.5 }, false);
    fireEvent.pointerUp(slider("Photo zoom"));
    expect(onChange).toHaveBeenLastCalledWith({ focalX: 0.3, focalY: 0.4, zoom: 2 }, true);
    fireEvent.click(screen.getByRole("button", { name: "Reset photo position" }));
    expect(onChange).toHaveBeenLastCalledWith(null, true);
  });
});

describe("a set slide's own Photo position in the editor's set", () => {
  const SET: SetDocument = {
    formatVersion: 2,
    set: "teamLists",
    pages: [
      {
        id: "team",
        role: "repeat",
        slot: "team",
        kind: "teamList",
        page: "team",
        layers: [PHOTO as unknown as TemplateLayerV2],
      },
    ],
  };
  const F = "detail:senior:F Grade";
  const E = "detail:senior:E Grade";
  const POS = { focalX: 0.9, focalY: 0.3, zoom: 1.2 };
  const page = { id: "team", kind: "teamList", page: "team" as const };
  const photoIn = (adj: unknown) =>
    (adj as { pages: { team: { layers: FreeLayer[] } } }).pages.team.layers[0]!.photoPosition;

  it("draws on that slide alone at that size, saves, reopens and clears", () => {
    const doc = withSlidePhotoPosition(openSetTemplate(SET).doc, F, "ph", "portrait", POS);
    expect(slidePhotoPosition(doc, F, "ph", "portrait")).toEqual(POS);
    expect(slidePhotoPosition(doc, F, "ph", "story")).toBeNull();
    expect(photoIn(pageRenderDocument(doc, page, F))).toEqual({ portrait: POS });
    expect(photoIn(pageRenderDocument(doc, page, E))).toBeUndefined();
    expect(photoIn(pageRenderDocument(doc, page))).toBeUndefined();
    // Saved and reopened, it is still there; the page's layer never held it.
    const stored = storedSetDocument(doc);
    expect(stored.arrangement?.photoFor).toEqual({ [F]: { ph: { portrait: POS } } });
    expect(
      (stored.pages[0]!.layers[0] as { photoPosition?: unknown }).photoPosition,
    ).toBeUndefined();
    const reopened = openSetTemplate(JSON.parse(JSON.stringify(stored))).doc;
    expect(slidePhotoPosition(reopened, F, "ph", "portrait")).toEqual(POS);
    // Reset clears it, leaving no empty entry behind.
    const cleared = withSlidePhotoPosition(reopened, F, "ph", "portrait", null);
    expect(storedSetDocument(cleared).arrangement?.photoFor).toBeUndefined();
  });

  it("goes onto the slide's own layout when it gets one", () => {
    const doc = withSlidePhotoPosition(openSetTemplate(SET).doc, F, "ph", "portrait", POS);
    const r = newSlideLayout(doc, F, "team", "F Grade layout");
    const layout = (r.doc.pages as Record<string, { layers: FreeLayer[] }>)[r.id]!;
    expect(layout.layers[0]!.photoPosition).toEqual({ portrait: POS });
    expect(r.doc.setDesign?.arrangement?.photoFor).toBeUndefined();
    // Edit this slide's save: the layers it opened with hold the position.
    const saved = withSlideDesign(
      storedSetDocument(doc),
      F,
      "team",
      { layers: [{ ...PHOTO, photoPosition: { portrait: POS } }] },
      "F Grade layout",
    )!;
    expect(saved.arrangement?.photoFor).toBeUndefined();
    const own = saved.pages.find((p) => p.id === saved.arrangement?.pageFor?.[F])!;
    expect((own.layers[0] as { photoPosition?: unknown }).photoPosition).toEqual({ portrait: POS });
    expect(
      (saved.pages[0]!.layers[0] as { photoPosition?: unknown }).photoPosition,
    ).toBeUndefined();
  });
});
