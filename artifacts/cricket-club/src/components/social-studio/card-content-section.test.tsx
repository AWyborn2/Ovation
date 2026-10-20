import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderAt } from "../../test/render";
import { installApiMock } from "../../test/mock-api";
import { CardContentSection, choose } from "./card-content-section";

const BUNDLE = (cardContent?: unknown) => ({
  settings: { ...(cardContent ? { cardContent } : {}) },
  activeSponsors: [],
  captionTemplates: [],
  brand: { name: "Our Club" },
});

/** The API mock plus a record of every settings write the section sends. */
function setup(cardContent?: unknown) {
  installApiMock({ "/social-settings": BUNDLE(cardContent) });
  const base = globalThis.fetch as unknown as (
    i: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  const writes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET").toUpperCase() === "PATCH") {
        writes.push(JSON.parse(String(init?.body ?? "null")));
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return base(input, init);
    }),
  );
  renderAt(<CardContentSection />);
  return writes;
}

describe("choose", () => {
  const standard = { preset: "standard" as const, fields: {} };
  it("a preset starts its field choices afresh", () => {
    expect(
      choose({ preset: "standard", fields: { "fixture.photo": false } }, { preset: "full" }),
    ).toEqual({ preset: "full", fields: {} });
  });
  it("records only switches that differ from the preset", () => {
    const off = choose(standard, { key: "fixture.photo", on: false });
    expect(off.fields).toEqual({ "fixture.photo": false });
    expect(choose(off, { key: "fixture.photo", on: true }).fields).toEqual({});
  });
});

describe("CardContentSection", () => {
  it("shows Standard for a club that never chose, with core fields locked on", async () => {
    setup();
    const standard = await screen.findByTestId("content-settings-preset-standard");
    expect(standard).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("content-settings-field-fixture.venue")).toBeDisabled();
    expect(screen.getByTestId("content-settings-field-fixture.round")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("content-settings-save")).toBeDisabled();
  });

  it("saves a preset and a switch, keeping the junior choice it does not show", async () => {
    const writes = setup({
      matchDay: { preset: "standard", fields: {}, juniorConsolidateByDay: false },
    });
    fireEvent.click(await screen.findByTestId("content-settings-preset-minimal"));
    fireEvent.click(screen.getByTestId("content-settings-field-fixture.oppositionCrest"));
    fireEvent.click(screen.getByTestId("content-settings-save"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      cardContent: {
        matchDay: {
          preset: "minimal",
          fields: { "fixture.oppositionCrest": true },
          juniorConsolidateByDay: false,
        },
      },
    });
  });
});
