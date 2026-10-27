import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ClubUpload } from "@workspace/api-client-react";

const rename = vi.fn();
const remove = vi.fn();
const ingest = vi.fn(async () => ({ results: [{ objectPath: "/objects/uploads/a", ok: true }] }));
const listParams: unknown[] = [];
const UPLOADS: ClubUpload[] = [
  {
    id: 1,
    name: "Speech bubble",
    kind: "svg",
    url: null,
    thumbUrl: null,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 810 611"><path d="M0 0L10 10"/></svg>',
    width: 810,
    height: 611,
    createdAt: "2026-10-28T00:00:00.000Z",
  },
  {
    id: 2,
    name: "Club logo",
    kind: "image",
    url: "/api/storage/objects/club-uploads/logo.png",
    thumbUrl: "/api/storage/objects/club-uploads/logo-t.png",
    svg: null,
    width: 400,
    height: 400,
    createdAt: "2026-10-28T00:00:00.000Z",
  },
];

vi.mock("@workspace/api-client-react", () => ({
  getListClubUploadsQueryKey: (p?: unknown) => ["uploads", p],
  useListClubUploads: (params?: unknown) => {
    listParams.push(params);
    return { data: UPLOADS, isLoading: false };
  },
  useRenameClubUpload: () => ({ mutate: rename, isPending: false }),
  useDeleteClubUpload: () => ({ mutate: remove, isPending: false }),
  ingestClubUploads: (body: unknown) => ingest(body),
}));
vi.mock("@/components/social-queue/library-upload", () => ({
  requestUploadUrl: async () => ({ uploadURL: "https://up/a", objectPath: "/objects/uploads/a" }),
  putWithProgress: async () => {},
}));
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => async () => true }));

import { UploadsPanel, uploadLayer } from "../uploads-panel";

const setup = (onAdd = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UploadsPanel size="square" onAdd={onAdd} />
    </QueryClientProvider>,
  );
  return onAdd;
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  listParams.length = 0;
});

describe("UploadsPanel", () => {
  it("adds an SVG as a vector and a PNG as an image, in their own shape", () => {
    const onAdd = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add Speech bubble to the card" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Club logo to the card" }));
    const [vector, image] = onAdd.mock.calls.map((c) => c[0]);
    expect(vector).toMatchObject({ kind: "vector", name: "Speech bubble", svg: UPLOADS[0]!.svg });
    expect(image).toMatchObject({ kind: "image", content: UPLOADS[1]!.url });
    // Half the card wide; the bubble keeps its 810 × 611 shape on a square card.
    expect(vector.geometry.square.w).toBe(50);
    expect(vector.geometry.square.h).toBeCloseTo(50 * (611 / 810), 3);
  });

  it("searches by name, renames and deletes", async () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("Search uploads"), { target: { value: "logo" } });
    await waitFor(() => expect(listParams).toContainEqual({ q: "logo" }));

    fireEvent.click(screen.getByRole("button", { name: "Rename Club logo" }));
    const input = screen.getByLabelText("Upload name");
    fireEvent.change(input, { target: { value: "Crest" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(rename).toHaveBeenCalledWith({ id: 2, data: { name: "Crest" } });

    fireEvent.click(screen.getByRole("button", { name: "Delete Speech bubble" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ id: 1 }));
  });

  it("uploads files into Uploads, not the photo library", async () => {
    setup();
    const file = new File(["<svg/>"], "Speech bubble.svg", { type: "" });
    fireEvent.change(screen.getByLabelText("Upload files"), { target: { files: [file] } });
    await waitFor(() =>
      expect(ingest).toHaveBeenCalledWith({
        files: [{ objectPath: "/objects/uploads/a", name: "Speech bubble.svg" }],
      }),
    );
  });

  it("keeps a layer inside a tall card", () => {
    const tall = { ...UPLOADS[1]!, width: 100, height: 1000 };
    expect(uploadLayer(tall, "landscape").geometry.landscape!.h).toBe(90);
  });
});
