/**
 * "Fetch latest from PlayHQ" in the Selection Hub: admins of a club linked to the PlayHQ sync
 * see it; it asks the API once, then shows the fetch as running until it lands.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SelectionPlayhqFetch } from "@workspace/api-client-react";
import { renderAt } from "@/test/render";
import { PlayhqFetchButton, fetchTitle } from "./playhq-fetch-button";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const IDLE: SelectionPlayhqFetch = {
  available: true,
  canRequest: true,
  pending: false,
  requestedAt: null,
  requestedBy: null,
  completedAt: null,
  nextAllowedAt: null,
};

describe("PlayhqFetchButton", () => {
  it("is hidden from captains and for a club not linked to the sync", () => {
    renderAt(<PlayhqFetchButton fetch={{ ...IDLE, canRequest: false }} onRequested={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    renderAt(<PlayhqFetchButton fetch={{ ...IDLE, available: false }} onRequested={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("asks the API once and tells the board to refresh", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ fetch: { ...IDLE, pending: true }, wake: "dispatched" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onRequested = vi.fn();
    renderAt(<PlayhqFetchButton fetch={IDLE} onRequested={onRequested} />);
    fireEvent.click(screen.getByRole("button", { name: /fetch latest from playhq/i }));
    await waitFor(() => expect(onRequested).toHaveBeenCalledOnce());
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/\/selection\/playhq-fetch$/);
  });

  it("shows a pending fetch as running, and can't be pressed again", () => {
    renderAt(
      <PlayhqFetchButton
        fetch={{
          ...IDLE,
          pending: true,
          requestedAt: "2026-10-23T01:12:00Z",
          requestedBy: "Ash",
          nextAllowedAt: "2026-10-23T01:22:00Z",
        }}
        onRequested={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: /fetching from playhq/i });
    expect(button).toBeDisabled();
    expect(button.getAttribute("title")).toBe(
      "Asked by Ash at 9:12 am. PlayHQ's sides usually arrive within a few minutes; this page updates by itself.",
    );
  });

  it("explains the cooldown and the last fetch", () => {
    expect(fetchTitle({ ...IDLE, nextAllowedAt: "2026-10-23T01:22:00Z" })).toBe(
      "Fetched recently. You can ask again after 9:22 am.",
    );
    expect(fetchTitle({ ...IDLE, completedAt: "2026-10-23T01:15:00Z" })).toMatch(
      /Last fetched 9:15 am\.$/,
    );
  });
});
