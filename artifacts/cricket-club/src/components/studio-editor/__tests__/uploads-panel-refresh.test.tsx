/**
 * Uploads after an upload (retest 7, #2): a new SVG shows in the list without
 * a page reload, and a junior card's failed SVG isn't told to "upload it as a
 * PNG", which a junior card can't use.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ClubUpload } from "@workspace/api-client-react";

const bubble: ClubUpload = {
  id: 1,
  name: "Speech bubble",
  kind: "svg",
  url: null,
  thumbUrl: null,
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>',
  width: 10,
  height: 10,
  createdAt: "2026-10-28T00:00:00.000Z",
};
const star: ClubUpload = { ...bubble, id: 2, name: "Star" };

// What the server lists; each test sets it.
let server: ClubUpload[] = [];
const list = vi.fn(async () => server);
const ingest = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  getListClubUploadsQueryKey: (p?: unknown) => ["/api/club-uploads", ...(p ? [p] : [])],
  useListClubUploads: (_params: unknown, opts: { query: { queryKey: readonly unknown[] } }) =>
    useQuery({ queryKey: opts.query.queryKey, queryFn: list }),
  useRenameClubUpload: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteClubUpload: () => ({ mutate: vi.fn(), isPending: false }),
  ingestClubUploads: (body: unknown) => ingest(body),
  deleteClubUpload: vi.fn(),
}));
vi.mock("@/components/social-queue/library-upload", () => ({
  requestUploadUrl: async () => ({ uploadURL: "https://up/a", objectPath: "/objects/uploads/a" }),
  putWithProgress: async () => {},
}));
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => async () => true }));

import { juniorUploadError, UploadsPanel } from "../uploads-panel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup(vectorOnly: boolean) {
  // The app's own default: lists stay fresh for a minute.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  render(
    <QueryClientProvider client={client}>
      <UploadsPanel size="square" onAdd={vi.fn()} vectorOnly={vectorOnly} />
    </QueryClientProvider>,
  );
}

const upload = (name: string) =>
  fireEvent.change(screen.getByLabelText("Upload files"), {
    target: { files: [new File(["<svg/>"], name, { type: "image/svg+xml" })] },
  });

describe("UploadsPanel after an upload", () => {
  it("shows a junior card's new SVG straight away, without a reload", async () => {
    server = [bubble];
    ingest.mockResolvedValueOnce({
      results: [{ objectPath: "/objects/uploads/a", ok: true, upload: star }],
    });
    setup(true);
    expect(await screen.findByText("Speech bubble")).toBeTruthy();
    expect(screen.queryByText("Star")).toBeNull();
    // The list's refetch is slow to answer: the new upload shows before it does.
    list.mockImplementationOnce(() => new Promise<ClubUpload[]>(() => {}));
    upload("Star.svg");
    expect(await screen.findByText("Star")).toBeTruthy();
    expect(screen.getByText("Speech bubble")).toBeTruthy();
    // And the list is asked again, so it catches up with the server.
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("refetches the list after an upload, even while it is still fresh", async () => {
    server = [bubble];
    ingest.mockImplementationOnce(async () => {
      server = [star, bubble];
      return { results: [{ objectPath: "/objects/uploads/a", ok: true }] };
    });
    setup(false);
    await screen.findByText("Speech bubble");
    upload("Star.svg");
    expect(await screen.findByText("Star")).toBeTruthy();
  });

  it("tells a junior card what it can upload when an SVG can't be used", async () => {
    server = [];
    ingest.mockResolvedValueOnce({
      results: [
        {
          objectPath: "/objects/uploads/a",
          ok: false,
          error:
            "This SVG uses something cards can't draw (The SVG uses an element SVG layers can't use: <text>.). Upload it as a PNG instead.",
        },
      ],
    });
    setup(true);
    upload("Logo.svg");
    const status = await screen.findByRole("status", {}, { timeout: 2000 });
    await waitFor(() => expect(status.textContent).toMatch(/cards can't draw/));
    expect(status.textContent).not.toMatch(/PNG/);
    expect(status.textContent).toMatch(/SVG logos and graphics only/);
    expect(status.textContent).toMatch(/text turned into outlines/);
  });

  it("keeps the PNG advice on a senior card, where a PNG is fine", async () => {
    server = [];
    ingest.mockResolvedValueOnce({
      results: [
        {
          objectPath: "/objects/uploads/a",
          ok: false,
          error: "This SVG uses something cards can't draw (x). Upload it as a PNG instead.",
        },
      ],
    });
    setup(false);
    upload("Logo.svg");
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(/Upload it as a PNG instead/),
    );
  });
});

describe("juniorUploadError", () => {
  it("drops the PNG advice from a too-detailed SVG", () => {
    const out = juniorUploadError(
      "This SVG is too detailed (vectors can be at most 64 KB). Simplify it, or upload it as a PNG.",
    );
    expect(out).toMatch(/^This SVG is too detailed \(vectors can be at most 64 KB\)\. Simplify it/);
    expect(out).not.toMatch(/PNG/);
    expect(out).toMatch(/SVG logos and graphics only/);
  });

  it("leaves other messages alone", () => {
    expect(juniorUploadError("File is larger than 25 MB.")).toBe("File is larger than 25 MB.");
  });
});
