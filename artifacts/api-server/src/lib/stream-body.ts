import { Readable, pipeline } from "node:stream";
import type { ServerResponse } from "node:http";

/**
 * Stream an object-storage body to the response (round 6 retest).
 *
 * The storage routes used `Readable.fromWeb(body).pipe(res)`. `pipe` never
 * handles the source's errors, so a storage read that failed part way threw
 * an unhandled stream error, which stops the whole api-server process. The
 * response was then cut off; a browser can take a cut-off picture as loaded
 * and draw it as a blank or half tile. `pipeline` handles the error: the
 * response is torn down (so the client sees a failed download, not a short
 * one) and the server carries on.
 */
export function streamBody(
  body: ReadableStream<Uint8Array>,
  res: ServerResponse,
  onError: (err: Error) => void = () => {},
): void {
  pipeline(Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]), res, (err) => {
    if (!err) return;
    onError(err);
    // pipeline has destroyed both ends; make sure the socket goes too.
    res.destroy(err);
  });
}
