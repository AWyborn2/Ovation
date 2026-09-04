import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { hostOf } from "./tenant-context";

/**
 * Host resolution behind a reverse proxy. On Replit Autoscale / Cloud Run the
 * public host arrives in `X-Forwarded-Host` while the inbound `Host` is an
 * internal value, so host-based routing (platform apex + tenant subdomains)
 * must read the forwarded header. Pure unit test — no DB.
 */

const reqWith = (headers: Record<string, string | string[]>): Request =>
  ({ headers }) as unknown as Request;

describe("hostOf", () => {
  it("prefers X-Forwarded-Host over the internal Host header", () => {
    const req = reqWith({
      host: "internal-cloud-run-abc123",
      "x-forwarded-host": "ovationcc.replit.app",
    });
    expect(hostOf(req)).toBe("ovationcc.replit.app");
  });

  it("falls back to Host when X-Forwarded-Host is absent", () => {
    expect(hostOf(reqWith({ host: "mandurah.ovation.app" }))).toBe("mandurah.ovation.app");
  });

  it("uses the left-most value of a multi-hop X-Forwarded-Host", () => {
    const req = reqWith({
      host: "internal",
      "x-forwarded-host": "ovationcc.replit.app, edge-proxy.internal",
    });
    expect(hostOf(req)).toBe("ovationcc.replit.app");
  });

  it("handles X-Forwarded-Host delivered as a header array", () => {
    const req = reqWith({ host: "internal", "x-forwarded-host": ["apex.example.com"] });
    expect(hostOf(req)).toBe("apex.example.com");
  });

  it("strips the port and lowercases the host", () => {
    expect(hostOf(reqWith({ "x-forwarded-host": "Apex.Example.com:443" }))).toBe(
      "apex.example.com",
    );
  });

  it("returns empty string when no host is present", () => {
    expect(hostOf(reqWith({}))).toBe("");
  });

  describe("X-Ovation-Host (Cloudflare tenant-domain proxy)", () => {
    const withSecret = (value: string | undefined, fn: () => void): void => {
      const prev = process.env.PROXY_SHARED_SECRET;
      if (value === undefined) delete process.env.PROXY_SHARED_SECRET;
      else process.env.PROXY_SHARED_SECRET = value;
      try {
        fn();
      } finally {
        if (prev === undefined) delete process.env.PROXY_SHARED_SECRET;
        else process.env.PROXY_SHARED_SECRET = prev;
      }
    };

    it("wins over X-Forwarded-Host when the proxy key matches", () => {
      withSecret("s3cret", () => {
        const req = reqWith({
          host: "internal",
          "x-forwarded-host": "ovationcc.replit.app",
          "x-ovation-host": "Hallshead.Ovationcc.app:443",
          "x-ovation-proxy-key": "s3cret",
        });
        expect(hostOf(req)).toBe("hallshead.ovationcc.app");
      });
    });

    it("is ignored when the proxy key is wrong", () => {
      withSecret("s3cret", () => {
        const req = reqWith({
          "x-forwarded-host": "ovationcc.replit.app",
          "x-ovation-host": "hallshead.ovationcc.app",
          "x-ovation-proxy-key": "wrong",
        });
        expect(hostOf(req)).toBe("ovationcc.replit.app");
      });
    });

    it("is ignored when the proxy key header is absent", () => {
      withSecret("s3cret", () => {
        const req = reqWith({
          "x-forwarded-host": "ovationcc.replit.app",
          "x-ovation-host": "hallshead.ovationcc.app",
        });
        expect(hostOf(req)).toBe("ovationcc.replit.app");
      });
    });

    it("is ignored when PROXY_SHARED_SECRET is not configured", () => {
      withSecret(undefined, () => {
        const req = reqWith({
          "x-forwarded-host": "ovationcc.replit.app",
          "x-ovation-host": "hallshead.ovationcc.app",
          "x-ovation-proxy-key": "anything",
        });
        expect(hostOf(req)).toBe("ovationcc.replit.app");
      });
    });
  });
});
