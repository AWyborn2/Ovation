/**
 * The web's junior photo guard: a junior draft is drawn (in the editors, the
 * queue, thumbnails and Download) only with photos it may show. A club library
 * photo held in its design is dropped unless it is approved junior stock, and
 * while the club's photos are loading or can't load, no library photo is drawn.
 * A raster upload (PNG, JPEG, WebP) is dropped too, as the server drops it
 * (retest 6); a vector upload stays.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderAt } from "@/test/render";
import { useJuniorPhotoGuard } from "../junior-photos";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const lib = (n: string) => `/api/storage/objects/library/${n}`;
const photo = (id: number, over: Record<string, unknown>) => ({
  id,
  url: lib(`p${id}`),
  thumbUrl: lib(`p${id}-thumb`),
  width: 800,
  height: 600,
  season: null,
  grade: null,
  takenAt: null,
  createdAt: "2026-11-01T00:00:00Z",
  playerIds: [],
  sourcePhotoId: null,
  juniorStock: false,
  ...over,
});
const PHOTOS = [photo(1, { season: 2026 }), photo(4, { juniorStock: true })];

const draft = (junior: boolean) => ({
  sourceMatchIsJunior: junior,
  cardInput: { kind: "matchDay" },
  adjustments: {
    formatVersion: 2,
    pages: {
      title: {
        layers: [
          { id: "club", kind: "image", content: lib("p1") },
          { id: "stock", kind: "image", content: lib("p4") },
          { id: "logo", kind: "image", content: "/api/storage/objects/club-uploads/x" },
          { id: "art", kind: "vector", svg: "<svg/>" },
        ],
      },
    },
  },
});

function Probe({ junior }: { junior: boolean }) {
  const guard = useJuniorPhotoGuard();
  const safe = guard.safeDraft(draft(junior)) as ReturnType<typeof draft>;
  return (
    <p data-testid="layers" data-ready={String(guard.ready)}>
      {safe.adjustments.pages.title.layers.map((l) => l.id).join(",")}
    </p>
  );
}

function stub(response: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(response));
}
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("useJuniorPhotoGuard", () => {
  it("draws a junior design with approved junior stock only", async () => {
    stub(async () => json(PHOTOS));
    renderAt(<Probe junior />);
    await waitFor(() => expect(screen.getByTestId("layers").dataset.ready).toBe("true"));
    expect(screen.getByTestId("layers").textContent).toBe("stock,art");
  });

  it("fails closed while the club's photos load, and if they can't", async () => {
    let release: (r: Response) => void = () => {};
    stub(() => new Promise<Response>((r) => (release = r)));
    renderAt(<Probe junior />);
    expect(screen.getByTestId("layers").dataset.ready).toBe("false");
    expect(screen.getByTestId("layers").textContent).toBe("art");
    release(json({ error: "down" }, 500));
    await waitFor(() => expect(screen.getByTestId("layers").dataset.ready).toBe("true"));
    expect(screen.getByTestId("layers").textContent).toBe("art");
  });

  it("leaves a senior design as it is", async () => {
    stub(async () => json(PHOTOS));
    renderAt(<Probe junior={false} />);
    expect(screen.getByTestId("layers").textContent).toBe("club,stock,logo,art");
  });
});
