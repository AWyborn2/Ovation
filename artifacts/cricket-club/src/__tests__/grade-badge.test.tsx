/**
 * Grade badges: the "logo" style shows the club logo with the grade in small
 * text underneath; the outline shapes keep the grade inside the shape.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  GradeBadge,
  BADGE_STYLE_ORDER,
  BADGE_STYLE_LABELS,
  deriveGradeMeta,
  sortGradesBySeniority,
} from "@/components/grade-badge";
import { DEFAULT_BRAND } from "@workspace/scorecard";

afterEach(() => cleanup());

describe("GradeBadge", () => {
  it("the logo style shows the club logo with the grade underneath", () => {
    render(<GradeBadge grade="A Grade" badgeStyle="logo" />);
    const badge = screen.getByRole("img", { name: "A Grade" });
    expect(badge.getAttribute("data-badge-style")).toBe("logo");
    expect(badge.querySelector("img")?.getAttribute("src")).toBe(DEFAULT_BRAND.logoUrl);
    expect(badge.textContent).toBe("A GRADE");
    expect(badge.querySelector("svg")).toBeNull();
  });

  it("keeps short grade codes like PPL readable under the logo", () => {
    render(<GradeBadge grade="PPL" badgeStyle="logo" />);
    expect(screen.getByRole("img", { name: "PPL" }).textContent).toBe("PPL");
  });

  it("an outline style still draws the shape with the grade inside", () => {
    render(<GradeBadge grade="B Grade" badgeStyle="shield" />);
    const badge = screen.getByRole("img", { name: "B Grade" });
    expect(badge.querySelector("svg")).toBeTruthy();
    expect(badge.querySelector("img")).toBeNull();
  });

  it("offers Club logo in the Branding style picker", () => {
    expect(BADGE_STYLE_ORDER).toContain("logo");
    expect(BADGE_STYLE_LABELS.logo).toBe("Club logo");
  });
});

describe("grades without a hand-written badge entry", () => {
  it("derives sensible text from the grade name", () => {
    expect(deriveGradeMeta("G Grade")).toMatchObject({ abbr: "G", bannerShort: "G GRADE" });
    expect(deriveGradeMeta("Over 55s")).toMatchObject({ abbr: "55+", bannerShort: "OVER 55S" });
    expect(deriveGradeMeta("Over 40s").abbr).toBe("40+");
    expect(deriveGradeMeta("1st Grade").abbr.length).toBeLessThanOrEqual(3);
  });

  it("renders a grade the app has never heard of", () => {
    render(<GradeBadge grade="Over 55s" badgeStyle="logo" />);
    expect(screen.getByRole("img", { name: "Over 55s" }).textContent).toBe("OVER 55S");
  });

  it("sorts known grades by seniority and new ones where their name says", () => {
    expect(
      sortGradesBySeniority([
        "Over 50s",
        "Colts",
        "G Grade",
        "Female A Grade",
        "Over 40s",
        "A Grade",
      ]),
    ).toEqual(["A Grade", "G Grade", "Female A Grade", "Colts", "Over 40s", "Over 50s"]);
  });
});
