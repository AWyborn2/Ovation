import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chromeCandidates, findChrome, serveStatic, type StaticServer } from "./harness-browser";

describe("findChrome", () => {
  const only =
    (...present: string[]) =>
    (p: string) =>
      present.includes(p);

  it("prefers CHROME_PATH (CI), then the dev stack's variables", () => {
    const env = {
      CHROME_PATH: "/usr/bin/google-chrome",
      PUPPETEER_EXECUTABLE_PATH: "/opt/chrome",
    };
    expect(findChrome(env, only("/usr/bin/google-chrome", "/opt/chrome"), "linux")).toBe(
      "/usr/bin/google-chrome",
    );
    expect(findChrome({ CHROMIUM_PATH: "/opt/chromium" }, only("/opt/chromium"), "linux")).toBe(
      "/opt/chromium",
    );
  });

  it("fails loudly when an override points nowhere, rather than picking another browser", () => {
    expect(() =>
      findChrome({ CHROME_PATH: "/nope" }, only("/usr/bin/google-chrome"), "linux"),
    ).toThrow(/CHROME_PATH is set to \/nope/);
  });

  it("falls back to an installed Chrome, then Edge, on Windows", () => {
    const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
    const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
    expect(findChrome({}, only(edge, chrome), "win32")).toBe(chrome);
    expect(findChrome({}, only(edge), "win32")).toBe(edge);
    expect(chromeCandidates("win32", {}).indexOf(chrome)).toBeLessThan(
      chromeCandidates("win32", {}).indexOf(edge),
    );
  });

  it("says what to do when no browser is installed", () => {
    expect(() => findChrome({}, only(), "linux")).toThrow(/set CHROME_PATH/);
  });
});

describe("serveStatic", () => {
  let dir: string;
  let server: StaticServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
    await rm(dir, { recursive: true, force: true });
  });

  it("serves built files, falls back to index.html for app routes, and 404s the API", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "harness-static-"));
    await mkdir(path.join(dir, "assets"));
    await writeFile(path.join(dir, "index.html"), "<!doctype html><title>app</title>");
    await writeFile(path.join(dir, "assets", "app.js"), "console.log(1)");
    server = await serveStatic(dir);

    const js = await fetch(`${server.url}/assets/app.js`);
    expect(js.headers.get("content-type")).toMatch(/javascript/);
    expect(await js.text()).toBe("console.log(1)");

    const route = await fetch(`${server.url}/__card-render`);
    expect(route.headers.get("content-type")).toMatch(/text\/html/);
    expect(await route.text()).toContain("<title>app</title>");

    const outside = await fetch(`${server.url}/..%2F..%2Fsecret.txt`);
    expect(await outside.text()).toContain("<title>app</title>");

    expect((await fetch(`${server.url}/api/brand`)).status).toBe(404);
  });

  it("refuses a folder with no build in it", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "harness-static-"));
    await expect(serveStatic(dir)).rejects.toThrow(/no index.html/);
  });
});
