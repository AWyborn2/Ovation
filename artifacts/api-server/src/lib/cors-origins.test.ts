import { describe, expect, it } from "vitest";
import { buildAllowedOrigins } from "./cors-origins";

describe("mobile preview CORS origins", () => {
  it("allows only the project's exact Expo development origin", () => {
    const origins = buildAllowedOrigins({
      domains: "club.example.com, www.club.example.com",
      devDomain: "own.replit.dev",
      expoDevDomain: "own.expo.replit.dev",
      production: false,
    });
    expect(origins.has("https://own.expo.replit.dev")).toBe(true);
    expect(origins.has("https://other.expo.replit.dev")).toBe(false);
    expect(origins.has("https://own.expo.replit.dev.attacker.example")).toBe(false);
    expect(origins.has("http://own.expo.replit.dev")).toBe(false);
    expect(origins.has("https://club.example.com")).toBe(true);
    expect(origins.has("https://www.club.example.com")).toBe(true);
  });

  it("does not add the Expo development origin in production", () => {
    const origins = buildAllowedOrigins({
      domains: "club.example.com",
      expoDevDomain: "own.expo.replit.dev",
      production: true,
    });
    expect([...origins]).toEqual(["https://club.example.com"]);
  });

  it("handles missing or empty host lists", () => {
    expect([...buildAllowedOrigins({ production: false })]).toEqual([]);
    expect([...buildAllowedOrigins({ domains: " , ", production: false })]).toEqual([]);
  });
});
