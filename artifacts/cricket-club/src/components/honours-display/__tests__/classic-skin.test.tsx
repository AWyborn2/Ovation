import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { BoardRenderer } from "../board-renderer";
import { KioskChromeContext } from "../kiosk-chrome";
import { TEMPLATES, isBuiltinSkin, skinClass } from "../types";
import type { DisplayBoard, HonourBrand } from "../types";

afterEach(cleanup);

const CSS = readFileSync(
  join(__dirname, "..", "..", "..", "styles", "honour-boards.css"),
  "utf8",
).replace(/\r\n/g, "\n");

const brand = { name: "Test Club", monogram: "TC" } as HonourBrand;
const board: DisplayBoard = {
  id: "life",
  category: "life-members",
  layout: "list",
  title: "Life Members",
  entries: [{ primaryText: "A Member", season: "2024/25" }],
  display: { columns: 1, transition: "scroll", fit: false },
};

describe("P12 · Classic Honour Board skin (kiosk redesign A3)", () => {
  it("is a built-in skin with its own class", () => {
    expect(TEMPLATES.find((t) => t.id === "p12")?.label).toBe("P12 · Classic Honour Board");
    expect(isBuiltinSkin("p12")).toBe(true);
    expect(skinClass("p12")).toBe("skin-p12");
  });

  it("sets Cinzel titles and Cormorant Garamond names", () => {
    expect(CSS).toMatch(/\.skin-p12 \{[^}]*--hb-title-font: "Cinzel"/);
    expect(CSS).toMatch(/\.skin-p12 \{[^}]*--hb12-name-font: "Cormorant Garamond"/);
  });

  it("shows page dots and the board footer from the player", () => {
    const { container } = render(
      <KioskChromeContext.Provider
        value={{ page: { index: 1, count: 3 }, position: { index: 0, count: 4 } }}
      >
        <BoardRenderer board={board} brand={brand} kiosk />
      </KioskChromeContext.Provider>,
    );
    const dots = container.querySelectorAll(".hb-head .hb-kp-dots i");
    expect(dots).toHaveLength(3);
    expect([...dots].map((d) => d.className)).toEqual(["", "on", ""]);
    expect(container.querySelector(".hb-kp-foot")?.textContent).toBe("Board 1 of 4");
  });

  it("renders no dots or footer off the kiosk", () => {
    const { container } = render(<BoardRenderer board={board} brand={brand} />);
    expect(container.querySelector(".hb-kp-dots")).toBeNull();
    expect(container.querySelector(".hb-kp-foot")).toBeNull();
  });

  it("hides the chrome in every other skin", () => {
    expect(CSS).toMatch(/\.hb-kp-dots,\s*\.hb-kp-foot \{\s*display: none;/);
  });
});
