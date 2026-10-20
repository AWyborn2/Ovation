import { describe, expect, it } from "vitest";
import { renderPackCard, resolveCardTokens } from "../pack-render";
import { listPackManifests } from "../pack-templates/registry";
import type { CardSize, ShareCardInput, TeamListPlayer } from "../share-card";
import { getElement } from "../studio-elements/registry";
import { cq } from "../pack-templates/club-kit/parts";

/**
 * Selection side size (ADR-009, PR D): a Team List card shows every player of a
 * side of up to 14, compressing its rows above 12 rather than dropping anyone,
 * and marks an overseas player with a neutral "OS". At 12 or fewer nothing about
 * the authored layout changes.
 */

const sizes: CardSize[] = ["square", "portrait", "story", "landscape"];
const SURNAMES = [
  "ASHBY",
  "FAIRWEATHER",
  "LOMBARD",
  "MORRIS",
  "CALDWELL",
  "WHITAKER",
  "DUNSTAN",
  "BENNETT",
  "VICKERS",
  "HOLLINGSWORTH",
  "MACKENZIE",
  "COLLINS",
  "PEMBERTON",
  "ROWLANDSON",
];

function side(n: number, overseas: readonly number[] = []): TeamListPlayer[] {
  return SURNAMES.slice(0, n).map((surname, i) => ({
    order: i + 1,
    surname,
    firstInitial: "R",
    role: i === 0 ? ("C" as const) : i === 6 ? ("WK" as const) : undefined,
    ...(overseas.includes(i) ? { overseas: true } : {}),
  }));
}

function input(players: TeamListPlayer[], design?: "team-list" | "starting-xi"): ShareCardInput {
  return {
    kind: "teamList",
    grade: "A Grade",
    gradeRound: "A GRADE · ROUND 4",
    competitionLine: "Premier One Day · Round 4",
    venueDateTime: "Rushton Park · Sat 8 Nov · 12:30 PM",
    roundLabel: "Round 4",
    opponent: "Sample Mariners",
    venue: "Rushton Park",
    date: "SAT 8 NOV",
    startTime: "12:30 PM",
    players,
    ...(design ? { design } : {}),
  };
}

const teamListDesigns = listPackManifests().flatMap((pack) =>
  pack.designs
    .filter((d) => d.kind === "teamList" && d.role !== "cover")
    .map((d) => ({ packId: pack.packId, designKey: d.designKey, template: d.template })),
);

function render(packId: string, card: ShareCardInput, size: CardSize): Document {
  const html = renderPackCard(
    card,
    size,
    true,
    resolveCardTokens({ junior: false, packId }),
    false,
    undefined,
    packId,
  );
  return new DOMParser().parseFromString(html, "text/html");
}

const design = (key: string) => (key === "starting-xi" ? "starting-xi" : "team-list");

describe("Team List cards at side sizes 12–14 (ADR-009)", () => {
  it("covers every pack's team-list design", () => {
    const packs = new Set(teamListDesigns.map((d) => d.packId));
    for (const id of [
      "broadcast-dark-v1",
      "bold-type-v1",
      "gold-foil-v1",
      "neon-night-v1",
      "sunset-v1",
      "club-kit-v1",
    ]) {
      expect(packs.has(id), id).toBe(true);
    }
  });

  for (const d of teamListDesigns) {
    describe(`${d.packId}/${d.designKey}`, () => {
      it("declares room for a side of 14", () => {
        const players = d.template.repeats?.find((r) => r.key === "players");
        expect(players?.maxRows).toBe(14);
      });

      it.each(sizes)("shows all 14 names at %s, compressed, with OS on overseas rows", (size) => {
        const doc = render(d.packId, input(side(14, [2, 13]), design(d.designKey)), size);
        const text = doc.body.textContent ?? "";
        for (const surname of SURNAMES) expect(text, surname).toContain(surname);
        const list = doc.querySelector<HTMLElement>('[style*="--xi-scale"]');
        expect(list?.getAttribute("style")).toContain("--xi-scale:0.8571;--xi-rows:7;");
        const marks = Array.from(doc.querySelectorAll("[data-xi-os]"));
        expect(marks.map((m) => m.textContent)).toEqual(["OS", "OS"]);
        expect(text).not.toMatch(/12th/i);
        expect(doc.body.innerHTML).not.toContain("data-repeat-compress");
      });

      it.each(sizes)("leaves a side of 12 uncompressed and unmarked at %s", (size) => {
        const doc = render(d.packId, input(side(12), design(d.designKey)), size);
        const text = doc.body.textContent ?? "";
        for (const surname of SURNAMES.slice(0, 12)) expect(text, surname).toContain(surname);
        expect(doc.body.innerHTML).not.toContain("--xi-scale:");
        expect(doc.body.innerHTML).not.toContain("--xi-rows:");
        expect(doc.querySelectorAll("[data-xi-os]")).toHaveLength(0);
      });
    });
  }
});

describe("Studio Team XI list element (ck.xi-list)", () => {
  const el = getElement("ck.xi-list")!;
  const ctx = {} as Parameters<typeof el.render>[2];
  const rows = (n: number) =>
    Array.from(
      { length: n },
      (_, i) => `${i + 1} | Player ${i + 1} | ${i === 11 ? "12th" : ""} | ${i === 3 ? "OS" : ""}`,
    ).join("\n");

  it("keeps a side of 12 exactly as before, 12th included", () => {
    const html = el.render(cq, { rows: rows(12) }, ctx);
    expect(html).toContain("12th");
    expect(html).toContain("grid-template-rows:repeat(6,auto)");
    expect(html).toContain("font-size:3cqmin");
    expect((html.match(/Player \d+/g) ?? []).length).toBe(12);
  });

  it("shows 14 players compressed, with no 12th and an OS mark", () => {
    const html = el.render(cq, { rows: rows(14) }, ctx);
    expect((html.match(/Player \d+/g) ?? []).length).toBe(14);
    expect(html).not.toContain("12th");
    expect(html).toContain("grid-template-rows:repeat(7,auto)");
    // 3cqmin number type at 12 / 14.
    expect(html).toContain("font-size:2.571cqmin");
    expect((html.match(/data-xi-os="1"[^>]*>OS</g) ?? []).length).toBe(1);
  });
});
