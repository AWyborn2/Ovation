import { describe, expect, it } from "vitest";
import { ceilToStep, dayCount, gapOk, placeCard, slotOccurrences } from "./posting-placement";
import type { PostingKind } from "./posting-schedule";

// Perth is UTC+8 all year. Thursday 15 Oct 2026; Saturday 17; Sunday 18.
const perth = (local: string) => new Date(`${local}:00+08:00`);
const DAY = 24 * 60 * 60 * 1000;

const sunday6pm = (collision: PostingKind["collision"]): PostingKind => ({
  slots: [{ day: 0, time: "18:00" }],
  collision,
});

function place(
  kind: PostingKind,
  opts: {
    taken?: Date[];
    sameKindTaken?: Date[];
    now?: Date;
    dailyCap?: number;
    gap?: number;
    horizonEnd?: Date;
  } = {},
): Date | null {
  const now = opts.now ?? perth("2026-10-17T12:00");
  return placeCard({
    kind,
    dailyCap: opts.dailyCap ?? 4,
    minGapMinutes: opts.gap ?? 45,
    taken: opts.taken ?? [],
    sameKindTaken: opts.sameKindTaken ?? opts.taken ?? [],
    now,
    horizonEnd: opts.horizonEnd ?? new Date(now.getTime() + 14 * DAY),
  });
}

/** Place `n` cards one after another, each seeing the ones before it. */
function placeMany(kind: PostingKind, n: number, opts: Parameters<typeof place>[1] = {}) {
  const taken: Date[] = [...(opts.taken ?? [])];
  const out: (Date | null)[] = [];
  for (let i = 0; i < n; i++) {
    const at = place(kind, { ...opts, taken, sameKindTaken: [...taken] });
    out.push(at);
    if (at) taken.push(at);
  }
  return out;
}

describe("placeCard", () => {
  it("spaces three milestones within the Sunday 6pm slot by the gap (AE1)", () => {
    const placed = placeMany(sunday6pm("space"), 3);
    expect(placed).toEqual([
      perth("2026-10-18T18:00"),
      perth("2026-10-18T18:45"),
      perth("2026-10-18T19:30"),
    ]);
  });

  it("rolls the second debut to the next slot (AE2)", () => {
    const kind: PostingKind = {
      slots: [
        { day: 0, time: "18:00" },
        { day: 3, time: "18:00" },
      ],
      collision: "roll",
    };
    expect(placeMany(kind, 2)).toEqual([perth("2026-10-18T18:00"), perth("2026-10-21T18:00")]);
  });

  it("moves a card to its next slot on a day under the cap (AE3)", () => {
    const sunday = ["10:00", "12:00", "14:00", "16:00"].map((t) => perth(`2026-10-18T${t}`));
    const kind: PostingKind = {
      slots: [
        { day: 0, time: "18:00" },
        { day: 1, time: "18:00" },
      ],
      collision: "space",
    };
    expect(place(kind, { taken: sunday, sameKindTaken: [] })).toEqual(perth("2026-10-19T18:00"));
  });

  it("keeps the gap from other kinds' posts", () => {
    const other = [perth("2026-10-18T18:15")];
    // 18:00 is 15 minutes from 18:15; 18:30 is 15; 18:45 is 30; 19:00 is the first 45 clear.
    expect(place(sunday6pm("space"), { taken: other, sameKindTaken: [] })).toEqual(
      perth("2026-10-18T19:00"),
    );
  });

  it("never spaces past club midnight", () => {
    const kind: PostingKind = { slots: [{ day: 0, time: "23:30" }], collision: "space" };
    const placed = placeMany(kind, 2);
    expect(placed[0]).toEqual(perth("2026-10-18T23:30"));
    // The second can't fit before midnight, so it takes the following Sunday.
    expect(placed[1]).toEqual(perth("2026-10-25T23:30"));
  });

  it("counts a slot at 00:30 club time toward that club day, not the UTC date", () => {
    const kind: PostingKind = { slots: [{ day: 0, time: "00:30" }], collision: "space" };
    // Sunday 00:30 Perth is Saturday 16:30 UTC.
    const at = place(kind, { now: perth("2026-10-17T12:00") });
    expect(at).toEqual(perth("2026-10-18T00:30"));
    expect(at?.toISOString()).toBe("2026-10-17T16:30:00.000Z");
    expect(dayCount(perth("2026-10-18T09:00"), [at as Date])).toBe(1);
    expect(dayCount(perth("2026-10-17T23:00"), [at as Date])).toBe(0);
  });

  it("skips slots that passed more than an hour ago", () => {
    // Sunday 20:00: the 18:00 slot is two hours gone, so next Sunday.
    expect(place(sunday6pm("space"), { now: perth("2026-10-18T20:00") })).toEqual(
      perth("2026-10-25T18:00"),
    );
  });

  it("still uses a slot that passed within the hour, at the next 15-minute mark", () => {
    // A round set drafted at 12:05 for a Friday 12pm slot goes at 12:15, not next Friday.
    const kind: PostingKind = { slots: [{ day: 5, time: "12:00" }], collision: "roll" };
    expect(place(kind, { now: perth("2026-10-16T12:05") })).toEqual(perth("2026-10-16T12:15"));
  });

  it("returns null when the kind has no slots", () => {
    expect(place({ slots: [], collision: "space" })).toBeNull();
  });

  it("never places past the horizon (the card's expiry)", () => {
    const now = perth("2026-10-17T12:00");
    // Five cards, cap 4 on Sunday, expiry Monday: the fifth can't make next Sunday.
    const placed = placeMany(sunday6pm("space"), 5, {
      now,
      gap: 0,
      horizonEnd: perth("2026-10-19T12:00"),
    });
    expect(placed.slice(0, 4).every((p) => p !== null)).toBe(true);
    expect(placed[4]).toBeNull();
  });

  it("returns null when the horizon has already passed", () => {
    const now = perth("2026-10-17T12:00");
    expect(place(sunday6pm("space"), { now, horizonEnd: perth("2026-10-17T11:00") })).toBeNull();
  });
});

describe("helpers", () => {
  it("rounds up to the next 15-minute mark", () => {
    expect(ceilToStep(perth("2026-10-18T18:52"))).toEqual(perth("2026-10-18T19:00"));
    expect(ceilToStep(perth("2026-10-18T18:45"))).toEqual(perth("2026-10-18T18:45"));
  });

  it("lists slot occurrences in order across weeks", () => {
    const kind: PostingKind = {
      slots: [
        { day: 3, time: "18:00" },
        { day: 0, time: "09:00" },
      ],
      collision: "space",
    };
    expect(slotOccurrences(kind, perth("2026-10-17T00:00"), perth("2026-10-25T23:00"))).toEqual([
      perth("2026-10-18T09:00"),
      perth("2026-10-21T18:00"),
      perth("2026-10-25T09:00"),
    ]);
  });

  it("allows any spacing with a zero gap", () => {
    const t = perth("2026-10-18T18:00");
    expect(gapOk(t, [t], 0)).toBe(true);
    expect(gapOk(t, [t], 15)).toBe(false);
  });
});
