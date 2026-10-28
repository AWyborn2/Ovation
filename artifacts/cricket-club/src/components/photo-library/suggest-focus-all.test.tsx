import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type * as FaceSuggestions from "@/lib/face-suggestions";

const box = { x: 0.2, y: 0.1, w: 0.4, h: 0.5 };
vi.mock("@/lib/face-suggestions", async (orig) => {
  const real = await orig<typeof FaceSuggestions>();
  return {
    ...real,
    // Faces on every photo but the one at /none.
    suggestUploadFocus: (
      photos: Array<{ id: number; url: string }>,
      save: (id: number, b: typeof box) => Promise<unknown>,
      _suggest: unknown,
      opts: Parameters<typeof real.suggestUploadFocus>[3],
    ) => real.suggestUploadFocus(photos, save, async (src) => (src === "/none" ? null : box), opts),
  };
});

import { SuggestFocusAll } from "./suggest-focus-all";

afterEach(cleanup);

describe("SuggestFocusAll", () => {
  it("suggests a focus for each photo with no box, leaving the rest alone", async () => {
    const save = vi.fn(async () => ({}));
    const onSaved = vi.fn();
    render(
      <SuggestFocusAll
        photos={[
          { id: 1, url: "/a", focusBox: null },
          { id: 2, url: "/b", focusBox: box },
          { id: 3, url: "/none" },
          { id: 4, url: "/d" },
        ]}
        save={save}
        onSaved={onSaved}
      />,
    );
    expect(screen.getByText("3 photos have no focus yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Suggest focus from faces" }));
    await waitFor(() =>
      expect(screen.getByText(/Done\. Suggested a focus for 2 of 3/)).toBeTruthy(),
    );
    expect(save.mock.calls).toEqual([
      [1, box],
      [4, box],
    ]);
    expect(onSaved).toHaveBeenCalled();
  });

  it("stops before the next photo when asked", async () => {
    let release: () => void = () => {};
    const save = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(
      <SuggestFocusAll
        photos={[
          { id: 1, url: "/a" },
          { id: 2, url: "/b" },
        ]}
        save={save}
        onSaved={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Suggest focus from faces" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    release();
    await waitFor(() => expect(screen.getByText(/Stopped\./)).toBeTruthy());
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when every photo has a focus", () => {
    const { container } = render(
      <SuggestFocusAll
        photos={[{ id: 1, url: "/a", focusBox: box }]}
        save={vi.fn()}
        onSaved={() => {}}
      />,
    );
    expect(container.textContent).toBe("");
  });
});
