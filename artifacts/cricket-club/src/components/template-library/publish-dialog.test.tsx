/** Publish a club template to the library (release 2, ADR-012 TB.6) and New design (TB.1). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { LibraryTemplate, PublishPreview } from "@workspace/api-client-react";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import { renderAt, renderWithHistory } from "@/test/render";
import { PublishDialog, publishStatusLine } from "./publish-dialog";
import { NewDesignButton } from "./your-templates";

const TAGS = [
  "photo-led",
  "bold-type",
  "minimal",
  "dark",
  "light",
  "retro",
  "broadcast",
  "textured",
];

const preview = (over: Partial<PublishPreview> = {}): PublishPreview => ({
  document: placeholderDocument("milestone") as PublishPreview["document"],
  changes: [],
  flags: [],
  assetErrors: [],
  tagChecks: TAGS.map((tag) => ({
    tag: tag as PublishPreview["tagChecks"][number]["tag"],
    ok: tag !== "photo-led",
    reason: tag === "photo-led" ? "A photo needs to cover at least 30% of the main page." : null,
  })),
  published: null,
  ...over,
});

const libraryTemplate = (over: Partial<LibraryTemplate> = {}): LibraryTemplate => ({
  id: 40,
  slug: null,
  kind: "milestone",
  name: "Our milestone",
  origin: "club",
  authorName: "Demo Cricket Club",
  look: null,
  version: 1,
  coverage: { pages: ["card"], sizes: ["square"] },
  fitStatus: "pass",
  fitReport: null,
  listed: true,
  document: placeholderDocument("milestone"),
  tags: [],
  usedBy: 0,
  ownedByClub: true,
  ...over,
});

type Write = { method: string; url: string; body: unknown };

/** Serve `GET publish-preview` from `previews` (in turn, the last repeating) and record writes. */
function api(
  previews: PublishPreview[],
  onWrite: (w: Write) => { status: number; body: unknown } = () => ({
    status: 202,
    body: { libraryTemplateId: 40, version: 1, fitStatus: "pending", listed: false },
  }),
) {
  const writes: Write[] = [];
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      let status = 200;
      let body: unknown = [];
      if (method !== "GET") {
        const w = { method, url, body: init?.body ? JSON.parse(String(init.body)) : null };
        writes.push(w);
        ({ status, body } = onWrite(w));
      } else if (url.includes("/publish-preview")) {
        body = previews[Math.min(reads++, previews.length - 1)];
      } else if (url.includes("/template-library/preview-input")) {
        body = { kind: "milestone", source: "sample", input: null };
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return writes;
}

function open(props: Partial<Parameters<typeof PublishDialog>[0]> = {}) {
  const onSelectLayer = vi.fn();
  renderAt(
    <PublishDialog
      copyId={7}
      kind="milestone"
      name="Our milestone"
      dirty={false}
      open
      onClose={() => {}}
      onSelectLayer={onSelectLayer}
      {...props}
    />,
  );
  return { onSelectLayer };
}

afterEach(() => vi.unstubAllGlobals());

describe("the Publish dialog", () => {
  it("publishes with the name, tags and rights confirmation, then follows the check to listed", async () => {
    const writes = api([
      preview(),
      preview({ published: libraryTemplate({ fitStatus: "pending", listed: false }) }),
      preview({ published: libraryTemplate({ usedBy: 2 }) }),
    ]);
    open();
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("What other clubs see")).toBeInTheDocument();
    const publish = within(dialog).getByRole("button", { name: "Publish" });
    expect(publish).toBeDisabled();

    // A tag the design can't carry is off; the others can be picked.
    expect(within(dialog).getByRole("checkbox", { name: "Photo-led" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Dark" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /has the rights/ }));
    expect(publish).toBeEnabled();
    fireEvent.click(publish);

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.url).toContain("/club-templates/7/publish");
    expect(writes[0]!.body).toEqual({
      name: "Our milestone",
      tags: ["dark"],
      rightsConfirmed: true,
    });
    expect(await within(dialog).findByText(/checking the layout/)).toBeInTheDocument();
    expect(
      await within(dialog).findByText(/is in the library · used by 2 clubs/, {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("lists text that names the club or a sponsor; each selects its layer, and blocks publishing", async () => {
    api([
      preview({
        flags: [
          { page: "card", layerId: "t1", kind: "clubName", text: "Demo Cricket Club" },
          { page: "card", layerId: "t2", kind: "sponsorName", text: "Acme Plumbing" },
        ],
      }),
    ]);
    const { onSelectLayer } = open();
    const dialog = await screen.findByRole("dialog");
    const flags = await within(dialog).findByRole("region", { name: "Text to change" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /has the rights/ }));
    expect(within(dialog).getByRole("button", { name: "Publish" })).toBeDisabled();
    fireEvent.click(within(flags).getByRole("button", { name: /Acme Plumbing.*names a sponsor/ }));
    expect(onSelectLayer).toHaveBeenCalledWith("card", "t2");
  });

  it("shows the server's flags when it refuses with 422", async () => {
    api([preview()], () => ({
      status: 422,
      body: {
        error: "Some text still names your club or a sponsor. Make it a field before publishing.",
        flags: [{ page: "card", layerId: "t9", kind: "clubName", text: "Demo" }],
        assetErrors: [],
      },
    }));
    open();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("checkbox", { name: /has the rights/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    expect(
      await within(dialog).findByRole("button", { name: /“Demo” names your club/ }),
    ).toBeInTheDocument();
  });

  it("asks for unsaved changes to be saved first", async () => {
    api([preview()]);
    open({ dirty: true });
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/Save your changes first/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /has the rights/ }));
    expect(within(dialog).getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("offers a new version of a published template, with its failed report", async () => {
    api([
      preview({
        published: libraryTemplate({
          version: 2,
          listed: false,
          fitStatus: "fail",
          tags: ["minimal"],
          fitReport: {
            status: "fail",
            checked: 4,
            issues: [{ variant: "card/square/long", reason: "text overflows", layerId: "t1" }],
          } as unknown as LibraryTemplate["fitReport"],
        }),
      }),
    ]);
    open();
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/didn't pass the layout check/)).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Minimal" })).toBeChecked();
    expect(
      within(dialog).getByRole("button", { name: "Publish a new version" }),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Show the report" }));
    expect(within(dialog).getByText("card/square/long")).toBeInTheDocument();
  });
});

describe("publishStatusLine", () => {
  it("names each state", () => {
    expect(publishStatusLine(null)).toBeNull();
    expect(publishStatusLine(libraryTemplate({ listed: false, fitStatus: "pass" }))?.tone).toBe(
      "off",
    );
    expect(publishStatusLine(libraryTemplate({ usedBy: 1 }))?.text).toContain("used by 1 club.");
  });
});

describe("New design", () => {
  it("starts a blank template for the chosen card and opens it in the editor", async () => {
    const writes = api([], () => ({
      status: 201,
      body: { id: 55, kind: "record", name: "New design" },
    }));
    const { url } = renderWithHistory(<NewDesignButton />, "/admin/social/template-library");
    fireEvent.change(screen.getByRole("combobox", { name: "Card for the new design" }), {
      target: { value: "record" },
    });
    fireEvent.click(screen.getByRole("button", { name: "New design" }));
    await waitFor(() => expect(url()).toBe("/admin/social/template/55"));
    expect(writes[0]!.url).toContain("/club-templates/blank");
    expect(writes[0]!.body).toEqual({ kind: "record" });
  });
});
