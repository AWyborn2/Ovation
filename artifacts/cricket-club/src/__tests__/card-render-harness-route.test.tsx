import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import { Router as AppRouter } from "@/App";

/**
 * Regression: the server-side render harness (`/__card-render`) must mount even
 * while the platform/brand request is still loading.
 *
 * `renderAt` intentionally omits BrandProvider, so `usePlatform()` returns the
 * default context (`{ isLoading: true }`) — the exact state that used to make
 * `Router` `return null` and blank the harness. In production that manifested as
 * the headless renderer hanging until `waitForFunction` hit its 30s timeout
 * ("Card render failed: Waiting failed: 30000ms exceeded"). The harness is
 * payload-driven and needs nothing from the brand fetch, so it now renders
 * ahead of the platform-loading gate.
 */
describe("/__card-render route", () => {
  beforeEach(() => {
    installApiMock();
    // Never let a harness API left over from an earlier render satisfy the
    // `ready` assertion below — it must come from this mount.
    delete window.__cardRenderHarness;
  });

  it("mounts the render harness while platform brand is still loading", async () => {
    renderAt(<AppRouter />, "/__card-render");
    // The harness page renders <div data-testid="card-render-harness">…</div>
    // and installs window.__cardRenderHarness from a passive effect. The page is
    // a lazy route chunk, so Suspense resolves outside act() and the div can be
    // committed a tick before that effect runs — assert both inside the same
    // waitFor. On a cold transform cache the import alone can exceed waitFor's
    // default 1s, so allow the lazy load time.
    await waitFor(
      () => {
        expect(screen.getByTestId("card-render-harness")).toBeTruthy();
        expect(window.__cardRenderHarness?.ready).toBe(true);
      },
      { timeout: 10_000 },
    );
  });
});
