/**
 * Junior photos in the editor (studio retest, 17 Nov 2026): on a junior card
 * or a junior set's pages, every photo control offers only what will be
 * drawn: the club's approved junior stock, or the card's own cleared photo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderAt } from "@/test/render";
import { PhotosPanel } from "../content-panels";
import { FieldsPanel } from "../fields-panel";
import { PhotoSourcePicker } from "../photo-source-picker";
import { PHOTO_RULE_NOTE, juniorSafeAddedLayers, photoRuleFor } from "../junior-photos";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const photo = (id: number, over: Record<string, unknown>) => ({
  id,
  url: `/api/storage/objects/library/p${id}`,
  thumbUrl: `/api/storage/objects/library/p${id}-thumb`,
  width: 800,
  height: 600,
  season: null,
  grade: null,
  takenAt: null,
  createdAt: "2026-11-01T00:00:00Z",
  playerIds: [],
  sourcePhotoId: null,
  juniorStock: false,
  ...over,
});
// A club-wide library photo, a tagged stock image, a graded stock image, and approved stock.
const PHOTOS = [
  photo(1, { season: 2026 }),
  photo(2, { juniorStock: true, playerIds: [7] }),
  photo(3, { juniorStock: true, grade: "Under 11" }),
  photo(4, { juniorStock: true }),
];

const json = (payload: unknown) =>
  new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });

function stubApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (/\/club-photos\b/.test(url) && !/collections/.test(url)) return json(PHOTOS);
      if (/collections/.test(url)) return json([{ id: 9, name: "Finals", photoCount: 3 }]);
      return json({});
    }),
  );
}

const slide = (junior: boolean, role = "repeat", design = false) => ({
  junior,
  design,
  page: { role },
});

describe("photoRuleFor", () => {
  it("names a junior card, a junior set's page, and anything else", () => {
    expect(photoRuleFor({ input: { junior: true } })).toBe("juniorCard");
    const juniorSet = [slide(false, "fixed"), slide(true), slide(false, "fixed")];
    expect(photoRuleFor({ slide: juniorSet[1], slides: juniorSet })).toBe("juniorCard");
    // The cover of a junior set is a junior surface too (#638).
    expect(photoRuleFor({ slide: juniorSet[0], slides: juniorSet })).toBe("juniorSetPage");
    // A set with a senior game keeps its senior cover rules.
    const mixed = [slide(false, "fixed"), slide(true), slide(false)];
    expect(photoRuleFor({ slide: mixed[0], slides: mixed })).toBe("senior");
    expect(photoRuleFor({})).toBe("senior");
  });
});

describe("PhotosPanel on a junior page", () => {
  it("offers only approved junior stock, to add, never as the card's photo", async () => {
    stubApi();
    const onAdd = vi.fn();
    renderAt(<PhotosPanel size="square" rule="juniorSetPage" onAdd={onAdd} onSetPhoto={vi.fn()} />);
    const add = await screen.findByRole("button", { name: "Add library photo 4 to the card" });
    for (const id of [1, 2, 3])
      expect(screen.queryByRole("button", { name: `Add library photo ${id} to the card` })).toBe(
        null,
      );
    expect(screen.queryByRole("button", { name: /as the card photo/ })).toBeNull();
    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "image", content: PHOTOS[3]!.url }),
    );
  });

  it("offers every library photo on a senior card, as before", async () => {
    stubApi();
    renderAt(<PhotosPanel size="square" onAdd={vi.fn()} onSetPhoto={vi.fn()} />);
    await screen.findByRole("button", { name: "Set library photo 1 as the card photo" });
    expect(screen.getByRole("button", { name: "Add library photo 2 to the card" })).toBeTruthy();
  });
});

describe("PhotoSourcePicker on a junior page", () => {
  it("offers only the card's photo, and says what the page shows", async () => {
    stubApi();
    renderAt(<PhotoSourcePicker source={undefined} rule="juniorCard" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Photo comes from" });
    const options = [...(select as HTMLSelectElement).options];
    await waitFor(() =>
      expect(options.filter((o) => !o.disabled).map((o) => o.value)).toEqual(["card"]),
    );
    expect(screen.getByText(PHOTO_RULE_NOTE.juniorCard)).toBeTruthy();
  });
});

describe("FieldsPanel's photo note", () => {
  const panel = (photoRule?: "senior" | "juniorCard" | "juniorSetPage") =>
    render(
      <FieldsPanel
        kind="matchDay"
        page="title"
        size="square"
        values={{}}
        textSelected={false}
        onInsert={() => {}}
        onAdd={() => {}}
        photoRule={photoRule}
      />,
    );

  it("matches what a junior set's cover draws: approved junior stock", () => {
    panel("juniorSetPage");
    expect(screen.getByText(PHOTO_RULE_NOTE.juniorSetPage)).toBeTruthy();
    expect(screen.queryByText(/never show the photo, whatever the template holds/)).toBeNull();
  });

  it("explains the junior rule on any other page", () => {
    panel();
    expect(screen.getByText(PHOTO_RULE_NOTE.senior)).toBeTruthy();
  });
});

// Retest 6, item K: a page copied into a junior set from another template.
describe("juniorSafeAddedLayers", () => {
  const g = { square: { x: 0, y: 0, w: 10, h: 10 } };
  it("drops stored and raster images and photo sources, keeps tokens, vectors and text", () => {
    const svg = "data:image/svg+xml;utf8,<svg/>";
    const out = juniorSafeAddedLayers([
      { id: "t", kind: "text", content: "https://club.example.org", geometry: g },
      { id: "logo", kind: "image", content: "{{clubLogo}}", geometry: g },
      { id: "vec", kind: "image", content: svg, geometry: g },
      { id: "up", kind: "image", content: "/api/storage/objects/uploads/2/a.png", geometry: g },
      { id: "kid", kind: "image", content: "/api/juniors/photos/12", geometry: g },
      { id: "web", kind: "image", content: "https://cdn.example.org/team.jpg", geometry: g },
      { id: "raw", kind: "image", content: "data:image/png;base64,AAAA", geometry: g },
      {
        id: "grp",
        kind: "group",
        geometry: g,
        children: [
          { id: "inner", kind: "image", content: "/objects/library/1/x.jpg", geometry: g },
          { id: "p", kind: "photo", geometry: g, source: { kind: "collection", collectionId: 3 } },
        ],
      },
      {
        id: "bg",
        kind: "shape",
        geometry: g,
        style: { backgroundImage: "/api/storage/objects/library/1/x.jpg" },
      },
    ]);
    expect(out.map((l) => l.id)).toEqual(["t", "logo", "vec", "grp", "bg"]);
    const group = out.find((l) => l.id === "grp") as unknown as { children: object[] };
    expect(group.children).toEqual([{ id: "p", kind: "photo", geometry: g }]);
    expect(JSON.stringify(out)).not.toContain("/objects/");
    expect(out[0]).toMatchObject({ content: "https://club.example.org" });
  });
});
