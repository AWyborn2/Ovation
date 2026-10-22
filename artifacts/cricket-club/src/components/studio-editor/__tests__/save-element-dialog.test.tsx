/** "Save as element" publishes the stripped selection (editable-elements plan, D4). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderAt } from "../../../test/render";
import type { FreeLayer } from "@/lib/pack-render";
import { SaveElementDialog } from "../save-element-dialog";

type Sent = { url: string; method: string; body: unknown };

function stubApi(respond: (req: Sent) => { status: number; body: unknown }) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const req = {
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      };
      sent.push(req);
      const { status, body } = respond(req);
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return sent;
}

afterEach(() => vi.unstubAllGlobals());

const layers: FreeLayer[] = [
  {
    id: "a",
    kind: "shape",
    geometry: { square: { x: 0, y: 80, w: 100, h: 10 } },
    style: { background: "#F5B400" },
  },
  {
    id: "b",
    kind: "text",
    content: "Seaview rules",
    geometry: { square: { x: 4, y: 82, w: 50, h: 6 } },
  },
  {
    id: "c",
    kind: "medal",
    name: "Century medal",
    geometry: { square: { x: 4, y: 4, w: 9, h: 9 } },
  },
];
const context = {
  logoUrl: null,
  clubNames: ["Seaview"],
  colours: { "--gold": "#F5B400" },
};

function open() {
  renderAt(
    <SaveElementDialog
      layers={layers}
      context={context}
      clubName="Seaview CC"
      open
      onClose={() => {}}
    />,
  );
}

describe("SaveElementDialog", () => {
  it("says it's public and what is left out", () => {
    stubApi(() => ({ status: 200, body: [] }));
    open();
    expect(screen.getByText(/credited to Seaview CC/)).toBeTruthy();
    expect(screen.getByText(/Left out .*Century medal/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Publish element" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("publishes the stripped layers with the name, category and tags", async () => {
    const sent = stubApi((req) =>
      req.method === "POST"
        ? { status: 201, body: { id: 3, name: "Accent band" } }
        : { status: 200, body: [] },
    );
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Element name" }), {
      target: { value: "Accent band" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Element category" }), {
      target: { value: "bands" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Element tags" }), {
      target: { value: "Band, slash, band" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish element" }));
    expect(await screen.findByText(/is in the element library now/)).toBeTruthy();
    const post = sent.find((r) => r.method === "POST")!;
    expect(post.url).toMatch(/\/template-library\/elements$/);
    expect(post.body).toEqual({
      name: "Accent band",
      category: "bands",
      tags: ["band", "slash"],
      document: {
        formatVersion: 2,
        layers: [
          {
            id: "e1",
            kind: "shape",
            geometry: { square: { x: 0, y: 80, w: 100, h: 10 } },
            style: { background: "var(--gold)" },
          },
          {
            id: "e2",
            kind: "text",
            content: "{{clubName}} rules",
            geometry: { square: { x: 4, y: 82, w: 50, h: 6 } },
          },
        ],
      },
    });
  });

  it("shows the server's reasons when it refuses", async () => {
    stubApi((req) =>
      req.method === "POST"
        ? {
            status: 400,
            body: { error: "This element can't be saved.", errors: ["element/e1 refers to x."] },
          }
        : { status: 200, body: [] },
    );
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Element name" }), {
      target: { value: "Band" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish element" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/can't be saved\. element\/e1/),
    );
  });
});
