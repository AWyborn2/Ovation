import { describe, it, expect } from "vitest";
import { resolveClubLook } from "@workspace/scorecard/kiosk-display";
import type { KioskLook } from "@workspace/api-client-react";
import { motionDefaults, withoutMotion } from "./tv-motion-fields";

const LEGACY = { kioskDwellMs: 8000, kioskEndHoldMs: 2000, kioskScrollSpeed: 50 };
const resolve = (kioskLook: KioskLook) => resolveClubLook({ ...LEGACY, kioskLook });

describe("TV motion field helpers (kiosk redesign B3)", () => {
  it("gives each set field the value it would fall back to", () => {
    const d = motionDefaults({ move: "pages", pageSecs: 12 }, resolve);
    // pageSecs falls back to the legacy 8 s dwell, move to the built-in credits roll.
    expect(d.pageSecs).toBe(8);
    expect(d.move).toBe("credits");
    // Unset fields report what applies now.
    expect(d.hold).toBe(2);
    expect(d.speed).toBe(50);
  });

  it("reset clears only the motion fields", () => {
    expect(
      withoutMotion({ move: "fit", size: "XL", heading: "Club Champions", textSize: "lg" }),
    ).toEqual({ heading: "Club Champions", textSize: "lg" });
  });
});
