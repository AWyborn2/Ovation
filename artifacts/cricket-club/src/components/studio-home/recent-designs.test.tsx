/**
 * Your designs (retest 9): it asks only for the queue's open drafts, a list
 * that fails shows an error with a retry, and a request that never answers
 * gives up and offers a retry instead of a spinner that never ends.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PackCardData } from "@/lib/pack-render";
import { DESIGNS_TIMEOUT_MS, YourDesigns, timed } from "./recent-designs";

const preview = { dataFor: () => ({}) as PackCardData, clubName: "Test CC" };

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const empty = (url: string) => json(/club-templates/.test(url) ? { templates: [] } : []);

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

function mount(handler: Handler) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((req: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof req === "string" ? req : req.toString();
      calls.push(url);
      return handler(url, init);
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <YourDesigns preview={preview} />
    </QueryClientProvider>,
  );
  return calls;
}

/** A request that never answers, until it is aborted. */
const hang: Handler = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Your designs", () => {
  it("asks only for open drafts, not the club's posted and dismissed history", async () => {
    const calls = mount(async (url) => empty(url));
    await screen.findByText("No designs match.");
    const drafts = calls.filter((u) => u.includes("/social-drafts"));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatch(/[?&]open=true(&|$)/);
  });

  it("shows an error with a retry when one list fails, and loads after the retry", async () => {
    let failSets = true;
    mount(async (url) => {
      if (url.includes("/card-sets") && failSets) return json({ error: "boom" }, 500);
      return empty(url);
    });
    // One retry a second later, then the error.
    const retry = await screen.findByRole(
      "button",
      { name: /try again|retry/i },
      { timeout: 4000 },
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    failSets = false;
    fireEvent.click(retry);
    await screen.findByText("No designs match.");
  });

  it("gives up on a request that never answers and offers a retry", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let stall = true;
    mount((url, init) =>
      stall && url.includes("/social-drafts") ? hang(url, init) : Promise.resolve(empty(url)),
    );
    expect(await screen.findByText("Loading your designs…")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DESIGNS_TIMEOUT_MS + 10);
    });
    expect(screen.getByText("This is taking longer than usual.")).toBeTruthy();
    // The stalled request and its one retry both time out: an error, not a spinner.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DESIGNS_TIMEOUT_MS + 2_000);
    });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/Loading your designs/)).toBeNull();
    stall = false;
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    await screen.findByText("No designs match.");
  });
});

describe("timed", () => {
  it("aborts after its time, and with the caller's signal", () => {
    vi.useFakeTimers();
    const t = timed(undefined, 100);
    expect(t.aborted).toBe(false);
    vi.advanceTimersByTime(100);
    expect(t.aborted).toBe(true);
    expect((t.reason as DOMException).name).toBe("TimeoutError");
    const caller = new AbortController();
    const linked = timed(caller.signal, 100);
    caller.abort();
    expect(linked.aborted).toBe(true);
  });
});
