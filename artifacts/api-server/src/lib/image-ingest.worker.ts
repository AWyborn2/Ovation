/**
 * HEIC → JPEG decode, off the main thread (KTD7). `heic-convert` decodes in
 * WebAssembly and takes seconds on a 12-megapixel iPhone photo; running it
 * here keeps the API responsive. Built as its own esbuild entry
 * (`dist/image-ingest.worker.mjs`, see build.mjs) and loaded by
 * image-ingest.ts. One conversion per worker; the caller terminates it.
 */
import { parentPort, workerData } from "node:worker_threads";
import convert from "heic-convert";

async function run(): Promise<void> {
  const input = workerData as Uint8Array;
  try {
    const output = await convert({ buffer: input, format: "JPEG", quality: 0.92 });
    parentPort?.postMessage({ ok: true, output: new Uint8Array(output) });
  } catch (err) {
    parentPort?.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

void run();
