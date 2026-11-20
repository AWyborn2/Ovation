/**
 * Change photo in an editor (Nov 2026): its menu opens in the editor's dock,
 * beside the canvas, never floating over the slide being edited.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { DockProvider, useDockState } from "../dock";

vi.mock("@workspace/api-client-react", () => ({
  getGetDraftPhotoPoolQueryKey: () => ["pool"],
  getListClubPhotosQueryKey: () => ["photos"],
  useGetDraftPhotoPool: () => ({ data: { junior: false, photoIds: [], playerIds: [] } }),
  useListClubPhotos: () => ({ data: [], isLoading: false }),
}));

import { ChangePhotoMenu } from "../change-photo";

afterEach(cleanup);

describe("Change photo", () => {
  function Editor() {
    const dock = useDockState();
    return (
      <DockProvider api={dock.api}>
        <main data-testid="canvas-area">
          <ChangePhotoMenu
            draftId={1}
            slideKey="detail:senior:A Grade"
            junior={false}
            currentUrl={null}
            own={false}
            onPick={async () => {}}
            onAuto={async () => {}}
          />
        </main>
        <aside data-testid="dock" hidden={!dock.menuOpen}>
          <div ref={dock.setMenuNode} />
        </aside>
      </DockProvider>
    );
  }

  it("opens its menu in the dock in an editor, never floating over the canvas", async () => {
    render(
      <Router hook={memoryLocation({ path: "/admin/social/set/1" }).hook}>
        <Editor />
      </Router>,
    );
    expect(screen.getByTestId("dock").hidden).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /change photo/i }));
    });
    const menu = screen.getByRole("dialog");
    expect(screen.getByTestId("dock").hidden).toBe(false);
    expect(screen.getByTestId("dock").contains(menu)).toBe(true);
    expect(screen.getByTestId("canvas-area").contains(menu)).toBe(false);
    expect(document.querySelector("[data-radix-popper-content-wrapper]")).toBeNull();
    // Its choices are all there.
    expect(within(menu).getByText(/From library/)).toBeTruthy();
    expect(within(menu).getByText(/Random/)).toBeTruthy();
  });
});
