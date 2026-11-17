/**
 * Every committed Team List look prints the name line ("J. SURNAME (C)"),
 * never the bare surname, and has no separate role cell to print it twice
 * (Halls Head, Nov 2026: the newer looks had dropped the initial and marks).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const BUNDLES = path.resolve(__dirname, "../../../template-bundles");

type Cell = { field: string; show?: string };
type Layer = { kind: string; rows?: { repeat: string; cells: Cell[] } };

describe("team list name lines", () => {
  it("every Team List look's player rows print listName", () => {
    const looks = readdirSync(BUNDLES).filter((l) =>
      existsSync(path.join(BUNDLES, l, "teamList.json")),
    );
    expect(looks.length).toBeGreaterThan(5);
    for (const look of looks) {
      const { document } = JSON.parse(
        readFileSync(path.join(BUNDLES, look, "teamList.json"), "utf8"),
      ) as { document: { pages: Record<string, { layers: Layer[] }> } };
      const lists = Object.values(document.pages)
        .flatMap((p) => p.layers)
        .filter((l) => l.kind === "rows" && l.rows?.repeat === "players");
      expect(lists.length, look).toBeGreaterThan(0);
      for (const l of lists) {
        const text = l.rows!.cells.filter((c) => c.show !== "backdrop").map((c) => c.field);
        expect(text, look).toContain("listName");
        expect(text, look).not.toContain("surname");
        expect(text, look).not.toContain("broadcastName");
        expect(text, look).not.toContain("role");
      }
    }
  });
});
