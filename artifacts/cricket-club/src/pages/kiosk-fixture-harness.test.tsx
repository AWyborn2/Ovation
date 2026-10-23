import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderAt } from "@/test/render";
import KioskFixtureHarness from "./kiosk-fixture-harness";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("kiosk fixture harness", () => {
  it("runs the kiosk on sample data without fetching", async () => {
    const fetchSpy = vi.fn((_url: RequestInfo | URL) =>
      Promise.reject(new Error("no network in the harness")),
    );
    vi.stubGlobal("fetch", fetchSpy);
    renderAt(<KioskFixtureHarness />, "/__kiosk-fixture");
    expect((await screen.findAllByText("Premierships")).length).toBeGreaterThan(0);
    expect(
      fetchSpy.mock.calls.some(([url]) => String(url).includes("/api/honour-display")),
    ).toBe(false);
  });
});
