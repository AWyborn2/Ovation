/**
 * Social Studio U18 — ways into the editor from Create a card: the composed
 * card, a blank canvas, a Club Kit design or a picked template.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { EditorStarters } from "@/components/social-studio/editor-starters";
import { OpenInEditorButton } from "@/components/studio-editor/open-in-editor";
import { renderAt } from "@/test/render";
import type { ShareCardInput } from "@/lib/share-card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Req = { method: string; url: string; body: unknown };

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
      if (method === "POST" && /\/social-drafts$/.test(url)) payload = { id: 42 };
      return new Response(JSON.stringify(payload), {
        status: method === "POST" ? 201 : 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

const century = { kind: "century", playerName: "Sam Keeper", runs: 104 } as ShareCardInput;

function mount() {
  const requests = stubApi();
  renderAt(<EditorStarters input={century} packId="broadcast-dark" />, "/admin/social/create");
  return { requests };
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

  it("Open in editor makes the draft from a picked template instead of the pack (ADR-011)", async () => {
    const requests = stubApi();
    renderAt(
      <EditorStarters
        input={century}
        packId="broadcast-dark"
        templateRef={{ libraryTemplateId: 7, version: 2 }}
      />,
      "/admin/social/create",
    );
    fireEvent.click(screen.getByRole("button", { name: /open in editor/i }));
    await waitFor(() => expect(posted(requests)).toHaveLength(1));
    expect(posted(requests)[0].body).toEqual({
      cardInput: century,
      templateRef: { libraryTemplateId: 7, version: 2 },
    });
  });

  it("Blank canvas starts a card with the blank pack", async () => {
    const { requests } = mount();
    fireEvent.click(screen.getByRole("button", { name: /blank canvas/i }));
    await waitFor(() => expect(posted(requests)).toHaveLength(1));
    expect(posted(requests)[0].body).toEqual({ cardInput: century, packId: "blank" });
  });

  it("starts on the Club Kit background: a blank canvas carrying the background element", async () => {
    const { requests } = mount();
    fireEvent.click(screen.getByRole("button", { name: /club kit background/i }));
    await waitFor(() => expect(posted(requests)).toHaveLength(1));
    const body = posted(requests)[0].body as {
      packId: string;
      adjustments: { layers: { kind: string; element: { id: string } }[] };
    };
    expect(body.packId).toBe("blank");
    expect(body.adjustments.layers[0]).toMatchObject({
      kind: "element",
      element: { id: "ck.background" },
    });
  });

  it("offers no pack designs as starting points: new posts start from templates (T5.19)", () => {
    mount();
    expect(screen.queryByRole("button", { name: /Start from Club Kit/ })).toBeNull();
    expect(screen.queryByText(/Start from a Club Kit design/)).toBeNull();
  });
});

describe("OpenInEditorButton", () => {
  it("makes an ad-hoc draft of the card in its pack, then reports it opened", async () => {
    const requests = stubApi();
    const onOpened = vi.fn();
    renderAt(
      <OpenInEditorButton input={century} packId="broadcast-dark" onOpened={onOpened}>
        Open in editor
      </OpenInEditorButton>,
      "/players/1",
    );
    fireEvent.click(screen.getByRole("button", { name: /open in editor/i }));
    await waitFor(() => expect(onOpened).toHaveBeenCalledOnce());
    expect(posted(requests)[0].body).toEqual({ cardInput: century, packId: "broadcast-dark" });
  });
});
