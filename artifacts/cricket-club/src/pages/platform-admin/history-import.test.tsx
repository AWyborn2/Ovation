/**
 * Concierge club history import page (hybrid stats plan U11): the preview shows
 * row-numbered errors and span suggestions to confirm (unticked = a separate
 * pre-digital player), the batch list offers undo, and templates download.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { Route } from "wouter";
import { screen, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import type { HistoryImportPreview } from "@workspace/api-client-react";
import { renderAt } from "@/test/render";
import HistoryImportPage, {
  HistoryPreviewView,
  coverageSummary,
  linksFromSelection,
  parseSeasonInput,
  seasonText,
} from "./history-import";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PREVIEW: HistoryImportPreview = {
  template: "career",
  rowCount: 1,
  errors: [],
  warnings: [],
  coverage: [{ grade: "A Grade", season: null }],
  players: [
    {
      key: "john smith",
      name: "John Smith",
      rows: [2],
      grades: ["A Grade"],
      firstSeason: 1995,
      lastSeason: 2002,
      delta: {
        games: 120,
        innings: 110,
        notOuts: 12,
        runs: 3150,
        highScore: 134,
        ballsBowled: 0,
        runsConceded: 0,
        wickets: 86,
        fifties: 18,
        hundreds: 3,
        fiveWickets: 2,
        catches: 38,
        stumpings: 0,
        runOuts: 0,
      },
      suggestions: [
        {
          playerId: 7,
          participantId: "g-7",
          displayName: "J Smith",
          kind: "central",
          firstSeason: 2003,
          lastSeason: 2010,
          reason: "Name matches; history ends 2002/03, central starts 2003/04.",
        },
      ],
    },
  ],
  honours: [],
};

describe("helpers", () => {
  it("formats and parses seasons", () => {
    expect(seasonText(1999)).toBe("1999/00");
    expect(parseSeasonInput("2003/04")).toBe(2003);
    expect(parseSeasonInput("2003")).toBe(2003);
    expect(parseSeasonInput("soon")).toBeNull();
  });

  it("summarises coverage per grade", () => {
    expect(
      coverageSummary([
        { grade: "A Grade", season: 1995 },
        { grade: "A Grade", season: 1998 },
        { grade: "B Grade", season: null },
      ]),
    ).toBe("A Grade 1995/96–1998/99, B Grade career totals");
  });

  it("sends only the confirmed links", () => {
    expect(linksFromSelection({ "john smith": 7, "ann able": null })).toEqual({ "john smith": 7 });
  });
});

describe("preview", () => {
  it("lists every error with its row number", () => {
    render(
      <HistoryPreviewView
        preview={{
          ...PREVIEW,
          players: [],
          errors: [
            { row: 3, column: "season", message: "2003/04 is at or after the A Grade boundary" },
            { row: 7, message: "The row has no figures." },
          ],
        }}
        selection={{}}
        onSelect={() => {}}
      />,
    );
    const list = screen.getByLabelText("Import errors");
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Row 3 · season: 2003/04 is at or after the A Grade boundary",
      "Row 7: The row has no figures.",
    ]);
    expect(screen.getByRole("alert").textContent).toMatch(/2 problems/);
  });

  it("a span suggestion is only linked once the importer ticks it", () => {
    function Harness() {
      const [selection, setSelection] = useState<Record<string, number | null>>({});
      return (
        <>
          <HistoryPreviewView
            preview={PREVIEW}
            selection={selection}
            onSelect={(k, id) => setSelection({ ...selection, [k]: id })}
          />
          <output>{JSON.stringify(linksFromSelection(selection))}</output>
        </>
      );
    }
    render(<Harness />);
    const players = screen.getByLabelText("Players");
    expect(within(players).getByText("+3150")).toBeTruthy();
    expect(screen.getByText(/stays a separate pre-digital player/)).toBeTruthy();
    expect(screen.getByRole("status", { hidden: true }).textContent).toBe("{}");

    const box = screen.getByRole("checkbox");
    fireEvent.click(box);
    expect(screen.getByRole("status", { hidden: true }).textContent).toBe('{"john smith":7}');
    expect(screen.queryByText(/stays a separate pre-digital player/)).toBeNull();
    fireEvent.click(box);
    expect(screen.getByRole("status", { hidden: true }).textContent).toBe("{}");
  });
});

describe("page", () => {
  function stubApi() {
    const calls: { method: string; url: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const method = (init?.method ?? "GET").toUpperCase();
        calls.push({ method, url });
        let body: unknown = [];
        if (/\/history-import\/batches\/\d+$/.test(url) && method === "DELETE") {
          body = { batchId: 12, rowsRemoved: 40, honoursRemoved: 0, playersRemoved: 3 };
        } else if (url.endsWith("/history-import/batches")) {
          body = [
            {
              id: 12,
              label: "1985–2002 career totals",
              source: "csv:career",
              note: null,
              createdBy: "platform:ash@example.com",
              createdAt: "2026-09-30T01:00:00.000Z",
              rows: 40,
              honours: 0,
              coverage: [{ grade: "A Grade", season: null }],
            },
          ];
        } else if (url.endsWith("/history-import/boundaries")) {
          body = [{ grade: null, startSeason: 2003 }];
        } else if (/\/platform\/admin\/tenants\/5$/.test(url)) {
          body = {
            tenant: { id: 5, name: "Pinjarra CC", slug: "pinjarra", plan: "club" },
            admins: [],
          };
        }
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    return calls;
  }

  it("shows the boundary, the batches with undo, and template downloads", async () => {
    const calls = stubApi();
    renderAt(
      <Route path="/platform-admin/tenants/:id/history-import" component={HistoryImportPage} />,
      "/platform-admin/tenants/5/history-import",
    );
    await screen.findByText("#12 1985–2002 career totals");
    expect((screen.getByLabelText("First central season") as HTMLInputElement).value).toBe(
      "2003/04",
    );
    expect(screen.getByText(/A Grade career totals/)).toBeTruthy();
    const link = screen.getByText("Download template").closest("a")!;
    expect(link.getAttribute("href")).toMatch(
      /\/platform\/admin\/history-import\/templates\/career$/,
    );
    fireEvent.change(screen.getByLabelText("Template"), { target: { value: "honours" } });
    expect(link.getAttribute("href")).toMatch(/templates\/honours$/);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo batch" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === "DELETE" && /\/tenants\/5\/history-import\/batches\/12$/.test(c.url),
        ),
      ).toBe(true),
    );
    expect(await screen.findByText(/Undid batch #12/)).toBeTruthy();
  });
});
