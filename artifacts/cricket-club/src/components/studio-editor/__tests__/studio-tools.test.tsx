/**
 * Social Studio U19 — the editor's external-service tools: "Remove background"
 * on library photos and the match-day forecast block. Each is hidden when its
 * API endpoint answers 404 (tool not configured / no venue coordinates).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ShareCardInput } from "@/lib/share-card";
import { renderAt } from "@/test/render";
import { CricketPanel, PhotosPanel, matchDayFixtureId } from "../content-panels";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Req = { method: string; url: string; body: unknown };

const PHOTO = {
  id: 11,
  url: "/api/storage/objects/library/a",
  thumbUrl: "/api/storage/objects/library/a-thumb",
  width: 800,
  height: 600,
  season: 2025,
  grade: "A Grade",
  takenAt: null,
  createdAt: "2026-09-20T00:00:00Z",
  playerIds: [],
  sourcePhotoId: null,
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

function stubApi(opts: { removal: boolean; forecast: boolean }): Req[] {
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      if (/\/studio-tools\/background-removal$/.test(url)) {
        if (!opts.removal) return json({ error: "not configured" }, 404);
        return method === "POST"
          ? json({ ...PHOTO, id: 12, sourcePhotoId: 11 })
          : json({ available: true });
      }
      if (/\/studio-tools\/forecast/.test(url)) {
        if (!opts.forecast) return json({ error: "no coordinates" }, 404);
        return json({
          fixtureId: 5,
          venue: "Home Oval",
          hour: "2026-10-10T02:00:00.000Z",
          temperatureC: 26,
          weatherCode: 0,
          conditions: "Sunny",
          attribution: "Weather data by Open-Meteo.com (BOM ACCESS-G)",
        });
      }
      if (/\/club-photos/.test(url)) return json([PHOTO]);
      return json([]);
    }),
  );
  return requests;
}

const matchDay = {
  kind: "matchDay",
  roundLabel: "Round 3",
  oppositionName: "Visitors CC",
  homeAway: "HOME",
  venue: "Home Oval",
  date: "Sat 10 Oct",
  startTime: "12:30",
} as ShareCardInput;

describe("remove background", () => {
  it("offers the action on library photos and sends only the photo id", async () => {
    const requests = stubApi({ removal: true, forecast: false });
    renderAt(<PhotosPanel size="square" onAdd={() => {}} onSetPhoto={() => {}} />);
    const btn = await screen.findByRole("button", {
      name: "Remove background from library photo 11",
    });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(requests.some((r) => r.method === "POST" && /background-removal$/.test(r.url))).toBe(
        true,
      ),
    );
    const post = requests.find((r) => r.method === "POST")!;
    expect(post.body).toEqual({ photoId: 11 });
  });

  it("hides the action when the tool is not configured (404)", async () => {
    const requests = stubApi({ removal: false, forecast: false });
    renderAt(<PhotosPanel size="square" onAdd={() => {}} onSetPhoto={() => {}} />);
    await screen.findByRole("button", { name: "Set library photo 11 as the card photo" });
    await waitFor(() => expect(requests.some((r) => /background-removal$/.test(r.url))).toBe(true));
    expect(screen.queryByRole("button", { name: /Remove background/ })).toBeNull();
  });
});

describe("match-day forecast", () => {
  it("shows the forecast for a match-day draft and adds it as a text layer", async () => {
    stubApi({ removal: false, forecast: true });
    const onAdd = vi.fn();
    renderAt(<CricketPanel size="square" input={matchDay} fixtureId={5} onAdd={onAdd} />);
    expect(await screen.findByText("26° · Sunny")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add the forecast to the card" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "text", content: "26° · Sunny" }),
    );
  });

  it("hides the block when the API has no forecast (404)", async () => {
    const requests = stubApi({ removal: false, forecast: false });
    renderAt(<CricketPanel size="square" input={matchDay} fixtureId={5} onAdd={() => {}} />);
    await waitFor(() => expect(requests.some((r) => /forecast/.test(r.url))).toBe(true));
    expect(screen.queryByText("Match-day forecast")).toBeNull();
    expect(screen.getByText("Scorecard & charts")).toBeTruthy();
  });

  it("reads the fixture only from a match-day draft's source key", () => {
    expect(matchDayFixtureId("matchDay", "matchday:42")).toBe(42);
    expect(matchDayFixtureId("matchDay", null)).toBeNull();
    expect(matchDayFixtureId("matchDay", "teamlist:42")).toBeNull();
    expect(matchDayFixtureId("century", "matchday:42")).toBeNull();
  });
});
