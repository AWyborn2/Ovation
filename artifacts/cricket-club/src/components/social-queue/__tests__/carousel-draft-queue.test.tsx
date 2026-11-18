/**
 * A 14-slide queued carousel in the queue drawer (dev retest 4, set 968): the
 * reviewer steps through every slide with Next and Previous, and the drawer
 * keeps exactly one "Slide N of 14" block however often it re-renders. The
 * carousel preview and the schedule panel once shared the draft id as their
 * key, and every re-render appended another "Slide 1 of 14" block.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import AdminSocialQueue from "@/pages/admin-social-queue";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { renderAt } from "@/test/render";
import {
  matchDayFixtureContent,
  matchDaySponsorsContent,
  matchDayTitleContent,
  presetFields,
} from "@workspace/scorecard/card-content";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const bookend = {
  heading: "This weekend",
  from: "2026-10-09",
  to: "2026-10-11",
  roundLabels: ["3"],
  fixtureCount: 12,
};
const slide = (id: string, label: string, content: unknown) => ({
  id,
  label,
  content,
  visibleFields: [...presetFields("matchDay", "standard")],
  photoId: null,
  data: {},
  junior: false,
  sponsorsOn: true,
  warnings: [],
});
const fixtures = Array.from({ length: 12 }, (_, i) =>
  slide(
    `fixture-${i + 1}`,
    `Grade ${i + 1} v Waroona`,
    matchDayFixtureContent({
      id: i + 1,
      grade: `Grade ${i + 1}`,
      roundLabel: "Round 3",
      opponentName: "Waroona Cricket Club",
      opponentLogoUrl: null,
      venue: "Oval",
      startAt: new Date("2026-10-10T02:00:00Z"),
      isHome: true,
    }),
  ),
);

const CAROUSEL = {
  id: 968,
  engine: "ondemand",
  family: "matchday",
  status: "awaiting_review",
  appPath: "/fixtures",
  trackedSlug: null,
  sourceMatchIsJunior: false,
  caption: "This weekend",
  photoUrl: null,
  photoSource: null,
  staleSince: null,
  createdAt: "2026-10-20T10:00:00Z",
  packId: "blank",
  templateVersion: 1,
  layoutCheckPending: false,
  layoutWarnings: { square: [] },
  cardInput: {
    kind: "matchDay",
    weekendCarousel: {
      version: 3,
      templateRef: { copyId: 12, version: 4 },
      setType: "matchDay",
      submissionId: "12345678-1234-1234-1234-123456789abc",
      size: "square",
      slides: [
        slide("title", "Title page", matchDayTitleContent(bookend)),
        ...fixtures,
        slide("sponsors", "Sponsors", matchDaySponsorsContent({ ...bookend, sponsors: [] })),
      ],
    },
  },
  // No set design of its own: the drawer draws it with the carousel preview.
  adjustments: null,
};

function open() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      let payload: unknown = [];
      if (/pending-count/.test(url)) payload = { count: 1 };
      else if (/\/api\/social-drafts(\?|$)/.test(url)) payload = [CAROUSEL];
      else if (/social-settings/.test(url))
        payload = { settings: { clubUrl: "", familyConfig: {} }, captionTemplates: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  renderAt(
    <ConfirmProvider>
      <AdminSocialQueue />
    </ConfirmProvider>,
    "/admin/social/queue",
  );
}

describe("reviewing a 14-slide carousel in the queue", () => {
  it("steps through every slide in one block, however often the drawer re-renders", async () => {
    const errors = vi.spyOn(console, "error");
    open();
    fireEvent.click(await screen.findByText("14 slides"));
    const dialog = await screen.findByRole("dialog");
    const blocks = () =>
      within(dialog).getAllByRole("region", { name: "Carousel review preview" }).length;
    const headings = () =>
      within(dialog)
        .getAllByText(/^Slide \d+ of \d+$/)
        .map((h) => h.textContent);
    const caption = within(dialog).getByLabelText("Caption");

    expect(headings()).toEqual(["Slide 1 of 14"]);
    expect(within(dialog).getByRole("button", { name: "Previous slide" })).toBeDisabled();
    for (let n = 2; n <= 14; n++) {
      fireEvent.click(within(dialog).getByRole("button", { name: "Next slide" }));
      // Typing re-renders the whole drawer, as a refetch or a save does.
      fireEvent.change(caption, { target: { value: `Caption ${n}` } });
      expect(blocks()).toBe(1);
      expect(headings()).toEqual([`Slide ${n} of 14`]);
    }
    expect(within(dialog).getByRole("button", { name: "Next slide" })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Previous slide" }));
    expect(headings()).toEqual(["Slide 13 of 14"]);
    expect(blocks()).toBe(1);

    const duplicateKeys = errors.mock.calls.filter((c) =>
      String(c[0]).includes("Encountered two children with the same key"),
    );
    expect(duplicateKeys).toEqual([]);
  });
});
