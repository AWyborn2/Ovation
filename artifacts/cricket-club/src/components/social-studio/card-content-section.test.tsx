import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderAt } from "../../test/render";
import { installApiMock } from "../../test/mock-api";
import { CardContentSection, choose } from "./card-content-section";

const STANDARD = { preset: "standard", fields: {}, juniorConsolidateByDay: true };

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
    // Every kind is sent: the server stores the whole set of choices.
    expect(writes[0]).toEqual({
      cardContent: {
        matchDay: {
          preset: "minimal",
          fields: { "fixture.oppositionCrest": true },
          juniorConsolidateByDay: false,
        },
        results: STANDARD,
        matchSummary: STANDARD,
        teamList: STANDARD,
      },
    });
  });

  it("chooses fields per card kind and keeps the other kinds as saved (P7)", async () => {
    const writes = setup({
      matchDay: { preset: "full", fields: {}, juniorConsolidateByDay: true },
      results: { preset: "minimal", fields: {}, juniorConsolidateByDay: true },
    });
    fireEvent.click(await screen.findByTestId("content-settings-kind-teamList"));
    expect(screen.getByTestId("content-settings-preset-standard")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("content-settings-field-team.players")).toBeDisabled();
    fireEvent.click(screen.getByTestId("content-settings-field-team.shirtNumbers"));
    fireEvent.click(screen.getByTestId("content-settings-kind-results"));
    expect(screen.getByTestId("content-settings-preset-minimal")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByTestId("content-settings-save"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      cardContent: {
        matchDay: { preset: "full", fields: {}, juniorConsolidateByDay: true },
        results: { preset: "minimal", fields: {}, juniorConsolidateByDay: true },
        matchSummary: STANDARD,
        teamList: { ...STANDARD, fields: { "team.shirtNumbers": false } },
      },
    });
  });

  it("saves the livestream link on its own, and only an https one", async () => {
    const writes = setup();
    const input = await screen.findByTestId("content-settings-livestream");
    fireEvent.change(input, { target: { value: "http://example.com/live" } });
    expect(screen.getByText("Use a link that starts with https://.")).toBeInTheDocument();
    expect(screen.getByTestId("content-settings-save")).toBeDisabled();
    fireEvent.change(input, { target: { value: " https://youtube.com/@ourclub " } });
    fireEvent.click(screen.getByTestId("content-settings-save"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ livestreamUrl: "https://youtube.com/@ourclub" });
  });

  it("offers the data fields, on in Full only", async () => {
    setup();
    for (const key of [
      "title.livestream",
      "fixture.ladder",
      "fixture.lastMeeting",
      "fixture.milestoneWatch",
    ])
      expect(await screen.findByTestId(`content-settings-field-${key}`)).toHaveAttribute(
        "aria-checked",
        "false",
      );
    fireEvent.click(screen.getByTestId("content-settings-preset-full"));
    expect(screen.getByTestId("content-settings-field-fixture.ladder")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
