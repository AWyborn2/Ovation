/**
 * Opt-in browser check for whole-set downloads (round 6 retest: set downloads
 * saved slides with blank sponsor tiles and a missing hero photo).
 *
 * Serves the BUILT web app (`pnpm --filter @workspace/cricket-club run build`)
 * and a club's pictures from a local server of its own: twelve sponsor logos,
 * a crest, an opposition crest and a hero photo, each answered after a random
 * delay so they arrive out of order. Draws a 14-slide Match Day set (Sunset and
 * Broadcast Dark: covers, fixtures, day and sponsors pages) through
 * renderCardStill two at a time, as Share → Download does, and checks:
 *   1. every slide draws every picture (the picture pixels match a slow-free
 *      pass of the same slide);
 *   2. a sponsor logo whose download is cut off once is drawn whole on retry;
 *   3. a logo whose download is always cut off fails each slide that draws it
 *      loudly, naming the file, instead of saving a slide with a blank tile.
 * Needs no database. Run:
 *   pnpm --filter @workspace/api-server exec tsx src/maintenance/set-download-image-check.ts
 * (PUPPETEER_EXECUTABLE_PATH or CHROMIUM_PATH names Chromium when it is not on PATH.)
 */
import http from "node:http";
import zlib from "node:zlib";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import sharp from "sharp";

const repo = path.resolve(import.meta.dirname, "../../../..");
const webRoot = path.join(repo, "artifacts/cricket-club/dist/public");
const bundles = path.join(repo, "lib/template-bundles");

// ── Pictures: solid colours, so the drawn pixels can be counted ─────────────
function png(w: number, h: number, rgb: [number, number, number]): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = table[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(w * 3 + 1);
  for (let x = 0; x < w; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const LOGO = png(400, 240, [255, 0, 255]);
const PHOTO = png(800, 800, [0, 255, 0]);

// ── The local server: the web app, and pictures with latency ───────────────
const state = { maxDelay: 0, cutOnce: new Set<string>(), cutAlways: new Set<string>() };
const types: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname.startsWith("/img/")) {
    const name = url.pathname.slice(5);
    const body = name.startsWith("photo") ? PHOTO : LOGO;
    setTimeout(() => {
      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
      if (state.cutAlways.has(name) || state.cutOnce.delete(name)) {
        // The upstream died part way, and the response still ended cleanly.
        res.end(body.subarray(0, body.length >> 1));
        return;
      }
      res.end(body);
    }, Math.random() * state.maxDelay);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    // The harness asks for the brand on boot; nothing else is needed.
    const brand = url.pathname.includes("brand");
    res.writeHead(brand ? 200 : 404, { "content-type": "application/json" });
    res.end(brand ? JSON.stringify({ name: "Check Cricket Club" }) : "{}");
    return;
  }
  let file = path.join(webRoot, decodeURIComponent(url.pathname));
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
  } catch {
    file = path.join(webRoot, "index.html");
  }
  try {
    const bytes = await readFile(file);
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.RENDER_HARNESS_URL = `${origin}/__card-render`;
const { renderCardStill, closeBrowser } = await import("../lib/card-video-renderer");

// ── The set: 14 slides, two looks ──────────────────────────────────────────
const img = (name: string) => `${origin}/img/${name}.png`;
const sponsors = Array.from({ length: 12 }, (_, i) => ({
  name: `Sponsor ${i + 1}`,
  logoUrl: img(`sponsor${i + 1}`),
}));
const data = {
  brand: {
    name: "Check Cricket Club",
    logoUrl: img("crest"),
    primaryColour: "#1f6f43",
    backgroundColour: "#0c2a1b",
  },
  hashtag: "#CCC",
  sponsors,
  photoUrl: img("photo"),
};
const base = {
  kind: "matchDay",
  roundLabel: "ROUND 7",
  oppositionName: "Visitors",
  homeAway: "HOME",
  venue: "Sample Oval",
  date: "SAT 14 DEC",
  startTime: "12:00 PM",
  photoUrl: img("photo"),
  oppositionLogoUrl: img("opp"),
  namesResolved: true,
};
const carouselPage = (page: string, title: string) => ({
  ...base,
  carouselPage: { page, title, fixtureCount: 3, sponsors },
});
type Slide = { label: string; input: unknown; options: unknown };
const slides: Slide[] = [];
for (const look of ["sunset", "broadcast-dark"]) {
  const doc = JSON.parse(readFileSync(path.join(bundles, look, "matchDay.json"), "utf8")).document;
  const pages: [string, unknown][] = [
    ["title", carouselPage("title", "Match day")],
    ["fixture", { ...base, grade: "A Grade" }],
    ["fixture", { ...base, grade: "B Grade" }],
    ["fixture", { ...base, grade: "C Grade" }],
    ["day", carouselPage("day", "Saturday")],
    ["sponsors", carouselPage("sponsors", "Our sponsors")],
    ["fixture", { ...base, grade: "D Grade" }],
  ];
  for (const [page, input] of pages)
    slides.push({
      label: `${look} ${page}`,
      input,
      options: {
        size: "square",
        sponsorsOn: true,
        strictImages: true,
        junior: false,
        theme: null,
        data,
        packId: "blank",
        adjustments: doc,
        page,
      },
    });
}

/** Picture pixels drawn: logo magenta and photo green. */
async function picturePixels(buffer: Buffer): Promise<number> {
  const { data: raw, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < raw.length; i += info.channels) {
    const [r, g, b] = [raw[i]!, raw[i + 1]!, raw[i + 2]!];
    if ((r > 200 && g < 60 && b > 200) || (g > 200 && r < 60 && b < 60)) n++;
  }
  return n;
}

/** Draw every slide two at a time, in slide order; each slide's pixels or its error. */
async function drawSet(): Promise<(number | string)[]> {
  const out: (number | string)[] = new Array(slides.length);
  let next = 0;
  const worker = async () => {
    while (next < slides.length) {
      const n = next++;
      const s = slides[n]!;
      try {
        const { buffer } = await renderCardStill(s.input, s.options, null, { format: "png" });
        out[n] = await picturePixels(buffer);
      } catch (err) {
        out[n] = err instanceof Error ? err.message : String(err);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  return out;
}

const failures: string[] = [];
try {
  state.maxDelay = 0;
  const expected = await drawSet();
  for (const [i, v] of expected.entries())
    if (typeof v !== "number" || v === 0) failures.push(`baseline ${slides[i]!.label}: ${v}`);

  // 1. Out of order, up to 2.5 s each.
  state.maxDelay = 2500;
  const t0 = Date.now();
  const jittered = await drawSet();
  console.log(`14 slides with jittered pictures in ${Date.now() - t0} ms`);
  for (const [i, v] of jittered.entries())
    if (v !== expected[i]) failures.push(`jitter ${slides[i]!.label}: ${v} (want ${expected[i]})`);

  // 2. A sponsor logo and the photo cut off once each: retried, drawn whole.
  state.maxDelay = 300;
  state.cutOnce = new Set(["sponsor2.png", "photo.png"]);
  const retried = await drawSet();
  for (const [i, v] of retried.entries())
    if (v !== expected[i])
      failures.push(`cut once ${slides[i]!.label}: ${v} (want ${expected[i]})`);

  // 3. Sponsor 9's logo always cut off: a slide that draws it fails, naming it;
  //    every other slide draws as before. Broadcast Dark's sponsors page draws it.
  state.cutAlways = new Set(["sponsor9.png"]);
  const cut = await drawSet();
  for (const [i, v] of cut.entries()) {
    const named = typeof v === "string" && v.includes("sponsor9.png");
    if (!named && v !== expected[i])
      failures.push(`cut always ${slides[i]!.label}: ${v} (want ${expected[i]} or a failure)`);
  }
  const darkSponsors = slides.findIndex((s) => s.label === "broadcast-dark sponsors");
  if (typeof cut[darkSponsors] !== "string")
    failures.push(
      `cut always broadcast-dark sponsors: saved (${cut[darkSponsors]}) instead of failing`,
    );
  else console.log(`a cut-off logo fails its slide: "${cut[darkSponsors]}"`);
} finally {
  await closeBrowser();
  server.close();
}
if (failures.length) {
  console.error(`FAIL\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("PASS: every slide drew every picture; a cut-off logo was retried or failed loudly");
process.exit(0);
