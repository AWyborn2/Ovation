/**
 * An object stream that fails part way (round 6 retest): the client must see
 * a failed download, never a short one that ends cleanly (a browser draws a
 * cut-off picture as a blank or half tile), and the process must not throw.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamBody } from "./stream-body";

let server: http.Server | null = null;
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

function serve(body: () => ReadableStream<Uint8Array>, onError: (e: Error) => void) {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "image/png" });
    streamBody(body(), res, onError);
  });
  return new Promise<number>((resolve) =>
    server!.listen(0, () => resolve((server!.address() as AddressInfo).port)),
  );
}

/** GET the URL: the bytes and whether the response ended cleanly. */
function get(port: number): Promise<{ bytes: number; clean: boolean }> {
  return new Promise((resolve) => {
    let bytes = 0;
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      res.on("data", (c: Buffer) => (bytes += c.length));
      res.on("end", () => resolve({ bytes, clean: res.complete }));
      res.on("error", () => resolve({ bytes, clean: false }));
      res.on("aborted", () => resolve({ bytes, clean: false }));
    });
    req.on("error", () => resolve({ bytes, clean: false }));
  });
}

describe("streamBody", () => {
  it("sends the whole body when the stream completes", async () => {
    const port = await serve(
      () =>
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(1000));
            c.close();
          },
        }),
      () => {},
    );
    await expect(get(port)).resolves.toEqual({ bytes: 1000, clean: true });
  });

  it("a client that goes away mid-download releases the storage stream", async () => {
    let cancelled = false;
    const port = await serve(
      () =>
        new ReadableStream({
          pull: (c) =>
            new Promise<void>((r) =>
              setTimeout(() => {
                if (!cancelled) c.enqueue(new Uint8Array(16384));
                r();
              }, 5),
            ),
          cancel: () => {
            cancelled = true;
          },
        }),
      () => {},
    );
    await new Promise<void>((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.once("data", () => {
          req.destroy();
          resolve();
        });
      });
      req.on("error", () => {});
    });
    await vi.waitFor(() => expect(cancelled).toBe(true));
  });

  it("a stream that fails part way aborts the response and is reported, not thrown", async () => {
    const errors: Error[] = [];
    const uncaught: unknown[] = [];
    const onUncaught = (e: unknown) => uncaught.push(e);
    process.on("uncaughtException", onUncaught);
    try {
      const port = await serve(
        () =>
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(500));
              setTimeout(() => c.error(new Error("storage read reset")), 20);
            },
          }),
        (e) => errors.push(e),
      );
      const got = await get(port);
      expect(got.clean).toBe(false);
      await vi.waitFor(() => expect(errors.map((e) => e.message)).toEqual(["storage read reset"]));
      expect(uncaught).toEqual([]);
    } finally {
      process.off("uncaughtException", onUncaught);
    }
  });
});
