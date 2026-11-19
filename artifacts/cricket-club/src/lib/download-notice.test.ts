/**
 * A second download from the same tab (retest 7, #3): Chrome holds it back
 * behind an address-bar prompt the page can't see, so the app says where to
 * look when one download follows another closely.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  noteDownload,
  REPEAT_DOWNLOAD_NOTICE,
  REPEAT_DOWNLOAD_WINDOW_MS,
  resetDownloadNotice,
} from "./download-notice";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ toast }));

import { downloadBlob } from "@/lib/share-card";

beforeEach(() => resetDownloadNotice());
afterEach(() => vi.clearAllMocks());

describe("noteDownload", () => {
  it("says nothing on the first download", () => {
    const notify = vi.fn();
    expect(noteDownload(1_000, notify)).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("explains the browser's multiple-downloads prompt on a second one soon after", () => {
    const notify = vi.fn();
    noteDownload(1_000, notify);
    expect(noteDownload(1_000 + 5_000, notify)).toBe(true);
    expect(notify).toHaveBeenCalledWith(REPEAT_DOWNLOAD_NOTICE);
    expect(REPEAT_DOWNLOAD_NOTICE.description).toMatch(/allow multiple downloads/);
    expect(REPEAT_DOWNLOAD_NOTICE.description).toMatch(/address bar/);
    // Plain wording: no em dashes.
    expect(`${REPEAT_DOWNLOAD_NOTICE.title} ${REPEAT_DOWNLOAD_NOTICE.description}`).not.toMatch(
      /—/,
    );
  });

  it("tells once per stretch, not on every download", () => {
    const notify = vi.fn();
    noteDownload(0, notify);
    noteDownload(1_000, notify);
    noteDownload(2_000, notify);
    noteDownload(3_000, notify);
    expect(notify).toHaveBeenCalledTimes(1);
    // Well after the notice, a fresh pair of downloads is told again.
    const later = 3_000 + REPEAT_DOWNLOAD_WINDOW_MS + 1;
    noteDownload(later, notify);
    noteDownload(later + 1_000, notify);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("says nothing when the downloads are far apart", () => {
    const notify = vi.fn();
    noteDownload(0, notify);
    expect(noteDownload(REPEAT_DOWNLOAD_WINDOW_MS + 1, notify)).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("downloadBlob", () => {
  it("shows the notice as a toast when a second file downloads from the tab", () => {
    const { createObjectURL, revokeObjectURL } = URL;
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadBlob(new Blob(["a"]), "card-1.png");
    expect(toast).not.toHaveBeenCalled();
    downloadBlob(new Blob(["b"]), "card-2.png");
    expect(click).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining(REPEAT_DOWNLOAD_NOTICE));
    click.mockRestore();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });
});
