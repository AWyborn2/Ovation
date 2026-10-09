import { describe, expect, it } from "vitest";
import { bindInput, broadcastPlayerName, fixtureRoundLabel } from "./bind";
import { renderPackCard, resolveCardTokens } from "../pack-render";
import type { CardSize, ShareCardInput } from "../share-card";

const sizes: CardSize[] = ["square", "portrait", "story", "landscape"];
const sampleNames = [
  "Ashby", "Fairweather", "Lombard", "Morris", "Caldwell", "Whitaker",
  "Dunstan", "Bennett", "Vickers", "Hollingsworth", "Mackenzie", "Collins",
];
const players = sampleNames.map((surname, index) => ({
  order: index + 1,
  surname: surname.toUpperCase(),
  ...(index !== 1 ? { firstInitial: "R" } : {}),
  role: index === 2 ? "C" as const : index === 4 ? "WK" as const : undefined,
  shirtNumber: String(index + 11),
}));
const input = {
  kind: "teamList",
  grade: "C Grade",
  gradeRound: "C GRADE · ROUND 4",
  competitionLine: "Premier One Day · Round 7",
  venueDateTime: "Rushton Park · Sat 8 Nov · 12:30 PM",
  roundLabel: "Round 13",
  opponent: "Sample Mariners",
  venue: "Rushton Park",
  date: "SAT 8 NOV",
  startTime: "12:30 PM",
  numbering: "shirt",
  players,
} satisfies ShareCardInput;
const brandData = {
  brand: {
    name: "Halls Head",
    tagline: "Cricket Club · Est 1991",
    logoUrl: "/mockup/club-logo.png",
  },
  hashtag: "#HALLSHEAD",
  photoUrl: "/mockup/club-team-photo.jpg",
  sponsors: [
    { name: "Coastal Fieldworks", logoUrl: "/mockup/partner-1.svg" },
    { name: "South Shore Community", logoUrl: "/mockup/partner-2.svg" },
    { name: "Northline Supply", logoUrl: "/mockup/partner-3.svg" },
  ],
};

describe("Broadcast Dark Team List rendering", () => {
  it.each(sizes)("renders a full single-column lineup for %s without losing names or roles", size => {
    const html = renderPackCard(
      input,
      size,
      true,
      resolveCardTokens({ junior: false, packId: "broadcast-dark-v1" }),
      false,
      brandData,
      "broadcast-dark-v1",
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const list = doc.querySelector<HTMLElement>('[data-xi-layout="single-column"]');
    const rows = Array.from(doc.querySelectorAll<HTMLElement>("[data-xi-row]"));
    expect(list).not.toBeNull();
    expect(list?.getAttribute("style")).toContain("flex-direction:column");
    expect(list?.getAttribute("style")).not.toContain("grid-template-columns");
    expect(rows).toHaveLength(12);
    expect(Array.from(doc.querySelectorAll("[data-xi-name]")).map(node => node.textContent)).toEqual(
      players.map(player => player.firstInitial ? `${player.firstInitial}. ${player.surname}` : player.surname),
    );
    expect(rows[0].querySelector("[data-xi-row]")).toBeNull();
    expect(rows[2].querySelector("[data-xi-role]")?.textContent).toBe("(C)");
    expect(rows[4].querySelector("[data-xi-role]")?.textContent).toBe("(WK)");
    expect(rows[2].querySelector("[data-xi-role]")?.previousElementSibling?.textContent).toBe("R. LOMBARD");
    expect(rows.map(row => row.querySelector("span")?.textContent)).toEqual(
      players.map(player => player.shirtNumber),
    );
    expect(doc.querySelector("[data-team-grade]")?.previousElementSibling?.textContent).toBe("ROUND 13");
    expect(doc.body.textContent).toContain("C GRADE");
    expect(doc.body.textContent).toContain("Rushton Park · Sat 8 Nov · 12:30 PM");
    expect(html).toContain("data-skeleton-body");
    expect(html).toContain("/mockup/partner-1.svg");
    expect(html).not.toContain("/mockup/partner-2.svg");
    expect(doc.body.textContent).toContain("#HALLSHEAD");
  });

  it("uses the approved initial only and leaves the original surname binding intact", () => {
    const bound = bindInput(input);
    const rows = bound.rows.players;
    expect(rows[0].values.surname).toBe("ASHBY");
    expect(rows[0].values.broadcastName).toBe("R. ASHBY");
    expect(rows[1].values.broadcastName).toBe("FAIRWEATHER");
    expect(broadcastPlayerName("1", "EXAMPLE")).toBe("EXAMPLE");
    expect(broadcastPlayerName("R.", "EXAMPLE")).toBe("EXAMPLE");
  });

  it("uses a real explicit round first, then extracts only explicit legacy round strings", () => {
    expect(fixtureRoundLabel("Round 18", "A Grade · Round 4", "Round 7")).toBe("ROUND 18");
    expect(fixtureRoundLabel(undefined, "C Grade — Rd. 6", "Premier · Round 5")).toBe("ROUND 6");
    expect(fixtureRoundLabel(undefined, "C Grade", "One Day")).toBe("");
    expect(fixtureRoundLabel("Grand Final", "C Grade · Round 9")).toBe("GRAND FINAL");
    expect(fixtureRoundLabel(undefined, "C Grade · Grand Final", "One Day")).toBe("GRAND FINAL");
  });

  it("keeps old carousel snapshots surname-only and binds set-specific fixture information", () => {
    const oldSnapshot = {
      ...input,
      roundLabel: "Round 15",
      setPage: "2/3",
      players: input.players.map(({ firstInitial: _initial, ...player }) => player),
    } as ShareCardInput;
    const html = renderPackCard(
      oldSnapshot,
      "square",
      true,
      resolveCardTokens({ junior: false, packId: "broadcast-dark-v1" }),
      false,
      brandData,
      "broadcast-dark-v1",
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.body.textContent).toContain("ROUND 15");
    expect(doc.body.textContent).toContain("TEAM LIST · 2/3");
    expect(Array.from(doc.querySelectorAll("[data-xi-name]"))[0].textContent).toBe("ASHBY");
  });
});
