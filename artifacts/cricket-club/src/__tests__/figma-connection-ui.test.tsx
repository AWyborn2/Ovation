/**
 * The club's Figma connection card and the Import from Figma dialog
 * (template library release 2, R2-E, TE.5). fetch is stubbed per path and
 * method.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { FigmaConnectionCard } from "@/components/template-library/figma-connection-card";
import { FigmaImportDialog } from "@/components/template-library/figma-import-dialog";
import { renderAt } from "@/test/render";

type Calls = { method: string; path: string; body: unknown }[];
type Answer = unknown | { status: number; body: unknown };

/** Stub fetch: "METHOD /path-substring" → body, or `{ status, body }`. */
function stubApi(routes: Record<string, Answer>): Calls {
  const calls: Calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: url, body });
      const key = Object.keys(routes).find((k) => {
        const [m, p] = k.split(" ");
        return m === method && url.includes(p!);
      });
      const route = key ? routes[key] : null;
      const withStatus =
        route && typeof route === "object" && "status" in route && "body" in route
          ? (route as { status: number; body: unknown })
          : { status: route === undefined ? 204 : 200, body: route };
      return new Response(withStatus.status === 204 ? null : JSON.stringify(withStatus.body), {
        status: withStatus.status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

const NONE = {
  connected: false,
  method: null,
  status: null,
  figmaHandle: null,
  statusReason: null,
  connectedAt: null,
  oauthAvailable: false,
};
const CONNECTED = {
  ...NONE,
  connected: true,
  method: "token",
  status: "connected",
  figmaHandle: "Club Designer",
  connectedAt: "2026-10-20T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("Figma connection card", () => {
  it("pastes a token without Sign in with Figma, and clears it after", async () => {
    const calls = stubApi({
      "GET /figma-connection": NONE,
      "POST /figma-connection/token": CONNECTED,
    });
    renderAt(<FigmaConnectionCard />, "/admin/social/cards");
    expect(await screen.findByText("Not connected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in with Figma" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Paste a token" }));
    const field = screen.getByLabelText("Figma personal access token") as HTMLInputElement;
    expect(field.type).toBe("password");
    fireEvent.change(field, { target: { value: "  figd_secret-token-value  " } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        token: "figd_secret-token-value",
      }),
    );
    await waitFor(() => expect(screen.queryByLabelText("Figma personal access token")).toBeNull());
  });

  it("says why Figma refused a pasted token", async () => {
    stubApi({
      "GET /figma-connection": NONE,
      "POST /figma-connection/token": {
        status: 400,
        body: { error: "Figma refused that token." },
      },
    });
    renderAt(<FigmaConnectionCard />, "/admin/social/cards");
    fireEvent.click(await screen.findByRole("button", { name: "Paste a token" }));
    fireEvent.change(screen.getByLabelText("Figma personal access token"), {
      target: { value: "figd_wrong-token-value" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText("Figma refused that token.")).toBeTruthy();
    expect((screen.getByLabelText("Figma personal access token") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("signs in with Figma when the server has a Figma app", async () => {
    stubApi({
      "GET /figma-connection": { ...NONE, oauthAvailable: true },
      "POST /figma-connection/oauth/start": { url: "https://www.figma.com/oauth?x=1" },
    });
    const assign = vi.fn();
    vi.stubGlobal("location", {
      ...window.location,
      assign,
      search: "",
      href: "http://localhost/",
    });
    renderAt(<FigmaConnectionCard />, "/admin/social/cards");
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with Figma" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://www.figma.com/oauth?x=1"));
  });

  it("explains a sign-in that came back with an error", async () => {
    window.history.replaceState(null, "", "/admin/social/cards?figma_error=expired#figma");
    stubApi({ "GET /figma-connection": NONE });
    renderAt(<FigmaConnectionCard />, "/admin/social/cards");
    expect(await screen.findByText(/took too long or was already used/)).toBeTruthy();
    expect(window.location.search).toBe("");
  });

  it("shows the account, a reconnect and asks before disconnecting", async () => {
    const calls = stubApi({
      "GET /figma-connection": {
        ...CONNECTED,
        connected: false,
        status: "needs_reconnect",
        statusReason: "Figma no longer accepts this connection. Connect Figma again.",
      },
      "DELETE /figma-connection": undefined,
    });
    renderAt(<FigmaConnectionCard />, "/admin/social/cards");
    expect(await screen.findByText("Reconnect needed")).toBeTruthy();
    expect(screen.getByText(/no longer accepts this connection/)).toBeTruthy();
    expect(screen.getByText("Club Designer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect", hidden: false }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });
});

describe("Import from Figma dialog", () => {
  it("sends an unconnected club to settings", async () => {
    stubApi({ "GET /figma-connection": NONE });
    renderAt(<FigmaImportDialog open onOpenChange={() => {}} />, "/admin/social/template-library");
    const link = await screen.findByRole("link", { name: "Open Figma settings" });
    expect(link.getAttribute("href")).toBe("/admin/social/cards#figma");
    expect(screen.queryByLabelText("Figma link")).toBeNull();
  });

  it("imports a link and offers the new template with its report", async () => {
    const calls = stubApi({
      "GET /figma-connection": CONNECTED,
      "POST /club-templates/import/figma": {
        status: 201,
        body: {
          template: { id: 42, name: "Our century" },
          fileName: "Club cards",
          frames: [{ size: "square" }],
          report: [{ level: "warn", message: "Blur left out", layer: "Glow" }],
          fonts: [{ from: "Brand Sans", to: "Inter" }],
        },
      },
    });
    renderAt(<FigmaImportDialog open onOpenChange={() => {}} />, "/admin/social/template-library");
    expect(await screen.findByText("Club Designer")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Figma link"), {
      target: { value: " https://www.figma.com/design/AbCdEfGhIjKlMnOp/x " },
    });
    fireEvent.change(screen.getByLabelText("Card kind"), { target: { value: "century" } });
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Our century" } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    const open = await screen.findByRole("link", { name: "Open the template" });
    expect(open.getAttribute("href")).toBe("/admin/social/template/42");
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      fileUrl: "https://www.figma.com/design/AbCdEfGhIjKlMnOp/x",
      kind: "century",
      name: "Our century",
    });
    expect(screen.getByText("Blur left out")).toBeTruthy();
    expect(screen.getByText(/Brand Sans → Inter/)).toBeTruthy();
  });

  it("shows why an import failed", async () => {
    stubApi({
      "GET /figma-connection": CONNECTED,
      "POST /club-templates/import/figma": {
        status: 409,
        body: { error: "Figma no longer accepts this connection. Connect Figma again." },
      },
    });
    renderAt(<FigmaImportDialog open onOpenChange={() => {}} />, "/admin/social/template-library");
    fireEvent.change(await screen.findByLabelText("Figma link"), {
      target: { value: "AbCdEfGhIjKlMnOp" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/no longer accepts this connection/)).toBeTruthy();
  });
});
