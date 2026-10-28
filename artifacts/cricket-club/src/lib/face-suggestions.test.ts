import { describe, it, expect, vi } from "vitest";
import { personBoxFromFace, suggestUploadFocus, unionBox } from "./face-suggestions";

describe("suggestUploadFocus", () => {
  it("saves a suggestion for each photo with faces and skips the rest", async () => {
    const box = { x: 0.2, y: 0.1, w: 0.3, h: 0.4 };
    const suggest = vi.fn(async (src: string) => {
      if (src === "/broken") throw new Error("unreadable");
      return src === "/faces" ? box : null;
    });
    const save = vi.fn(async () => ({}));
    const n = await suggestUploadFocus(
      [
        { id: 1, url: "/faces" },
        { id: 2, url: "/no-faces" },
        { id: 3, url: "/broken" },
        { id: 4, url: "/faces" },
      ],
      save,
      suggest,
    );
    expect(n).toBe(2);
    expect(save.mock.calls).toEqual([
      [1, box],
      [4, box],
    ]);
  });

  it("keeps going when a save fails", async () => {
    const box = { x: 0, y: 0, w: 0.5, h: 0.5 };
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
    const n = await suggestUploadFocus(
      [
        { id: 1, url: "/a" },
        { id: 2, url: "/b" },
      ],
      save,
      async () => box,
    );
    expect(n).toBe(1);
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe("the suggested box", () => {
  it("covers everyone found, head to about the waist", () => {
    const faces = [
      { x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
      { x: 0.6, y: 0.25, w: 0.1, h: 0.1 },
    ];
    expect(unionBox(faces.map(personBoxFromFace))).toEqual({ x: 0.1, y: 0.15, w: 0.7, h: 0.5 });
  });
});
