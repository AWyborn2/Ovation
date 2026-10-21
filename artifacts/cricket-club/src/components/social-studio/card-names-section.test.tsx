import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { CardNamesListing, JuniorCardNamesListing } from "@workspace/api-client-react";
import { renderAt } from "../../test/render";
import { installApiMock } from "../../test/mock-api";
import { CardNamesSection } from "./card-names-section";

const name = (over: Partial<CardNamesListing["teams"][number]>) => ({
  centralClubId: 20,
  gradeKey: null,
  rawName: "SJ Blues Cricket Club",
  autoName: "SJ Blues",
  overrideName: null,
  name: "SJ Blues",
  source: "auto" as const,
  crestUrl: null,
  crestSource: "auto" as const,
  autoCrestUrl: null,
  monogram: "SB",
  isOwnClub: false,
  teamNames: ["SJ Blues Senior Women"],
  grades: [],
  ...over,
});

const LISTING: CardNamesListing = {
  available: true,
  teams: [
    name({
      centralClubId: 1,
      rawName: "Halls Head Cricket Club",
      autoName: "Halls Head",
      name: "Halls Head",
      monogram: "HH",
      isOwnClub: true,
    }),
    name({
      centralClubId: 5,
      rawName: "Mandurah Cricket Club",
      autoName: "Mandurah",
      overrideName: "Mandurah Mariners",
      name: "Mandurah Mariners",
      source: "override",
      crestUrl: "https://img.test/mcc.png",
    }),
    name({}),
  ],
  competitions: [
    {
      gradeKey: "Female A Grade",
      rawLabel: "Female A Grade",
      autoLabel: "Female A Grade",
      overrideLabel: null,
      label: "Female A Grade",
      source: "raw",
      rawLabels: ["Senior Female A Grade"],
    },
  ],
};

const JUNIOR_LISTING: JuniorCardNamesListing = {
  teams: [
    {
      teamKey: "mandurah",
      rawNames: ["Mandurah U13 Blue", "Mandurah U15"],
      autoName: "Mandurah",
      overrideName: null,
      name: "Mandurah",
      source: "auto",
      crestUrl: null,
      crestSource: "auto",
      autoCrestUrl: null,
      monogram: "MA",
    },
  ],
  competitions: [
    {
      gradeKey: "Year 7",
      rawLabel: "Year 7",
      autoLabel: "Year 7",
      overrideLabel: null,
      label: "Year 7",
      source: "raw",
      rawLabels: ["PJCA Year 7 Division 1"],
    },
  ],
};

const KNOWN = {
  crests: [
    {
      orgId: "org-mumcc",
      name: "Murdoch University Melville Cricket Club",
      logoUrl: "https://img.test/mumcc.png",
    },
    { orgId: "org-sj", name: "SJ Blues Cricket Club", logoUrl: "https://img.test/sj.png" },
  ],
};

/** The API mock plus a record of every write the section sends. */
function setup() {
  installApiMock({
    "/card-names/known-crests": KNOWN,
    "/juniors/card-names": JUNIOR_LISTING,
    "/social-settings/card-names": LISTING,
    "/social-settings": {},
  });
  const base = globalThis.fetch as unknown as (
    i: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  const writes: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET").toUpperCase() === "PUT") {
        writes.push({ url: String(input), body: JSON.parse(String(init?.body ?? "null")) });
        const junior = String(input).includes("/juniors/");
        return new Response(JSON.stringify(junior ? JUNIOR_LISTING : LISTING), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return base(input, init);
    }),
  );
  renderAt(<CardNamesSection />);
  return writes;
}

describe("CardNamesSection", () => {
  it("shows each club's name as cards print it, with its crest or monogram", async () => {
    setup();
    expect(await screen.findByLabelText("Card name for SJ Blues Cricket Club")).toHaveValue(
      "SJ Blues",
    );
    expect(screen.getByLabelText("Card name for Mandurah Cricket Club")).toHaveValue(
      "Mandurah Mariners",
    );
    expect(screen.getByText(/Your club · Halls Head Cricket Club/)).toBeInTheDocument();
    expect(screen.getByText("SB")).toBeInTheDocument();
    expect(screen.getByLabelText("Card label for Female A Grade")).toHaveValue("Female A Grade");
  });

  it("saves a changed name on blur, for every grade", async () => {
    const writes = setup();
    const field = await screen.findByLabelText("Card name for SJ Blues Cricket Club");
    fireEvent.change(field, { target: { value: "  Blues  " } });
    fireEvent.blur(field);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.url).toContain("/social-settings/card-names/teams");
    expect(writes[0]!.body).toEqual({ centralClubId: 20, gradeKey: null, shortName: "Blues" });
  });

  it("leaves an unchanged name alone, and Reset goes back to the automatic name", async () => {
    const writes = setup();
    const field = await screen.findByLabelText("Card name for SJ Blues Cricket Club");
    fireEvent.blur(field);
    fireEvent.click(
      screen.getByLabelText("Reset Card name for Mandurah Cricket Club to the automatic name"),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toEqual({ centralClubId: 5, gradeKey: null, shortName: null });
  });

  it("saves a competition label", async () => {
    const writes = setup();
    const field = await screen.findByLabelText("Card label for Female A Grade");
    fireEvent.change(field, { target: { value: "Women's A" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.blur(field);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.url).toContain("/social-settings/card-names/competitions");
    expect(writes[0]!.body).toEqual({ gradeKey: "Female A Grade", label: "Women's A" });
  });

  it("a crest can be set to the initials badge, a known crest, or reset", async () => {
    const writes = setup();
    // The club's own crest is its logo (Branding): no control.
    await screen.findByLabelText("Card name for SJ Blues Cricket Club");
    expect(screen.queryByLabelText("Change the crest for Halls Head")).toBeNull();

    fireEvent.click(screen.getByLabelText("Change the crest for SJ Blues"));
    fireEvent.click(await screen.findByRole("button", { name: /Use initials badge/ }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.url).toContain("/social-settings/card-names/crests");
    expect(writes[0]!.body).toEqual({ centralClubId: 20, crestSource: "initials", crestUrl: null });

    // The known-crest search starts from the automatic name.
    fireEvent.click(screen.getByLabelText("Change the crest for SJ Blues"));
    fireEvent.click(await screen.findByRole("button", { name: /SJ Blues Cricket Club/ }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]!.body).toEqual({
      centralClubId: 20,
      crestSource: "known",
      crestUrl: "https://img.test/sj.png",
    });
    expect(screen.queryByText("Murdoch University Melville Cricket Club")).toBeNull();
  });

  it("the Juniors tab names junior opponents and grades through the junior routes", async () => {
    const writes = setup();
    await screen.findByLabelText("Card name for SJ Blues Cricket Club");
    const tab = screen.getByRole("tab", { name: "Juniors" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const field = await screen.findByLabelText("Junior card name for Mandurah");
    expect(screen.getByText(/PlayHQ: Mandurah U13 Blue, Mandurah U15/)).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "Mariners" } });
    fireEvent.blur(field);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.url).toContain("/juniors/card-names/teams");
    expect(writes[0]!.body).toEqual({ teamKey: "mandurah", shortName: "Mariners" });

    const label = screen.getByLabelText("Card label for Year 7");
    fireEvent.change(label, { target: { value: "Yr 7" } });
    fireEvent.blur(label);
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]!.url).toContain("/juniors/card-names/competitions");

    fireEvent.click(screen.getByLabelText("Change the crest for Mandurah"));
    fireEvent.click(await screen.findByRole("button", { name: /Use initials badge/ }));
    await waitFor(() => expect(writes).toHaveLength(3));
    expect(writes[2]!.url).toContain("/juniors/card-names/crests");
    expect(writes[2]!.body).toEqual({
      teamKey: "mandurah",
      crestSource: "initials",
      crestUrl: null,
    });
    // Nothing junior was written to the senior routes.
    expect(writes.every((w) => w.url.includes("/juniors/"))).toBe(true);
  });

  it("says so when the club has no match data to name", async () => {
    installApiMock({
      "/social-settings/card-names": { available: false, teams: [], competitions: [] },
    });
    renderAt(<CardNamesSection />);
    expect(await screen.findByText(/once your club’s match data is connected/)).toBeInTheDocument();
  });
});
