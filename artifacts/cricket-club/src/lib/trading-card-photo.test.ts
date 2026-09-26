/**
 * The trading card shows the same photo the player's profile does: a chosen
 * gallery image, else the headshot, else a library photo the player is tagged
 * in, and only then the drawn avatar.
 */
import { describe, it, expect } from "vitest";
import type { PlayerDetail } from "@workspace/api-client-react";
import { buildTradingCardData } from "./trading-card";

const player = (over: Partial<PlayerDetail> = {}): PlayerDetail =>
  ({
    id: 42,
    givenName: "Jack",
    surname: "Manuel",
    gradesPlayed: "A Grade",
    deceased: false,
    imageUrl: null,
    libraryPhotoUrl: null,
    stats: [],
    premierships: [],
    ...over,
  }) as PlayerDetail;

describe("trading card photo", () => {
  it("uses a library photo the player is tagged in when there is no headshot", () => {
    const d = buildTradingCardData(
      player({ libraryPhotoUrl: "/api/storage/objects/library/jack" }),
      [],
    );
    expect(d.photoUrl).toBe("/api/storage/objects/library/jack");
    expect(d.usingFallback).toBe(false);
  });

  it("prefers the headshot, and a chosen gallery image over both", () => {
    const p = player({
      imageUrl: "/api/storage/objects/headshot",
      libraryPhotoUrl: "/api/storage/objects/library/jack",
    });
    expect(buildTradingCardData(p, []).photoUrl).toBe("/api/storage/objects/headshot");
    expect(buildTradingCardData(p, [], "/api/storage/objects/chosen").photoUrl).toBe(
      "/api/storage/objects/chosen",
    );
  });

  it("falls back to the drawn avatar only with no photo at all", () => {
    const d = buildTradingCardData(player(), []);
    expect(d.usingFallback).toBe(true);
  });
});
