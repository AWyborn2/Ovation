// Shared helpers for onboarding/platform-admin UX tests.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

export const EVIDENCE =
  "/home/user/Ovation/docs/product-review/evidence/onboarding-platform";
export const APEX = "http://ovation.test:24624";

export async function launch({ mobile = false, videoName } = {}) {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const viewport = mobile
    ? { width: 375, height: 812 }
    : { width: 1280, height: 720 };
  const ctx = await browser.newContext({
    viewport,
    recordVideo: videoName
      ? { dir: path.join(EVIDENCE, ".video-tmp"), size: viewport }
      : undefined,
  });
  const page = await ctx.newPage();
  const log = { console: [], pageErrors: [], failedRequests: [], badResponses: [] };
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      log.console.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => log.pageErrors.push(String(e)));
  page.on("requestfailed", (r) =>
    log.failedRequests.push(`${r.method()} ${r.url()} -> ${r.failure()?.errorText}`),
  );
  page.on("response", (r) => {
    if (r.status() >= 400)
      log.badResponses.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });

  async function finish() {
    const video = page.video();
    await ctx.close();
    if (video && videoName) {
      const p = await video.path();
      fs.renameSync(p, path.join(EVIDENCE, videoName));
    }
    await browser.close();
    return log;
  }
  return { browser, ctx, page, log, finish };
}

export function shot(page, name, opts = {}) {
  return page.screenshot({ path: path.join(EVIDENCE, name), ...opts });
}

export async function brokenImages(page) {
  return page.evaluate(() =>
    Array.from(document.images)
      .filter((i) => !i.complete || i.naturalWidth === 0)
      .map((i) => i.src || i.currentSrc || "(no src)"),
  );
}

export function report(label, log, extra = {}) {
  console.log(`\n===== ${label} =====`);
  for (const [k, v] of Object.entries({ ...log, ...extra })) {
    const arr = Array.isArray(v) ? v : [v];
    console.log(`-- ${k} (${arr.length})`);
    for (const line of arr.slice(0, 40)) console.log("   " + line);
  }
}
