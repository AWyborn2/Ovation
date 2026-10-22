/**
 * Console → AI designer (ADR-011 L7-B, T7.11, T7.13): the form says what is sent, takes a
 * brief and an uploaded image, shows each design's status and cost, links to the template it
 * made, and shows the quality bar and cost per design.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderAt } from "@/test/render";
import AiDesignerPage, { dollars } from "./ai-designer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const gen = (over: Record<string, unknown> = {}) => ({
  id: 1,
  kind: "milestone",
  model: "claude-opus-5-5",
  status: "done",
  outcome: "pass",
  attempts: 1,
  firstTryFit: true,
  tokens: { input: 1000, output: 20000, cacheRead: 3000, cacheWrite: 0 },
  costUsd: 0.412,
  result: { libraryTemplateId: 77, version: 1 },
  errors: [],
  createdAt: "2026-10-22T01:00:00.000Z",
  finishedAt: "2026-10-22T01:03:00.000Z",
  ...over,
});

function stubApi(designer: Record<string, unknown> = {}) {
  const posts: FormData[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      let payload: unknown = {};
      let status = 200;
      if (method === "POST" && /designer\/generations$/.test(url)) {
        posts.push(init!.body as FormData);
        status = 202;
        payload = gen({ id: 3, status: "queued", outcome: null, result: null });
      } else if (/library\/designer$/.test(url)) {
        payload = {
          configured: true,
          model: "claude-opus-5-5",
          quality: { counted: 4, firstTryFit: 3, meanCostUsd: 0.5 },
          generations: [
            gen(),
            gen({
              id: 2,
              status: "failed",
              outcome: "invalid",
              result: null,
              attempts: 3,
              errors: ["card needs a list of layers."],
            }),
          ],
          ...designer,
        };
      }
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return posts;
}

describe("AI designer page", () => {
  it("formats dollars", () => {
    expect(dollars(0.412)).toBe("US$0.41");
    expect(dollars(null)).toBe("—");
  });

  it("says what is sent, and never a club's data", () => {
    stubApi();
    renderAt(<AiDesignerPage />, "/platform-admin/designer");
    const note = screen.getByRole("note");
    expect(note.textContent).toMatch(/your brief, the image you upload here/);
    expect(note.textContent).toMatch(/No club.s name, colours, players, photos or results/);
  });

  it("shows each design, its cost and its template, and the designer's figures", async () => {
    stubApi();
    renderAt(<AiDesignerPage />, "/platform-admin/designer");
    const rows = within(await screen.findByTestId("ai-generations")).getAllByRole("listitem");
    expect(rows[0]!.textContent).toMatch(/Milestone.*Done.*Fits/);
    expect(rows[0]!.textContent).toMatch(/1 try · US\$0\.41/);
    expect(
      within(rows[0]!).getByRole("link", { name: "Open the template" }).getAttribute("href"),
    ).toBe("/platform-admin/library/77/edit");
    expect(rows[1]!.textContent).toMatch(/Failed.*No valid design.*3 tries/);
    expect(rows[1]!.textContent).toMatch(/needs a list of layers/);
    const figures = screen.getByTestId("designer-figures").textContent;
    expect(figures).toMatch(/75% \(3 of 4\).*target 70%/);
    expect(figures).toMatch(/US\$0\.50/);
  });

  it("says when the server has no API key, and won't start", async () => {
    stubApi({ configured: false });
    renderAt(<AiDesignerPage />, "/platform-admin/designer");
    expect((await screen.findByRole("status")).textContent).toMatch(/ANTHROPIC_API_KEY/);
    fireEvent.change(screen.getByRole("textbox", { name: /Brief/ }), { target: { value: "x" } });
    expect((screen.getByRole("button", { name: "Design it" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("sends the kind, brief and image as a form", async () => {
    const posts = stubApi();
    renderAt(<AiDesignerPage />, "/platform-admin/designer");
    await screen.findByTestId("ai-generations");
    const button = screen.getByRole("button", { name: "Design it" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Card kind" }), {
      target: { value: "record" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Brief/ }), {
      target: { value: "Neon outlines" },
    });
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "ref.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText(/Reference image/), { target: { files: [png] } });
    fireEvent.click(button);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.get("kind")).toBe("record");
    expect(posts[0]!.get("brief")).toBe("Neon outlines");
    expect((posts[0]!.get("image") as File).name).toBe("ref.png");
  });

  it("refuses an image that isn't a PNG or JPEG before sending it", () => {
    stubApi();
    renderAt(<AiDesignerPage />, "/platform-admin/designer");
    const gif = new File(["GIF89a"], "ref.gif", { type: "image/gif" });
    fireEvent.change(screen.getByLabelText(/Reference image/), { target: { files: [gif] } });
    expect(screen.getByRole("alert").textContent).toMatch(/PNG or a JPEG/);
  });
});
