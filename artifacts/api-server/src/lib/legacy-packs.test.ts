/**
 * P9 — the four legacy design packs are hidden from the card template listing,
 * and a club whose stored default names one reads Club Kit. Pure; no database.
 */
import { describe, expect, it } from "vitest";
import { resolvePackIdForKind } from "@workspace/scorecard";
import { LEGACY_PACK_IDS } from "@workspace/scorecard/queued-carousel";
import { hideLegacyPackRows, isLegacyPackRow } from "./legacy-packs";

type Row = {
  id: number;
  source: string;
  packId: string | null;
  packVariant: string | null;
  cardKinds: string[];
  isActive: boolean;
  isDefault: boolean;
  defaultForKinds: string[];
};

let nextId = 1;
const packRows = (packId: string, over: Partial<Row> = {}): Row[] =>
  ["square", "portrait", "story", "landscape"].map((packVariant) => ({
    id: nextId++,
    source: "pack",
    packId,
    packVariant,
    cardKinds: [],
    isActive: true,
    isDefault: false,
    defaultForKinds: [],
    ...(packVariant === "square" ? over : {}),
  }));

describe("hideLegacyPackRows", () => {
  it("lists no legacy pack row, and keeps every other row", () => {
    const byo: Row = { ...packRows("x")[0], source: "background", packId: null };
    const rows = [
      ...packRows("broadcast-dark-v1"),
      ...LEGACY_PACK_IDS.flatMap((id) => packRows(id)),
      ...packRows("club-kit-v1"),
      byo,
    ];
    const listed = hideLegacyPackRows(rows);
    expect(listed.some(isLegacyPackRow)).toBe(false);
    expect(listed.map((r) => r.packId)).not.toEqual(expect.arrayContaining([...LEGACY_PACK_IDS]));
    expect(listed).toHaveLength(rows.length - LEGACY_PACK_IDS.length * 4);
    expect(listed).toContain(byo);
  });

  it.each(LEGACY_PACK_IDS)("shows a stored %s default as Club Kit, without mutating rows", (id) => {
    const rows = [
      ...packRows("broadcast-dark-v1", { defaultForKinds: ["result"] }),
      ...packRows(id, { defaultForKinds: ["matchDay", "teamList"] }),
      ...packRows("club-kit-v1", { defaultForKinds: ["ladder"] }),
    ];
    const before = structuredClone(rows);
    const listed = hideLegacyPackRows(rows);
    expect(rows).toEqual(before);
    const kit = listed.filter((r) => r.packId === "club-kit-v1" && r.defaultForKinds.length);
    expect(kit).toHaveLength(1);
    expect(kit[0].defaultForKinds).toEqual(["ladder", "matchDay", "teamList"]);
    expect(resolvePackIdForKind(listed, "matchDay")).toBe("club-kit-v1");
    expect(resolvePackIdForKind(listed, "teamList")).toBe("club-kit-v1");
    expect(resolvePackIdForKind(listed, "result")).toBe("broadcast-dark-v1");
  });

  it("carries a legacy row's old global default over to Club Kit", () => {
    const listed = hideLegacyPackRows([
      ...packRows("broadcast-dark-v1"),
      ...packRows("sunset-v1", { isDefault: true }),
      ...packRows("club-kit-v1"),
    ]);
    expect(listed.filter((r) => r.isDefault).map((r) => r.packId)).toEqual(["club-kit-v1"]);
    expect(resolvePackIdForKind(listed, "century")).toBe("club-kit-v1");
  });

  it("ignores an inactive legacy row's claim, which never resolved", () => {
    const listed = hideLegacyPackRows([
      ...packRows("neon-night-v1", { isActive: false, defaultForKinds: ["matchDay"] }),
      ...packRows("club-kit-v1"),
    ]);
    expect(listed.every((r) => r.defaultForKinds.length === 0)).toBe(true);
  });
});
