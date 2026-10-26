import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import type { HonourDisplayBundle } from "@workspace/api-client-react";
import AdminHonoursDisplay from "./admin-honours-display";

/**
 * U2 — Ad creatives editor accepts and previews MP4 uploads (R1, R2, R3, R5).
 *
 * `installApiMock`'s route table has no built-in entry for the upload
 * endpoints, so every test here supplies an explicit override for
 * "uploads/request-url" — otherwise the request falls through to the
 * default `[]` payload and the upload flow can't resolve a usable
 * objectPath (see components/honours-display/editors/ad-editor.tsx).
 */

const BUNDLE: HonourDisplayBundle = {
  boards: [],
  brand: {
    name: "Demo Cricket Club",
    shortName: "Demo CC",
    monogram: "DC",
    backgroundColour: "#1d4ed8",
    primaryColour: "#0f172a",
    juniorsColour: "#42342B",
  },
  settings: {
    defaultTemplate: "p1",
    kioskSequence: [],
    kioskDwellMs: 3500,
    kioskScrollSpeed: 36,
    kioskEndHoldMs: 3000,
    kioskSponsorStrip: false,
    kioskSponsorSlides: false,
    kioskSponsorSlideEvery: 3,
    kioskAds: [],
    kioskLook: {},
    boardConfigs: {},
    composites: [],
  },
  activeSponsors: [],
};

function uploadOverride(contentType: string, objectPath: string) {
  return {
    "uploads/request-url": {
      uploadURL: "https://fake-upload.test/put",
      objectPath,
      metadata: { name: "ad-file", size: 1024, contentType },
    },
  };
}

/** Ads live on the Sponsors & ads tab (Radix tabs switch on mouse-down). */
async function openSponsorsTab() {
  fireEvent.mouseDown(await screen.findByTestId("tab-sponsors"));
}

async function addAdRow() {
  await openSponsorsTab();
  fireEvent.click(await screen.findByTestId("button-add-ad"));
  return screen.getByTestId(/^ad-file-/);
}

describe("AdEditor MP4 upload", () => {
  it("accepts video/mp4 in the file picker", async () => {
    installApiMock({ "/honour-display": BUNDLE });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    const fileInput = await addAdRow();
    expect(fileInput.getAttribute("accept")).toContain("video/mp4");
  });

  it("uploads an mp4 and marks the ad as mediaType video", async () => {
    installApiMock({
      "/honour-display": BUNDLE,
      ...uploadOverride("video/mp4", "/objects/uploads/test-ad.mp4"),
    });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    const fileInput = await addAdRow();

    const file = new File(["fake-mp4-bytes"], "ad.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const urlInput = screen.getByTestId(/^ad-url-/) as HTMLInputElement;
      expect(urlInput.value).toBe("/api/storage/objects/uploads/test-ad.mp4");
    });

    const preview = await screen.findByTestId(/^ad-preview-/);
    expect(preview.tagName).toBe("VIDEO");
  });

  it("still uploads a png as mediaType image (regression)", async () => {
    installApiMock({
      "/honour-display": BUNDLE,
      ...uploadOverride("image/png", "/objects/uploads/test-ad.png"),
    });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    const fileInput = await addAdRow();

    const file = new File(["fake-png-bytes"], "ad.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const preview = await screen.findByTestId(/^ad-preview-/);
    expect(preview.tagName).toBe("IMG");
  });

  it("renders a legacy ad (no mediaType) as an image", async () => {
    installApiMock({
      "/honour-display": {
        ...BUNDLE,
        settings: {
          ...BUNDLE.settings,
          kioskAds: [
            { id: "ad:legacy", name: "Legacy ad", imageUrl: "/api/storage/objects/legacy.png" },
          ],
        },
      },
    });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    await openSponsorsTab();
    const preview = await screen.findByTestId(/^ad-preview-/);
    expect(preview.tagName).toBe("IMG");
  });
});

describe("settings tabs (kiosk redesign B1)", () => {
  it("opens on Rotation and shows each tab's cards", async () => {
    installApiMock({ "/honour-display": BUNDLE });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    expect((await screen.findByTestId("tab-rotation")).getAttribute("data-state")).toBe("active");
    expect(await screen.findByText("TV kiosk")).toBeTruthy();
    expect(screen.queryByText("Global colours & font")).toBeNull();

    fireEvent.mouseDown(screen.getByTestId("tab-look"));
    expect(await screen.findByText("Global colours & font")).toBeTruthy();
    expect(screen.queryByText("TV kiosk")).toBeNull();

    fireEvent.mouseDown(screen.getByTestId("tab-sponsors"));
    expect(await screen.findByTestId("button-add-ad")).toBeTruthy();
  });

  it("keeps unsaved changes when switching tabs, under one save bar", async () => {
    installApiMock({ "/honour-display": BUNDLE });
    renderAt(<AdminHonoursDisplay />, "/admin/honours-display");
    fireEvent.mouseDown(await screen.findByTestId("tab-sponsors"));
    fireEvent.click(await screen.findByTestId("button-add-ad"));
    expect(screen.getAllByTestId(/^ad-file-/)).toHaveLength(1);

    fireEvent.mouseDown(screen.getByTestId("tab-look"));
    fireEvent.mouseDown(screen.getByTestId("tab-sponsors"));
    expect(await screen.findAllByTestId(/^ad-file-/)).toHaveLength(1);
  });
});
