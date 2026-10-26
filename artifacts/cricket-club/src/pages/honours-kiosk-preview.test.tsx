import { describe, it, expect, afterEach, vi } from "vitest";
import { act, screen, cleanup } from "@testing-library/react";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";
import { KIOSK_FIXTURE } from "@/dev/kiosk-fixture";
import { PREVIEW_BUNDLE, PREVIEW_READY } from "@/lib/kiosk-preview-messages";
import HonoursKioskPreview from "./honours-kiosk-preview";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const send = (data: unknown, origin = window.location.origin) =>
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin, source: window.parent }));
  });

describe("kiosk preview frame (kiosk redesign B4)", () => {
  it("tells the settings page it is ready, then plays the bundle it is sent", async () => {
    installApiMock();
    const post = vi.spyOn(window.parent, "postMessage");
    renderAt(<HonoursKioskPreview />, "/honours-display/preview");
    expect(post).toHaveBeenCalledWith({ type: PREVIEW_READY }, window.location.origin);
    expect(screen.getByText("Preparing preview…")).toBeTruthy();

    send({ type: PREVIEW_BUNDLE, bundle: KIOSK_FIXTURE, nonce: 1 });
    expect((await screen.findAllByText("Premierships")).length).toBeGreaterThan(0);
    // The preview has no exit button (that's for the TV).
    expect(screen.queryByText(/Exit kiosk/)).toBeNull();
  });

  it("ignores messages from another origin or of another shape", async () => {
    installApiMock();
    renderAt(<HonoursKioskPreview />, "/honours-display/preview");
    send({ type: PREVIEW_BUNDLE, bundle: KIOSK_FIXTURE, nonce: 1 }, "https://evil.example");
    send({ type: PREVIEW_BUNDLE, bundle: { boards: "nope" }, nonce: 2 });
    expect(screen.getByText("Preparing preview…")).toBeTruthy();
  });
});
