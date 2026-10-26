/**
 * A carousel set draft in the queue (carousel set editor plan, part 3): the
 * drawer previews it slide by slide with its set design, once, and links to
 * the set editor; the row counts the slides it posts.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import AdminSocialQueue from "@/pages/admin-social-queue";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const box = { x: 5, y: 5, w: 90, h: 20 };
const geometry = { square: box, portrait: box, story: box, landscape: box };
const page = (id: string, slot: string, kind: string, p: string) => ({
  id,
  role: slot === "team" ? "repeat" : "fixed",
  slot,
  kind,
  page: p,
  layers: [{ id: `${id}-1`, kind: "text", content: id.toUpperCase(), geometry }],
});

const ROUND = {
  id: 42,
  engine: "teamlists-round",
  family: "matchday",
  status: "awaiting_review",
  appPath: "/fixtures",
  trackedSlug: null,
  sourceMatchIsJunior: false,
  caption: "Round 15 team lists",
  photoUrl: null,
  photoSource: null,
  staleSince: null,
  createdAt: "2026-10-20T10:00:00Z",
  packId: "blank",
  templateVersion: 1,
  layoutCheckPending: false,
  layoutWarnings: { square: [] },
  cardInput: {
    kind: "teamListRound",
    roundLabel: "Round 15",
    date: "Saturday 14 Feb",
    teams: ["A Grade", "B Grade", "C Grade"].map((grade) => ({
      grade,
      players: [{ surname: "SMITH", order: 1 }],
    })),
  },
  adjustments: {
    formatVersion: 2,
    set: "teamLists",
    pages: [
      page("cover", "cover", "teamListRound", "card"),
      page("team", "team", "teamList", "team"),
      page("sponsors", "sponsors", "matchDay", "sponsors"),
    ],
    arrangement: {
      order: [
        "detail:senior:C Grade",
        "page:cover",
        "detail:senior:A Grade",
        "detail:senior:B Grade",
      ],
      removed: ["page:sponsors"],
    },
  },
};

function open() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      let payload: unknown = [];
      if (/pending-count/.test(url)) payload = { count: 1 };
      else if (/\/api\/social-drafts(\?|$)/.test(url)) payload = [ROUND];
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

describe("a carousel set draft in the queue", () => {
  it("counts the slides it posts, as arranged", async () => {
    open();
    expect(await screen.findByText("4 slides")).toBeTruthy();
  });

  it("previews the arranged slides once, and opens the set editor", async () => {
    open();
    fireEvent.click(await screen.findByText("4 slides"));
    const dialog = await screen.findByRole("dialog");
    const previews = within(dialog).getAllByRole("region", { name: "Carousel review preview" });
    expect(previews).toHaveLength(1);
    expect(within(dialog).getByText("Slide 1 of 4")).toBeTruthy();
    // C Grade was moved first; the sponsors slide was deleted.
    expect(within(dialog).getByText("C Grade")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Next slide" }));
    expect(within(dialog).getByText("Cover")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Edit set" }).getAttribute("href")).toBe(
      "/admin/social/set/42",
    );
    // The card editor isn't offered for a set.
    expect(within(dialog).queryByRole("link", { name: "Open in editor" })).toBeNull();
  });
});
