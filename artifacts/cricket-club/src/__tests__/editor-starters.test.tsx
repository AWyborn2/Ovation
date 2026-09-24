/**
 * Social Studio U18 — ways into the editor from Create a card: the composed
 * card, a blank canvas, or a saved template; and the editor's Save as template.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { EditorStarters } from "@/components/social-studio/editor-starters";
import { SaveTemplateButton } from "@/components/studio-editor/save-template";
import { renderAt } from "@/test/render";
import type { ShareCardInput } from "@/lib/share-card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Req = { method: string; url: string; body: unknown };

const TEMPLATES = [
  {
    id: 3,
    name: "Signing with game time",
    baseKind: "newSigning",
    packId: "broadcast-dark",
    adjustments: {},
    createdAt: "2026-09-20T00:00:00Z",
  },
];

function stubApi(): Req[] {
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      let payload: unknown = [];
      if (method === "GET" && /editor-templates/.test(url)) payload = TEMPLATES;
      else if (method === "POST" && /\/social-drafts$/.test(url)) payload = { id: 42 };
      else if (/save-template/.test(url)) payload = { ...TEMPLATES[0], id: 9 };
      return new Response(JSON.stringify(payload), {
        status: method === "POST" ? 201 : 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

const century = { kind: "century", playerName: "Sam Keeper", runs: 104 } as ShareCardInput;
const signing = { kind: "newSigning", playerName: "Sample Player" } as ShareCardInput;

function mount() {
  const requests = stubApi();
  const inputFor = vi.fn(() => signing);
  renderAt(
    <EditorStarters input={century} packId="broadcast-dark" inputFor={inputFor} />,
    "/admin/social/create",
  );
  return { requests, inputFor };
}

const posted = (requests: Req[]) =>
  requests.filter((r) => r.method === "POST" && /\/social-drafts$/.test(r.url));

describe("EditorStarters", () => {
  it("Open in editor starts an ad-hoc card from the composed card and its pack", async () => {
    const { requests } = mount();
    fireEvent.click(screen.getByRole("button", { name: /open in editor/i }));
    await waitFor(() => expect(posted(requests)).toHaveLength(1));
    expect(posted(requests)[0].body).toEqual({ cardInput: century, packId: "broadcast-dark" });
  });

  it("Blank canvas starts a card with the blank pack", async () => {
    const { requests } = mount();
    fireEvent.click(screen.getByRole("button", { name: /blank canvas/i }));
    await waitFor(() => expect(posted(requests)).toHaveLength(1));
    expect(posted(requests)[0].body).toEqual({ cardInput: century, packId: "blank" });
  });

  it("lists saved templates; Create from this uses a card of the template's type", async () => {
    const { requests, inputFor } = mount();
    expect(await screen.findByText("Signing with game time")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /create from this/i }));
    await waitFor(() => expect(posted(requests)).toHaveLength(1));
    expect(inputFor).toHaveBeenCalledWith("newSigning");
    expect(posted(requests)[0].body).toEqual({ cardInput: signing, templateId: 3 });
  });
});

describe("SaveTemplateButton", () => {
  it("saves pending edits first, then the template under its name", async () => {
    const requests = stubApi();
    const order: string[] = [];
    const beforeSave = vi.fn(async () => {
      order.push("draft");
    });
    renderAt(<SaveTemplateButton draftId={7} beforeSave={beforeSave} />, "/admin/social/editor/7");
    fireEvent.click(screen.getByRole("button", { name: /save as template/i }));
    const save = screen.getByRole("button", { name: /save template/i });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/template name/i), {
      target: { value: "  Game day  " },
    });
    fireEvent.click(save);
    expect(await screen.findByText(/find it under your templates/i)).toBeTruthy();
    expect(beforeSave).toHaveBeenCalledOnce();
    const call = requests.find((r) => /social-drafts\/7\/save-template/.test(r.url));
    expect(call?.body).toEqual({ name: "Game day" });
    expect(order).toEqual(["draft"]);
  });
});
