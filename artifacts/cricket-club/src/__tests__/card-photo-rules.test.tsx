/**
 * Card photo rules on the photo library page: rules list as grouped rows, the
 * editor saves one grade + several card types in one request, "Use for…" opens
 * it with that photo chosen, and junior-graded photos are never offered.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import AdminPhotoLibrary from "@/pages/admin-photo-library";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const photo = (id: number, grade: string | null = null) => ({
  id,
  url: `/api/storage/objects/library/${id}`,
  thumbUrl: `/api/storage/objects/library/${id}-t`,
  width: 100,
  height: 100,
  season: null,
  grade,
  takenAt: null,
  createdAt: "2026-09-20T10:00:00Z",
  playerIds: [],
});

const rule = (id: number, grade: string, cardKind: string, mode: string, photoId?: number) => ({
  id,
  grade,
  cardKind,
  mode,
  photoId: photoId ?? null,
  photoThumbUrl: photoId ? `/api/storage/objects/library/${photoId}-t` : null,
  updatedAt: "2026-09-24T10:00:00Z",
});

type Req = { method: string; url: string; body: unknown };

function stubApi(rules: unknown[] = []) {
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      requests.push({
        method,
        url,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      let payload: unknown = [];
      if (method === "GET" && url.includes("/club-photos"))
        payload = [photo(1, "A Grade"), photo(2), photo(3, "Under 15")];
      else if (method === "GET" && url.includes("/card-photo-rules")) payload = rules;
      else if (method === "GET" && url.includes("/grades"))
        payload = [{ grade: "B Grade" }, { grade: "A Grade" }, { grade: "Under 15" }];
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

describe("card photo rules", () => {
  it("lists rules as one row per grade, mode and photo", async () => {
    stubApi([
      rule(1, "A Grade", "teamList", "fixed", 2),
      rule(2, "A Grade", "matchSummary", "fixed", 2),
      rule(3, "B Grade", "century", "random"),
    ]);
    renderAt(<AdminPhotoLibrary />, "/admin/social/library");
    const list = await screen.findByRole("list", { name: "Card photo rules" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("A Grade");
    expect(rows[0].textContent).toContain("Match Summary, Team List");
    expect(rows[0].textContent).toContain("One photo");
    expect(rows[0].querySelector("img")?.getAttribute("src")).toBe(
      "/api/storage/objects/library/2-t",
    );
    expect(rows[1].textContent).toContain("Century");
    expect(rows[1].textContent).toContain("Random grade photo");
  });

  it("“Use for…” saves that photo for a grade's match results and team lists in one request", async () => {
    const requests = stubApi();
    renderAt(<AdminPhotoLibrary />, "/admin/social/library");
    fireEvent.click(await screen.findByRole("button", { name: "Use photo 2 for cards" }));

    // The photo is already chosen; junior-graded photos are not offered.
    const picker = await screen.findByRole("list", { name: "Choose a photo" });
    expect(
      within(picker).getByRole("button", { name: "Use photo 2" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(within(picker).queryByRole("button", { name: /Use photo 3/ })).toBeNull();

    const grade = screen.getByLabelText("Grade") as HTMLSelectElement;
    expect(Array.from(grade.options).map((o) => o.value)).not.toContain("Under 15");
    fireEvent.change(grade, { target: { value: "A Grade" } });
    fireEvent.click(screen.getByRole("button", { name: "Match Summary" }));
    fireEvent.click(screen.getByRole("button", { name: "Team List" }));
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));

    await waitFor(() => {
      const put = requests.find((r) => r.method === "PUT" && r.url.includes("/card-photo-rules"));
      expect(put?.body).toEqual({
        grade: "A Grade",
        cardKinds: ["matchSummary", "teamList"],
        mode: "fixed",
        photoId: 2,
      });
    });
  });

  it("a random rule can narrow to a photo type, and the row shows it", async () => {
    const requests = stubApi([
      { ...rule(4, "B Grade", "fiveFor", "random"), photoType: "bowling" },
    ]);
    renderAt(<AdminPhotoLibrary />, "/admin/social/library");
    const list = await screen.findByRole("list", { name: "Card photo rules" });
    expect(within(list).getAllByRole("listitem")[0].textContent).toContain("Bowling");

    fireEvent.click(screen.getByRole("button", { name: "Add a rule" }));
    // No type choice for a one-photo rule.
    fireEvent.click(screen.getByLabelText(/One photo/));
    expect(screen.queryByLabelText("Photo type")).toBeNull();
    fireEvent.click(screen.getByLabelText(/Random grade photo/));
    fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "A Grade" } });
    fireEvent.click(screen.getByRole("button", { name: "Ladder" }));
    fireEvent.change(screen.getByLabelText("Photo type"), { target: { value: "team" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));

    await waitFor(() => {
      const put = requests.find((r) => r.method === "PUT" && r.url.includes("/card-photo-rules"));
      expect(put?.body).toEqual({
        grade: "A Grade",
        cardKinds: ["ladder"],
        mode: "random",
        photoType: "team",
      });
    });
  });

  it("junior-graded photos get no “Use for…” action", async () => {
    stubApi();
    renderAt(<AdminPhotoLibrary />, "/admin/social/library");
    await screen.findByRole("button", { name: "Use photo 1 for cards" });
    expect(screen.queryByRole("button", { name: "Use photo 3 for cards" })).toBeNull();
  });

  it("a one-photo rule needs a photo before it saves", async () => {
    const requests = stubApi();
    renderAt(<AdminPhotoLibrary />, "/admin/social/library");
    fireEvent.click(await screen.findByRole("button", { name: "Add a rule" }));
    fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "B Grade" } });
    fireEvent.click(screen.getByRole("button", { name: "Century" }));
    fireEvent.click(screen.getByLabelText(/One photo/));
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(await screen.findByText("Choose a photo.")).toBeTruthy();
    expect(requests.some((r) => r.method === "PUT")).toBe(false);
  });

  it("carries no raw hex colours", () => {
    const f = join(__dirname, "..", "components", "social-queue", "card-photo-rules.tsx");
    expect(readFileSync(f, "utf8").match(/#[0-9a-fA-F]{6}\b/g)).toBeNull();
  });
});
