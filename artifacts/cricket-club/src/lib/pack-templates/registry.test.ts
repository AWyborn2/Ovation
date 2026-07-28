import { describe, it, expect } from "vitest";
import {
  DEFAULT_PACK_ID,
  getPackManifest,
  isRegisteredPack,
  listPackManifests,
} from "./registry";
import { BROADCAST_DARK_PACK } from "./broadcast-dark";
import { renderPackCard, packSupportsKind, PACK_DEFAULT_TOKENS } from "../pack-render";
import { sampleCardInput } from "../sample-card-inputs";
import type { CardSize, ShareCardInput } from "../share-card";

/**
 * Phase 2 — the renderer selects a pack by id instead of being hard-wired to
 * Pack A. The load-bearing property is that this change is *invisible* for
 * Pack A: every existing caller omits `packId` and must render exactly what it
 * rendered before.
 */

describe("pack registry", () => {
  it("registers Pack A as the default", () => {
    expect(DEFAULT_PACK_ID).toBe("broadcast-dark-v1");
    expect(getPackManifest(DEFAULT_PACK_ID)).toBe(BROADCAST_DARK_PACK);
  });

  it("exposes every registered manifest with a unique id", () => {
    const ids = listPackManifests().map((p) => p.packId);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves a missing or unknown id to the default pack", () => {
    // A card_templates row can outlive the pack it names (withdrawn pack, stale
    // tenant row). Falling back keeps that harmless rather than blank.
    expect(getPackManifest(undefined)).toBe(BROADCAST_DARK_PACK);
    expect(getPackManifest(null)).toBe(BROADCAST_DARK_PACK);
    expect(getPackManifest("")).toBe(BROADCAST_DARK_PACK);
    expect(getPackManifest("no-such-pack-v9")).toBe(BROADCAST_DARK_PACK);
  });

  it("reports registration honestly", () => {
    expect(isRegisteredPack(DEFAULT_PACK_ID)).toBe(true);
    expect(isRegisteredPack("no-such-pack-v9")).toBe(false);
    expect(isRegisteredPack(null)).toBe(false);
    expect(isRegisteredPack(undefined)).toBe(false);
  });
});

describe("packId-aware resolution", () => {
  const KINDS = BROADCAST_DARK_PACK.designs.map((d) => d.kind);

  it("packSupportsKind agrees for omitted, default and unknown packId", () => {
    for (const kind of KINDS) {
      expect(packSupportsKind(kind), kind).toBe(true);
      expect(packSupportsKind(kind, DEFAULT_PACK_ID), kind).toBe(true);
      // Unknown id falls back to the default pack, so support is unchanged.
      expect(packSupportsKind(kind, "no-such-pack-v9"), kind).toBe(true);
    }
  });

  it("reports an unsupported kind as unsupported", () => {
    expect(packSupportsKind("notACardKind")).toBe(false);
    expect(packSupportsKind("notACardKind", DEFAULT_PACK_ID)).toBe(false);
  });
});

describe("Pack A parity across the packId refactor", () => {
  // The whole point of this refactor is that Pack A output does not move.
  const SIZES: CardSize[] = ["square", "portrait", "story"];
  const KINDS = [...new Set(BROADCAST_DARK_PACK.designs.map((d) => d.kind))];

  it("renders byte-identical html whether packId is omitted, default, or unknown", () => {
    for (const kind of KINDS) {
      const input = sampleCardInput(kind as ShareCardInput["kind"]);
      for (const size of SIZES) {
        for (const sponsorsOn of [true, false]) {
          const omitted = renderPackCard(
            input,
            size,
            sponsorsOn,
            PACK_DEFAULT_TOKENS,
            false,
          );
          const explicit = renderPackCard(
            input,
            size,
            sponsorsOn,
            PACK_DEFAULT_TOKENS,
            false,
            undefined,
            DEFAULT_PACK_ID,
          );
          const unknown = renderPackCard(
            input,
            size,
            sponsorsOn,
            PACK_DEFAULT_TOKENS,
            false,
            undefined,
            "no-such-pack-v9",
          );
          const ctx = `${kind} ${size} sponsors=${sponsorsOn}`;
          expect(explicit, ctx).toBe(omitted);
          expect(unknown, ctx).toBe(omitted);
          expect(omitted.length, ctx).toBeGreaterThan(0);
        }
      }
    }
  });
});
