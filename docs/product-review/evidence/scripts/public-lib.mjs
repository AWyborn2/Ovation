// Shared helpers for the public-visitor UX review scripts.
import fs from "node:fs";
import path from "node:path";

export const BASE = "http://mandurah.ovation.test:24624";
export const EVIDENCE = "/home/user/Ovation/docs/product-review/evidence/public-visitor";
export const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export function ensureDirs() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
}

// Attach console/pageerror/requestfailed/bad-response collectors to a page.
// Returns the log object; call snapshot(label) after each page visit.
export function attachCollectors(page) {
  const log = { entries: [], current: null };
  const push = (kind, detail) => {
    (log.current ?? log).entries?.push?.({ kind, detail });
    if (log.current) log.current[kind].push(detail);
  };
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      push("console", `[${msg.type()}] ${msg.text().slice(0, 400)}`);
    }
  });
  page.on("pageerror", (err) => push("pageerror", String(err).slice(0, 400)));
  page.on("requestfailed", (req) => {
    const f = req.failure()?.errorText ?? "";
    if (f.includes("ERR_ABORTED")) return; // benign SPA cancellations
    push("requestfailed", `${req.method()} ${req.url()} :: ${f}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      push("badresponse", `${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });
  return log;
}

export function startPage(log, label) {
  log.current = { label, console: [], pageerror: [], requestfailed: [], badresponse: [], notes: [] };
  log.entries.push(log.current);
  return log.current;
}

export async function pageDiagnostics(page, rec) {
  // broken images
  const broken = await page.evaluate(() =>
    Array.from(document.images)
      .filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:"))
      .map((i) => i.src)
  );
  if (broken.length) rec.notes.push(`BROKEN IMAGES: ${broken.join(", ")}`);
  // horizontal scroll
  const h = await page.evaluate(() => {
    const d = document.documentElement;
    return { scrollW: d.scrollWidth, innerW: window.innerWidth };
  });
  if (h.scrollW > h.innerW + 1) rec.notes.push(`HORIZONTAL SCROLL: scrollWidth ${h.scrollW} > viewport ${h.innerW}`);
  return { broken, h };
}

export async function skeletonCheck(page, rec) {
  // sample immediately after navigation to see if any loading affordance exists
  const n = await page
    .evaluate(() => document.querySelectorAll('[class*="skeleton"], .animate-pulse, [class*="animate-pulse"]').length)
    .catch(() => 0);
  rec.notes.push(`loading-affordance elements seen right after nav: ${n}`);
  return n;
}

export async function shot(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE, name), fullPage: false });
  console.log("shot", name);
}

export async function fullShot(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE, name), fullPage: true });
  console.log("shot(full)", name);
}

export function writeLog(log, file) {
  const out = log.entries
    .map((e) => {
      const lines = [`## ${e.label}`];
      for (const k of ["console", "pageerror", "requestfailed", "badresponse", "notes"]) {
        for (const d of e[k] ?? []) lines.push(`- ${k}: ${d}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
  fs.writeFileSync(path.join(EVIDENCE, file), out);
  console.log("wrote", file);
}

export async function saveVideo(page, dest) {
  const v = page.video();
  if (!v) return;
  const p = await v.path();
  return { p, dest };
}
