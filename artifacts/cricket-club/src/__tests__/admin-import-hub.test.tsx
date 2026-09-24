/**
 * Social Studio U24 — the three-step import and the admin hub: the review step
 * summarises new / existing / to-confirm players, publishing reports how many
 * cards the sweep drafted, and the hub lists drafts awaiting review and warns
 * when the scheduled sweep has gone quiet.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { screen, cleanup, fireEvent, waitFor, within, render } from "@testing-library/react";
import { NeedsAttention, sweepIsStale } from "@/components/admin-hub/needs-attention";
import { ImportSteps, PreviewSummary, previewCounts } from "@/components/admin-import/import-steps";
import { useDraftedOnPublish } from "@/components/admin-import/use-drafted-on-publish";
import { useGetPendingSocialDraftCount, type ImportPreview } from "@workspace/api-client-react";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Fetch stub keyed by URL regex; a function reply is called per request. */
function stubApi(routes: [RegExp, () => unknown][]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const hit = routes.find(([re]) => re.test(url));
      return new Response(JSON.stringify(hit ? hit[1]() : []), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

describe("import review step", () => {
  it("summarises new, existing and to-confirm players before publish", () => {
    const preview = {
      newPlayers: 3,
      matchedPlayers: 41,
      suggestedPlayers: 2,
    } as ImportPreview;
    render(<PreviewSummary counts={previewCounts(preview)} />);
    const summary = screen.getByLabelText("Import summary");
    expect(within(summary).getByText("New players").nextSibling?.textContent).toBe("3");
    expect(within(summary).getByText("Existing players").nextSibling?.textContent).toBe("41");
    expect(within(summary).getByText("To confirm").nextSibling?.textContent).toBe("2");
  });

  it("marks the current step and completed steps", () => {
    const { rerender } = render(<ImportSteps step="review" />);
    const steps = screen.getByLabelText("Import steps");
    expect(within(steps).getByText("2").getAttribute("aria-current")).toBe("step");
    expect(within(steps).getAllByLabelText("done")).toHaveLength(1);
    rerender(<ImportSteps step="publish" done />);
    expect(within(steps).getAllByLabelText("done")).toHaveLength(3);
  });
});

describe("publish report", () => {
  it("counts the cards the publish drafted", async () => {
    let pending = 2;
    stubApi([[/pending-count/, () => ({ count: pending })]]);

    function Harness() {
      const [reviewing, setReviewing] = useState(false);
      const [committed, setCommitted] = useState<object | null>(null);
      const drafted = useDraftedOnPublish({ reviewing, committed, enabled: true });
      const loaded = useGetPendingSocialDraftCount().data;
      return (
        <>
          <span data-testid="loaded">{loaded ? "yes" : "no"}</span>
          <button onClick={() => setReviewing(true)}>review</button>
          <button
            onClick={() => {
              pending = 5; // the sweep drafted three cards
              setReviewing(false);
              setCommitted({});
            }}
          >
            publish
          </button>
          <output>{drafted == null ? "none" : String(drafted)}</output>
        </>
      );
    }

    renderAt(<Harness />, "/admin/import");
    await waitFor(() => expect(screen.getByTestId("loaded").textContent).toBe("yes"));
    fireEvent.click(screen.getByText("review"));
    fireEvent.click(screen.getByText("publish"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("3"));
  });
});

describe("admin hub", () => {
  const DRAFT = {
    id: 12,
    engine: "milestone",
    family: "achievements",
    status: "awaiting_review",
    cardInput: { kind: "century", playerName: "Sam Keeper", runs: 104, grade: "A Grade" },
  };

  it("lists drafts awaiting review with a link to the queue", async () => {
    stubApi([
      [/social-drafts\?status=awaiting_review/, () => [DRAFT]],
      [/social-settings/, () => ({ settings: { lastSweepAt: hoursAgo(0.1) } })],
    ]);
    renderAt(<NeedsAttention />, "/admin");
    const link = await screen.findByRole("link", { name: /Sam Keeper/ });
    expect(link.getAttribute("href")).toBe("/admin/social/queue?ids=12");
    expect(screen.getByRole("link", { name: /Open the queue/ }).getAttribute("href")).toBe(
      "/admin/social/queue",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("warns when the last sweep is two hours old", async () => {
    stubApi([[/social-settings/, () => ({ settings: { lastSweepAt: hoursAgo(2) } })]]);
    renderAt(<NeedsAttention />, "/admin");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Automatic drafting has stopped/);
    expect(alert.textContent).toMatch(/2 hours ago/);
  });

  it("treats a sweep that never ran as stale", () => {
    expect(sweepIsStale(null)).toBe(true);
    expect(sweepIsStale(hoursAgo(0.5))).toBe(false);
  });
});
