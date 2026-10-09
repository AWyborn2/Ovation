import { describe, it, expect } from "vitest";
import { renderPackCard, resolveCardTokens } from "../pack-render";
import { listPackManifests } from "../pack-templates/registry";
import { sampleCardInput } from "../sample-card-inputs";
import type { CardSize, ShareCardInput } from "../share-card";

const sizes: CardSize[] = ["square", "portrait", "story", "landscape"];
const base = sampleCardInput("teamList") as Extract<ShareCardInput, { kind: "teamList" }>;

describe("built-in team grade headings and attached roles", () => {
  for (const { packId } of listPackManifests())
    for (const size of sizes) {
      it(`${packId} / ${size}: binds only this team's grade and preserves roles/order/names`, () => {
        for (const grade of [
          "A Grade",
          "Female A Grade",
          "Western District Female Premier Championship Grade",
          "",
          undefined,
        ]) {
          const players = [
            "Lee",
            "Venkatanarasimharaju-Worthington",
            "van der Westhuizen",
            "Jones",
            "García Márquez",
            "Smith",
            "Li",
            "Jean-Baptiste de Villiers",
            "O’Shaughnessy",
            "WWWMMMMWWWW",
            "Jose\u0301 Álvarez",
            "D'Angelo",
          ].map((surname, i) => ({
            order: i + 1,
            surname,
            role: (["C", "WK", "C/WK", undefined] as const)[i % 4],
          }));
          const input = { ...base, grade, gradeRound: "Unrelated metadata · Round 7", players };
          const html = renderPackCard(
            input,
            size,
            true,
            resolveCardTokens({ junior: false, packId }),
            false,
            null,
            packId,
          );
          const doc = new DOMParser().parseFromString(html, "text/html");
          expect(doc.querySelector("[data-team-grade]")?.textContent).toBe(
            grade?.toUpperCase() || "TEAM LIST",
          );
          expect(doc.body.textContent).not.toContain("THE XI");
          if (packId === "broadcast-dark-v1") {
            expect(
              doc.querySelector("[data-team-grade]")?.previousElementSibling?.textContent,
            ).toBe("ROUND 8");
          } else {
            expect(doc.body.textContent).toContain("Unrelated metadata · Round 7");
          }
          expect(
            Array.from(doc.querySelectorAll("[data-xi-name]")).map((n) => n.textContent),
          ).toEqual(players.map((p) => p.surname));
          const rows = Array.from(doc.querySelectorAll("[data-xi-row]"));
          rows.forEach((row, i) => {
            const role = row.querySelector("[data-xi-role]");
            expect(role?.textContent ?? "").toBe(players[i].role ? `(${players[i].role})` : "");
            if (role) expect(role.previousElementSibling?.hasAttribute("data-xi-name")).toBe(true);
          });
          expect(html).not.toContain("()");
          expect(doc.querySelector("[data-team-grade]")?.getAttribute("style")).not.toMatch(
            /ellipsis|line-clamp/,
          );
        }
      });
    }
  it("does not change Starting XI or library row elements", () => {
    const html = renderPackCard(
      { ...base, design: "starting-xi" },
      "square",
      false,
      resolveCardTokens({ junior: false, packId: "club-kit-v1" }),
      false,
      null,
      "club-kit-v1",
    );
    expect(html).toContain("STARTING");
    expect(html).not.toContain("data-team-grade");
    expect(html).not.toContain("data-xi-fit");
  });
});
