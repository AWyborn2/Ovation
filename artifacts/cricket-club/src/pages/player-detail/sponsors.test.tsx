import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PlayerSponsorStrip, sponsorHref } from "./sponsors";

/**
 * Player page sponsors (player-sponsors P1): the profile shows the player's own
 * sponsors, logo and name, linked when the sponsor has a website, and nothing
 * when the player has none.
 */

afterEach(cleanup);

const sp = (id: number, name: string, link = "") => ({
  id,
  name,
  logoUrl: `/api/storage/objects/${id}.png`,
  link,
});

describe("PlayerSponsorStrip", () => {
  it("renders nothing when the player has no sponsor", () => {
    render(<PlayerSponsorStrip sponsors={[]} />);
    expect(screen.queryByTestId("player-sponsors")).toBeNull();
  });

  it("shows each sponsor's logo and name, linked only when a website is set", () => {
    render(
      <PlayerSponsorStrip
        sponsors={[sp(1, "Joe's Plumbing", "https://joes.example"), sp(2, "Corner Cafe")]}
      />,
    );
    expect(screen.getByText("Proudly sponsored by")).toBeTruthy();
    const linked = screen.getByRole("link", { name: "Joe's Plumbing" });
    expect(linked.getAttribute("href")).toBe("https://joes.example");
    expect(linked.getAttribute("target")).toBe("_blank");
    expect(linked.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("Corner Cafe").closest("a")).toBeNull();
    expect(screen.getByTestId("player-sponsors").querySelectorAll("img")).toHaveLength(2);
  });
});

describe("PlayerSponsorStrip in the hero", () => {
  it("shows the label and each logo on a white tile, linked like the card", () => {
    render(
      <PlayerSponsorStrip
        variant="hero"
        sponsors={[sp(1, "Joe's Plumbing", "https://joes.example"), sp(2, "Corner Cafe")]}
      />,
    );
    const strip = screen.getByTestId("player-sponsors");
    expect(strip.getAttribute("data-variant")).toBe("hero");
    expect(screen.getByText("Proudly sponsored by")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Joe's Plumbing" }).getAttribute("href")).toBe(
      "https://joes.example",
    );
    expect(strip.querySelectorAll("span.bg-white img")).toHaveLength(2);
  });

  it("renders nothing without a sponsor", () => {
    render(<PlayerSponsorStrip variant="hero" sponsors={[]} />);
    expect(screen.queryByTestId("player-sponsors")).toBeNull();
  });
});

describe("sponsorHref", () => {
  it("keeps web addresses and drops anything else", () => {
    expect(sponsorHref(" https://a.example ")).toBe("https://a.example");
    expect(sponsorHref("http://a.example")).toBe("http://a.example");
    expect(sponsorHref("")).toBeNull();
    expect(sponsorHref("javascript:alert(1)")).toBeNull();
    expect(sponsorHref("joes.com.au/about")).toBe("https://joes.com.au/about");
    expect(sponsorHref("Joe's Plumbing")).toBeNull();
    expect(sponsorHref("mailto:joe@a.example")).toBeNull();
  });
});
