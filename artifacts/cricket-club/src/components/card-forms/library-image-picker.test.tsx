import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@workspace/api-client-react", () => ({
  getListClubPhotosQueryKey: () => ["photos"],
  getListClubUploadsQueryKey: () => ["uploads"],
  useListClubPhotos: () => ({
    isLoading: false,
    data: [
      {
        id: 1,
        url: "/p/1.jpg",
        thumbUrl: "/p/1-t.jpg",
        grade: "A Grade",
        season: 2025,
        photoTypes: ["team"],
      },
      { id: 2, url: "/p/2.jpg", thumbUrl: "/p/2-t.jpg", grade: null, season: null, photoTypes: [] },
    ],
  }),
  useListClubUploads: () => ({
    isLoading: false,
    data: [
      {
        id: 5,
        name: "Club crest",
        kind: "image",
        url: "/u/crest.png",
        thumbUrl: "/u/crest-t.png",
        svg: null,
      },
      { id: 6, name: "Speech bubble", kind: "svg", url: null, thumbUrl: null, svg: "<svg/>" },
    ],
  }),
}));

import { LibraryImagePicker } from "./library-image-picker";

afterEach(cleanup);

describe("LibraryImagePicker", () => {
  it("picks a library photo, searches, and offers image uploads only", () => {
    const onPick = vi.fn();
    render(<LibraryImagePicker label="Team photo" onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Team photo from the library" }));

    fireEvent.change(screen.getByLabelText("Search images"), { target: { value: "a grade" } });
    expect(screen.getAllByRole("button", { name: /^Use / })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Use A Grade" }));
    expect(onPick).toHaveBeenCalledWith("/p/1.jpg");

    fireEvent.click(screen.getByRole("button", { name: "Choose Team photo from the library" }));
    fireEvent.click(screen.getByRole("button", { name: "Uploads" }));
    fireEvent.change(screen.getByLabelText("Search images"), { target: { value: "" } });
    // The SVG is a vector, which a slot can't hold.
    expect(screen.queryByRole("button", { name: "Use Speech bubble" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use Club crest" }));
    expect(onPick).toHaveBeenLastCalledWith("/u/crest.png");
  });
});
