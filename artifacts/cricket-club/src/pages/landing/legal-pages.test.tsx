import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { LandingRoutes } from "@/pages/landing";
import { renderAt } from "@/test/render";

afterEach(cleanup);

describe("platform legal pages", () => {
  it("serves the privacy policy with the Google Limited Use disclosure and contact", () => {
    renderAt(<LandingRoutes />, "/privacy");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Privacy Policy");
    expect(screen.getByText("Google API Services User Data Policy")).toBeTruthy();
    expect(screen.getAllByText("ash@sproutandspark.com.au").length).toBeGreaterThan(0);
  });

  it("serves the terms and links both from the footer", () => {
    renderAt(<LandingRoutes />, "/terms");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Terms of Use");
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(legal.querySelector('a[href="/privacy"]')).toBeTruthy();
    expect(legal.querySelector('a[href="/terms"]')).toBeTruthy();
  });
});
