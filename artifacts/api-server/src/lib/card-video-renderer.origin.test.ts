import { describe, it, expect } from "vitest";
import { harnessOriginFromHeaders } from "./card-video-renderer";

// Pure unit tests for the harness-origin derivation — no DB, no Chromium. This
// is the fix for the production 500 where the renderer defaulted to
// http://localhost:80/__card-render (nothing listens there in the autoscale
// deployment) instead of the public origin the request arrived on.
describe("harnessOriginFromHeaders", () => {
  it("uses forwarded proto + host (the deployment case)", () => {
    expect(
      harnessOriginFromHeaders({
        "x-forwarded-proto": "https",
        "x-forwarded-host": "hallshead.ovationcc.app",
        host: "internal:8080",
      }),
    ).toBe("https://hallshead.ovationcc.app");
  });

  it("prefers x-forwarded-host over the raw Host header", () => {
    expect(
      harnessOriginFromHeaders({
        "x-forwarded-host": "public.example.com",
        host: "127.0.0.1:8080",
      }),
    ).toBe("https://public.example.com");
  });

  it("defaults a non-local host to https when no forwarded proto is present", () => {
    expect(harnessOriginFromHeaders({ host: "club.example.com" })).toBe(
      "https://club.example.com",
    );
  });

  it("defaults localhost / loopback to http", () => {
    expect(harnessOriginFromHeaders({ host: "localhost:80" })).toBe(
      "http://localhost:80",
    );
    expect(harnessOriginFromHeaders({ host: "127.0.0.1:3000" })).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("takes the first value from comma-lists and array headers", () => {
    expect(
      harnessOriginFromHeaders({
        "x-forwarded-proto": "https, http",
        "x-forwarded-host": "first.example.com, second.example.com",
      }),
    ).toBe("https://first.example.com");
    expect(
      harnessOriginFromHeaders({
        "x-forwarded-host": ["arr.example.com", "ignored.example.com"],
      }),
    ).toBe("https://arr.example.com");
  });

  it("returns null when no host header is present (internal, request-less callers)", () => {
    expect(harnessOriginFromHeaders({})).toBeNull();
    expect(harnessOriginFromHeaders({ "x-forwarded-proto": "https" })).toBeNull();
  });
});
