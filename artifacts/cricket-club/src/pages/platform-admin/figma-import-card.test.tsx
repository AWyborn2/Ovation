/**
 * Console → Library → Import from Figma (ADR-011 L8-B, T8.9): sends the link, kind, name and
 * look; shows the result with its report and a link to the template; and shows Figma's
 * "token expired" message as it is.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderAt } from "@/test/render";
import { FigmaImportCard } from "./figma-import-card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LOOKS = [
  {
    id: 3,
    slug: "club-kit-classic",
    name: "Club Kit",
    description: null,
    origin: "bundle" as const,
    displayOrder: 0,
    templates: 9,
  },
];

function stub(status: number, payload: unknown) {
  const bodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return bodies;
}

const fill = () => {
  fireEvent.change(screen.getByRole("textbox", { name: "Figma link" }), {
    target: { value: " https://www.figma.com/design/AbCdEfGhIjKl/Cards?node-id=1-2 " },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Imported template's kind" }), {
    target: { value: "century" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Imported template's name" }), {
    target: { value: "Night century" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Imported template's look" }), {
    target: { value: "3" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
};

describe("Figma import card", () => {
  it("imports, then shows what came in, the report and the template", async () => {
    const onImported = vi.fn();
    const bodies = stub(201, {
      template: { id: 41, name: "Night century" },
      fileName: "Cards",
      frames: [{}, {}],
      report: [
        {
          level: "warn",
          page: "card",
          sizes: ["story"],
          layer: "Header/Player",
          message: "Italic isn't supported: drawn upright.",
        },
        { level: "info", message: "No landscape frame." },
      ],
      fonts: [{ from: "Brand Sans", to: "Inter" }],
      rendered: { vectors: 1, images: 2 },
    });
    renderAt(
      <FigmaImportCard looks={LOOKS} onImported={onImported} editHref={(id) => `/edit/${id}`} />,
      "/platform-admin/library",
    );
    fill();
    const status = await screen.findByRole("status");
    expect(bodies[0]).toEqual({
      fileUrl: "https://www.figma.com/design/AbCdEfGhIjKl/Cards?node-id=1-2",
      kind: "century",
      name: "Night century",
      lookId: 3,
    });
    expect(status.textContent).toMatch(/2 frames, 1 vector and 2 images/);
    expect(status.textContent).toMatch(/Brand Sans → Inter/);
    expect(
      within(status).getByRole("link", { name: "Open the template" }).getAttribute("href"),
    ).toBe("/edit/41");
    const report = within(status).getByRole("list", { name: "Import report" });
    expect(report.textContent).toMatch(/card · story · Header\/Player: Italic/);
    expect(onImported).toHaveBeenCalled();
  });

  it("shows an expired token's message as Figma's client wrote it", async () => {
    stub(409, {
      error:
        "Figma refused the access token: it has expired or been revoked. Make a new personal access token…",
      code: "token",
    });
    renderAt(
      <FigmaImportCard looks={LOOKS} onImported={vi.fn()} editHref={(id) => `/edit/${id}`} />,
      "/platform-admin/library",
    );
    fill();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/expired or been revoked/),
    );
  });
});
